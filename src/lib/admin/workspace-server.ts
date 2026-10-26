import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema as s, type Db as Database, type Tx } from '@/db';
import { ensureCatalogSeeded } from '@/db/seed';
import { issueInvite, type Admin } from '@/lib/admin-auth';
import { recordAudit } from '@/lib/audit-server';
import { products as builtInProducts, sizes } from '@/lib/catalog';
import { updateOrderIn, type OrderStatus, type PaymentStatus } from '@/lib/commerce-server';
import { config, shiprocketEnabled } from '@/lib/config';
import { queueMail, type Mail } from '@/lib/mail-server';
import { isAllowedMediaSource } from '@/lib/media';
import { setting } from '@/lib/records-server';
import { sendToShiprocket } from '@/lib/shiprocket-server';
import { accessFor, allows, isOwner, type AccessMap } from './access-server';
import { DB_VERSION, seed } from './seed';
import type { AdminProduct, AuditEntry, Collection, Customer, Db, Enquiry, Homepage, Member, Order, Row, Settings, Sku } from './types';

/** Thrown for changes the admin can fix; the message is shown to them. */
export class WorkspaceError extends Error {}

/** Sections stored as generic records (coupons, journal, shipping, payment methods, roles, reviews). */
const RECORD_LISTS = ['coupons', 'reviews', 'posts', 'zones', 'partners', 'methods', 'roles'] as const;
type RecordList = typeof RECORD_LISTS[number];
const isRecordList = (list: string): list is RecordList => (RECORD_LISTS as readonly string[]).includes(list);
const TABLE_LISTS = ['products', 'skus', 'collections', 'orders', 'customers', 'team', 'enquiries'];
const SEEDED = 'admin_seeded', CLAIMED = 'admin_workspace_claimed';
const DRAFT_COLOR = '#7a6a55';
const BUILT_IN = new Set(builtInProducts.map(p => p.id));
const ORDER_STATUSES = ['Pending payment', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'] as const;
const PAYMENT_STATUSES = ['Paid', 'Pending', 'Failed', 'Refunded'] as const;

// ---- Validation -----------------------------------------------------------------------------

const text = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().min(1).max(100);
const email = z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address');
const productSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/), name: text(150), family: z.enum(['Oud', 'Woody', 'Floral', 'Citrus']), mood: text(150),
  description: text(3000), price: z.number().int().min(1).max(1000000), image: z.string().refine(isAllowedMediaSource),
  badge: z.string().max(50).optional(), status: z.enum(['Active', 'Draft']),
});
const skuSchema = z.object({
  id, productId: id, size: z.union([z.literal(sizes[0]), z.literal(sizes[1]), z.literal(sizes[2])]), sku: text(30), price: z.number().int().min(1).max(1000000),
  stock: z.number().int().min(-100000).max(100000), threshold: z.number().int().min(0).max(1000),
}).refine(v => v.id === `${v.productId}-${v.size}`, 'Sizes keep the id of their product and size.');
const collectionSchema = z.object({
  id, name: text(60), description: z.string().max(300).default(''), position: z.number().int().min(1).max(99),
  featured: z.boolean(), status: z.enum(['Visible', 'Hidden']),
});
const customerSchema = z.object({
  id, name: text(100), email, phone: z.string().trim().max(20).default(''), city: z.string().trim().max(60).default(''),
  tag: z.enum(['VIP', 'Regular', 'New']).default('New'), status: z.enum(['Active', 'Blocked']).default('Active'),
});
const orderSchema = z.object({
  id, customer: text(100), email, skuId: id.optional(), qty: z.number().int().min(1).max(10).default(1), payment: z.string().trim().max(40).default(''),
  status: z.enum(ORDER_STATUSES).default('Processing'), paid: z.enum(PAYMENT_STATUSES).default('Pending'),
  /** Set by the "Send to Shiprocket" action. */
  ship: z.literal('send').optional(),
});
const memberSchema = z.object({ id, name: text(100), email, role: text(60), status: z.enum(['Invited', 'Active', 'Suspended']), reinvite: z.boolean().optional() });
const json = (max: number) => z.record(z.string(), z.unknown()).refine(v => JSON.stringify(v).length <= max, 'This entry is too large.');
const recordSchema = json(20000).and(z.object({ id }));
const listChange = z.object({ upsert: z.array(z.record(z.string(), z.unknown())).max(1000).default([]), remove: z.array(id).max(1000).default([]) });
export const changesSchema = z.object({
  lists: z.record(z.string(), listChange).default({}),
  objects: z.object({ homepage: json(20000).optional(), settings: json(20000).optional(), seen: z.string().max(4000).optional() }).default({}),
  audit: z.object({ action: z.string().min(1).max(120), target: z.string().max(200).default('') }).optional(),
});
export type Changes = z.infer<typeof changesSchema>;

function parse<T>(schema: z.ZodType<T>, value: unknown, noun: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new WorkspaceError(`Check the ${noun} details: ${result.error.issues[0]?.message ?? 'invalid value'}.`);
  return result.data;
}

// ---- Reading --------------------------------------------------------------------------------

/** Gives a new database the starting admin content: role templates, journal posts and default settings. */
async function ensureWorkspaceSeeded(database: Database | Tx) {
  await database.transaction(async tx => {
    const [first] = await tx.insert(s.meta).values({ key: SEEDED, value: new Date().toISOString() }).onConflictDoNothing().returning();
    if (!first) return;
    const start = seed();
    const records = (['roles', 'posts'] as const).flatMap(list => (start[list] as Row[]).map(row => ({ list, id: row.id, data: row })));
    await tx.insert(s.adminRecords).values(records).onConflictDoNothing();
    await tx.insert(s.adminSettings).values([{ key: 'homepage', data: start.homepage }, { key: 'settings', data: start.settings }, { key: 'seen', data: start.seen }]).onConflictDoNothing();
  });
}

const addressText = (a: s.OrderAddress | null) => a ? `${a.line}, ${a.city}, ${a.state} ${a.pincode}` : '';
function adminOrder(o: typeof s.orders.$inferSelect, items: (typeof s.orderItems.$inferSelect)[]): Order {
  const first = items[0];
  return {
    id: o.id, number: o.number, customer: o.name, email: o.email, phone: o.phone, address: addressText(o.address), coupon: o.couponCode ?? '',
    skuId: first ? `${first.productId}-${first.size}` : '',
    item: first ? `${first.name} · ${first.size}ml${items.length > 1 ? ` + ${items.length - 1} more` : ''}` : '',
    qty: items.reduce((sum, i) => sum + i.quantity, 0), amount: o.total,
    status: o.status as Order['status'], payment: o.paymentMethod || o.paymentProvider, paid: o.paymentStatus as Order['paid'], date: o.createdAt.toISOString(),
    shipping: o.awb ? [o.courier, o.awb].filter(Boolean).join(' · ') : o.shipRef ? `Shiprocket #${o.shipRef} · ${o.shipStatus || 'NEW'}` : o.shipError ? 'Not sent' : '',
    ...(o.shipError && !o.shipRef ? { shipError: o.shipError } : {}),
    canShip: shiprocketEnabled() && o.status === 'Processing' && !o.shipRef && !!o.address && o.paymentProvider !== 'test',
  };
}

export async function readWorkspace(admin: Admin): Promise<Db> {
  const database = await db();
  await ensureWorkspaceSeeded(database);
  const access = await accessFor(admin);
  const can = (list: string) => allows(access, list, 'view');
  const none = Promise.resolve([] as never[]);
  const [productRows, variantRows, collectionRows, recordRows, settingRows, auditRows, orderRows, itemRows, customerRows, adminRows, enquiryRows] = await Promise.all([
    database.select().from(s.products).orderBy(asc(s.products.position)),
    database.select().from(s.productVariants).orderBy(asc(s.productVariants.size)),
    database.select().from(s.collections).orderBy(asc(s.collections.position)),
    database.select().from(s.adminRecords).orderBy(desc(s.adminRecords.updatedAt)),
    database.select().from(s.adminSettings),
    can('audit') ? database.select().from(s.adminAudit).orderBy(desc(s.adminAudit.at)).limit(500) : none,
    can('orders') || allows(access, 'dashboard', 'view') ? database.select().from(s.orders).orderBy(desc(s.orders.number)).limit(5000) : none,
    can('orders') || allows(access, 'dashboard', 'view') ? database.select().from(s.orderItems).orderBy(asc(s.orderItems.line)) : none,
    can('customers') || allows(access, 'dashboard', 'view') ? database.select().from(s.customers).orderBy(desc(s.customers.createdAt)) : none,
    can('team') ? database.select().from(s.admins).orderBy(asc(s.admins.createdAt)) : none,
    can('enquiries') ? database.select().from(s.enquiries).orderBy(desc(s.enquiries.createdAt)).limit(2000) : none,
  ]);
  const start = seed();
  const settingOf = <T>(key: string, fallback: T): T => {
    const row = settingRows.find(r => r.key === key);
    return row ? (typeof fallback === 'object' ? { ...fallback, ...(row.data as object) } : row.data) as T : fallback;
  };
  const lists = Object.fromEntries(RECORD_LISTS.map(list => [list, can(list) || list === 'roles' ? recordRows.filter(r => r.list === list).map(r => ({ ...r.data, id: r.id })) : []]));
  const skus: Sku[] = productRows.flatMap(p => variantRows.filter(v => v.productId === p.id).map(v => ({ id: v.id, productId: p.id, product: p.name, size: v.size, sku: v.sku, price: v.price, stock: v.stock, threshold: v.threshold })));
  const itemsByOrder = new Map<string, (typeof s.orderItems.$inferSelect)[]>();
  for (const item of itemRows) { const list = itemsByOrder.get(item.orderId); if (list) list.push(item); else itemsByOrder.set(item.orderId, [item]); }
  return {
    ...(lists as Pick<Db, RecordList>),
    version: DB_VERSION,
    products: productRows.filter(p => !BUILT_IN.has(p.id)).map((p): AdminProduct => ({ id: p.id, name: p.name, family: p.family as AdminProduct['family'], mood: p.mood, description: p.description, price: p.price, image: p.image, ...(p.badge ? { badge: p.badge } : {}), status: p.published ? 'Active' : 'Draft' })),
    skus: can('skus') || allows(access, 'dashboard', 'view') ? skus : [],
    collections: collectionRows.map((c): Collection => ({ id: c.id, name: c.name, description: c.description, position: c.position, featured: c.featured, status: c.status === 'Hidden' ? 'Hidden' : 'Visible' })),
    // Roles that only see the dashboard get totals and dates, never who the customers are.
    orders: orderRows.map(o => { const row = adminOrder(o, itemsByOrder.get(o.id) ?? []); return can('orders') ? row : { ...row, customer: 'Customer', email: '', phone: '', address: '' }; }),
    customers: customerRows.map((c): Customer => can('customers')
      ? { id: c.id, name: c.name, email: c.email, phone: c.phone, city: c.city, tag: c.tag as Customer['tag'], status: c.status as Customer['status'], joined: c.createdAt.toISOString() }
      : { id: c.id, name: 'Customer', email: '', phone: '', city: '', tag: c.tag as Customer['tag'], status: c.status as Customer['status'], joined: c.createdAt.toISOString() }),
    team: adminRows.map((a): Member => ({ id: a.id, name: a.name, email: a.email, role: a.role, status: a.status as Member['status'], lastActive: a.lastActiveAt?.toISOString() ?? '' })),
    enquiries: enquiryRows.map((e): Enquiry => ({ id: e.id, kind: e.kind as Enquiry['kind'], name: e.name, email: e.email, subject: e.subject, message: e.message, handled: e.handled, date: e.createdAt.toISOString() })),
    audit: auditRows.map((a): AuditEntry => ({ id: a.id, at: a.at.toISOString(), actor: a.actor, action: a.action, target: a.target })),
    homepage: settingOf<Homepage>('homepage', start.homepage),
    settings: settingOf<Settings>('settings', start.settings),
    seen: settingOf<string>('seen', start.seen),
    access, me: { id: admin.id, name: admin.name, role: admin.role },
  };
}

export async function importable() {
  return !(await (await db()).select().from(s.meta).where(eq(s.meta.key, CLAIMED))).length;
}

// ---- Writing: catalogue ---------------------------------------------------------------------

async function upsertProduct(tx: Tx, row: unknown) {
  const p = parse(productSchema, row, 'product');
  if (BUILT_IN.has(p.id)) throw new WorkspaceError('Storefront products are edited from the product form.');
  const values = { name: p.name, family: p.family, mood: p.mood, description: p.description, price: p.price, image: p.image, badge: p.badge || null, status: p.status, published: p.status === 'Active', updatedAt: new Date() };
  await tx.insert(s.products).values({ id: p.id, position: 1000, color: DRAFT_COLOR, notes: [[], [], []], ...values })
    .onConflictDoUpdate({ target: s.products.id, set: values });
}

async function upsertSku(tx: Tx, row: unknown) {
  const v = parse(skuSchema, row, 'stock');
  const [product] = await tx.select({ id: s.products.id, published: s.products.published }).from(s.products).where(eq(s.products.id, v.productId));
  if (!product) throw new WorkspaceError('That product no longer exists. Reload the page.');
  const values = { sku: v.sku, price: v.price, stock: v.stock, threshold: v.threshold, updatedAt: new Date() };
  await tx.insert(s.productVariants).values({ id: v.id, productId: v.productId, size: v.size, ...values }).onConflictDoUpdate({ target: s.productVariants.id, set: values });
  return product.published;
}

async function upsertCollection(tx: Tx, row: unknown) {
  const c = parse(collectionSchema, row, 'collection');
  const values = { name: c.name, description: c.description, position: c.position, featured: c.featured, status: c.status, updatedAt: new Date() };
  await tx.insert(s.collections).values({ id: c.id, ...values }).onConflictDoUpdate({ target: s.collections.id, set: values });
}

async function upsertRecord(tx: Tx, list: RecordList, row: unknown) {
  const r = parse(recordSchema, row, list);
  await tx.insert(s.adminRecords).values({ list, id: r.id, data: r }).onConflictDoUpdate({ target: [s.adminRecords.list, s.adminRecords.id], set: { data: r, updatedAt: new Date() } });
}

// ---- Writing: orders and customers ----------------------------------------------------------

/** Existing orders change status through the order lifecycle; new rows become real (manual) orders. */
async function upsertOrder(tx: Tx, row: unknown, toShip: string[]) {
  const o = parse(orderSchema, row, 'order');
  const [existing] = await tx.select().from(s.orders).where(eq(s.orders.id, o.id));
  if (existing) {
    await updateOrderIn(tx, o.id, { status: o.status as OrderStatus, paymentStatus: o.paid as PaymentStatus });
    if (existing.name !== o.customer || existing.email !== o.email) await tx.update(s.orders).set({ name: o.customer, email: o.email, updatedAt: new Date() }).where(eq(s.orders.id, o.id));
    if (o.ship === 'send') toShip.push(o.id);
    return;
  }
  if (o.status === 'Pending payment') throw new WorkspaceError('Orders added here start as Processing or later.');
  const [variant] = o.skuId ? await tx.select({ v: s.productVariants, p: s.products }).from(s.productVariants).innerJoin(s.products, eq(s.products.id, s.productVariants.productId)).where(eq(s.productVariants.id, o.skuId)) : [];
  if (!variant) throw new WorkspaceError('Choose an item from the list.');
  const closed = o.status === 'Cancelled' || o.status === 'Refunded';
  if (!closed) {
    const [held] = await tx.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} - ${o.qty}`, updatedAt: new Date() })
      .where(and(eq(s.productVariants.id, variant.v.id), sql`(${s.productVariants.threshold} = 0 or ${s.productVariants.stock} >= ${o.qty})`)).returning({ id: s.productVariants.id });
    if (!held) throw new WorkspaceError(`Only ${Math.max(variant.v.stock, 0)} of ${variant.p.name} ${variant.v.size} ml in stock.`);
  }
  const settings = await setting('settings', tx);
  const subtotal = variant.v.price * o.qty, rate = Number(settings.gstRate) || 0, included = settings.pricesIncludeTax !== false;
  const tax = included ? Math.round(subtotal * rate / (100 + rate)) : Math.round(subtotal * rate / 100);
  const [customer] = await tx.select({ id: s.customers.id }).from(s.customers).where(eq(s.customers.email, o.email));
  const orderId = `SB-${o.id}`;
  await tx.insert(s.orders).values({
    id: orderId, customerId: customer?.id ?? null, requestId: `admin-${o.id}`, name: o.customer, email: o.email,
    status: o.status, paymentStatus: o.paid, paymentProvider: 'manual', paymentMethod: o.payment || 'Manual',
    subtotal, shipping: 0, tax, taxIncluded: included, total: subtotal + (included ? 0 : tax),
  });
  await tx.insert(s.orderItems).values({ orderId, line: 0, productId: variant.p.id, size: variant.v.size, quantity: o.qty, name: variant.p.name, image: variant.p.image, unitPrice: variant.v.price });
}

async function upsertCustomer(tx: Tx, row: unknown) {
  const c = parse(customerSchema, row, 'customer');
  const [clash] = await tx.select({ id: s.customers.id }).from(s.customers).where(and(eq(s.customers.email, c.email), ne(s.customers.id, c.id)));
  if (clash) throw new WorkspaceError('Another customer already uses this email.');
  const values = { name: c.name, email: c.email, phone: c.phone, city: c.city, tag: c.tag, status: c.status };
  await tx.insert(s.customers).values({ id: c.id, ...values }).onConflictDoUpdate({ target: s.customers.id, set: values });
  if (c.status === 'Blocked') await tx.delete(s.customerSessions).where(eq(s.customerSessions.customerId, c.id));
}

// ---- Writing: team --------------------------------------------------------------------------

async function activeOwners(tx: Tx, except?: string) {
  const [{ total }] = await tx.select({ total: count() }).from(s.admins).where(and(eq(s.admins.role, 'Owner'), eq(s.admins.status, 'Active'), except ? ne(s.admins.id, except) : sql`true`));
  return total;
}

async function inviteMail(tx: Tx, adminId: string, name: string, address: string, role: string, by: string, outbox: Mail[]) {
  const token = await issueInvite(tx, adminId);
  const link = `${config.siteUrl}/admin/invite?token=${token}`;
  outbox.push({ to: address, subject: 'You are invited to SENTBALE Admin', body: `Hello ${name},\n\n${by} has invited you to the SENTBALE admin panel as ${role}.\n\nSet your password here (the link works once, for 7 days):\n${link}\n` });
  return `Invitation for ${name}: ${link}`;
}

async function upsertMember(tx: Tx, row: unknown, admin: Admin, notices: string[], outbox: Mail[]) {
  const m = parse(memberSchema, row, 'team member');
  const roles = (await tx.select().from(s.adminRecords).where(eq(s.adminRecords.list, 'roles'))).map(r => String(r.data.name));
  if (!roles.includes(m.role) && m.role !== 'Owner') throw new WorkspaceError('Choose one of the roles in Roles & Permissions.');
  if (m.role === 'Owner' && !isOwner(admin)) throw new WorkspaceError('Only an Owner can make someone an Owner.');
  const [existing] = await tx.select().from(s.admins).where(eq(s.admins.id, m.id));
  if (!existing) {
    const [clash] = await tx.select({ id: s.admins.id }).from(s.admins).where(eq(s.admins.email, m.email));
    if (clash) throw new WorkspaceError('This email is already on the team.');
    await tx.insert(s.admins).values({ id: m.id, name: m.name, email: m.email, role: m.role, status: 'Invited' });
    notices.push(await inviteMail(tx, m.id, m.name, m.email, m.role, admin.name, outbox));
    return;
  }
  if (existing.role === 'Owner' && !isOwner(admin)) throw new WorkspaceError('Only an Owner can change another Owner.');
  if (existing.id === admin.id && (m.role !== existing.role || m.status !== existing.status)) throw new WorkspaceError('You cannot change your own role or status.');
  const status = existing.status === 'Invited' ? 'Invited' : m.status === 'Invited' ? existing.status : m.status;
  if (existing.role === 'Owner' && existing.status === 'Active' && (m.role !== 'Owner' || status !== 'Active') && (await activeOwners(tx, existing.id)) === 0) throw new WorkspaceError('The store needs at least one active Owner.');
  await tx.update(s.admins).set({ name: m.name, role: m.role, status, ...(existing.status === 'Invited' ? { email: m.email } : {}) }).where(eq(s.admins.id, m.id));
  if (status === 'Suspended') await tx.delete(s.adminSessions).where(eq(s.adminSessions.adminId, m.id));
  if (m.reinvite && existing.status === 'Invited') notices.push(await inviteMail(tx, m.id, m.name, existing.status === 'Invited' ? m.email : existing.email, m.role, admin.name, outbox));
}

async function removeMember(tx: Tx, memberId: string, admin: Admin) {
  if (memberId === admin.id) throw new WorkspaceError('You cannot remove yourself.');
  const [existing] = await tx.select().from(s.admins).where(eq(s.admins.id, memberId));
  if (!existing) return;
  if (existing.role === 'Owner' && !isOwner(admin)) throw new WorkspaceError('Only an Owner can remove another Owner.');
  if (existing.role === 'Owner' && existing.status === 'Active' && (await activeOwners(tx, memberId)) === 0) throw new WorkspaceError('The store needs at least one active Owner.');
  await tx.delete(s.admins).where(eq(s.admins.id, memberId));
}

// ---- Applying a save ------------------------------------------------------------------------

async function claim(tx: Tx) { await tx.insert(s.meta).values({ key: CLAIMED, value: new Date().toISOString() }).onConflictDoNothing(); }
async function touchCatalog(tx: Tx) { await tx.update(s.meta).set({ value: randomUUID() }).where(eq(s.meta.key, 'catalog_revision')); }

/**
 * Applies one admin save. Everything in it succeeds or nothing does. Returns whether storefront
 * products changed (so open storefront tabs refresh) and any messages for the admin, such as invite links.
 */
export async function applyChanges(admin: Admin, changes: Changes) {
  const access: AccessMap = await accessFor(admin);
  for (const [list, change] of Object.entries(changes.lists)) {
    if (list === 'audit' || (!change.upsert.length && !change.remove.length)) continue;
    if (!TABLE_LISTS.includes(list) && !isRecordList(list)) throw new WorkspaceError('Unknown admin section.');
    if (!allows(access, list, 'manage')) throw new WorkspaceError('Your role does not allow this change.');
  }
  for (const key of Object.keys(changes.objects)) if (!allows(access, key, 'manage')) throw new WorkspaceError('Your role does not allow this change.');

  // Invitation emails go out only once the save has committed, so a failed save never sends a dead link.
  const outbox: Mail[] = [];
  // Orders to send to Shiprocket; that runs after the commit, since the save holds a lock on each order row.
  const toShip: string[] = [];
  const result = await (await db()).transaction(async tx => {
    await claim(tx);
    let catalogChanged = false;
    const notices: string[] = [];
    // Products first, so sizes created alongside a new product have it to belong to.
    const order = ['products', ...Object.keys(changes.lists).filter(list => list !== 'products')];
    for (const list of order) {
      const change = changes.lists[list];
      if (!change || list === 'audit') continue;
      if (list === 'products') {
        for (const row of change.upsert) { await upsertProduct(tx, row); catalogChanged = true; }
        const doomed = change.remove.filter(id => !BUILT_IN.has(id));
        if (doomed.length) { await tx.delete(s.products).where(inArray(s.products.id, doomed)); catalogChanged = true; }
      } else if (list === 'skus') {
        for (const row of change.upsert) if (await upsertSku(tx, row)) catalogChanged = true;
        // Sizes are removed only with their product.
      } else if (list === 'collections') {
        for (const row of change.upsert) await upsertCollection(tx, row);
        if (change.remove.length) await tx.delete(s.collections).where(inArray(s.collections.id, change.remove));
      } else if (list === 'orders') {
        for (const row of change.upsert) { await upsertOrder(tx, row, toShip); catalogChanged = true; }
        if (change.remove.length) throw new WorkspaceError('Orders cannot be deleted. Cancel or refund them instead.');
      } else if (list === 'customers') {
        for (const row of change.upsert) await upsertCustomer(tx, row);
        if (change.remove.length) await tx.delete(s.customers).where(inArray(s.customers.id, change.remove));
      } else if (list === 'team') {
        for (const row of change.upsert) await upsertMember(tx, row, admin, notices, outbox);
        for (const memberId of change.remove) await removeMember(tx, memberId, admin);
      } else if (list === 'enquiries') {
        for (const row of change.upsert) await tx.update(s.enquiries).set({ handled: row.handled === true }).where(eq(s.enquiries.id, String(row.id)));
        if (change.remove.length) await tx.delete(s.enquiries).where(inArray(s.enquiries.id, change.remove));
      } else if (isRecordList(list)) {
        for (const row of change.upsert) await upsertRecord(tx, list, row);
        if (change.remove.length) await tx.delete(s.adminRecords).where(and(eq(s.adminRecords.list, list), inArray(s.adminRecords.id, change.remove)));
      }
    }
    for (const [key, data] of Object.entries(changes.objects)) {
      if (data === undefined) continue;
      await tx.insert(s.adminSettings).values({ key, data }).onConflictDoUpdate({ target: s.adminSettings.key, set: { data, updatedAt: new Date() } });
    }
    if (changes.audit) await recordAudit(tx, admin.name, changes.audit.action, changes.audit.target);
    if (catalogChanged) await touchCatalog(tx);
    return { catalogChanged, notices };
  });
  await queueMail(...outbox);
  for (const orderId of toShip) await sendToShiprocket(orderId);
  return result;
}

/**
 * One-time import of a workspace that was kept in this browser before the server stored it. Orders,
 * customers and team entered there were placeholders, so only content and catalogue settings come across.
 * Only allowed before the server workspace has been written to; invalid rows are skipped, not fatal.
 */
export async function importWorkspace(admin: Admin, data: Partial<Db>) {
  if (!isOwner(admin)) throw new WorkspaceError('Only an Owner can import a workspace.');
  return (await db()).transaction(async tx => {
    const [claimed] = await tx.insert(s.meta).values({ key: CLAIMED, value: new Date().toISOString() }).onConflictDoNothing().returning();
    if (!claimed) return null;
    let imported = 0, skipped = 0;
    // Each row runs in its own savepoint, so one bad row is skipped without aborting the import.
    const each = async (rows: unknown, save: (t: Tx, row: Row) => Promise<unknown>) => {
      for (const row of Array.isArray(rows) ? rows.slice(0, 5000) : []) {
        try { await tx.transaction(async t => save(t, row as Row)); imported++; } catch { skipped++; }
      }
    };
    for (const list of RECORD_LISTS) {
      if (!Array.isArray(data[list])) continue;
      await tx.delete(s.adminRecords).where(eq(s.adminRecords.list, list));
      await each(data[list], (t, row) => upsertRecord(t, list, row));
    }
    await each(data.products, (t, row) => upsertProduct(t, row));
    await each(data.skus, (t, row) => upsertSku(t, row));
    if (Array.isArray(data.collections) && data.collections.length) {
      await tx.delete(s.collections);
      await each(data.collections, (t, row) => upsertCollection(t, row));
      await ensureCatalogSeeded(tx);
    }
    for (const key of ['homepage', 'settings'] as const) {
      const value = data[key];
      if (value && typeof value === 'object' && JSON.stringify(value).length <= 20000) await tx.insert(s.adminSettings).values({ key, data: value }).onConflictDoUpdate({ target: s.adminSettings.key, set: { data: value, updatedAt: new Date() } });
    }
    const history = (Array.isArray(data.audit) ? data.audit : []).slice(0, 500).filter((a): a is AuditEntry => !!a && typeof a.action === 'string' && typeof a.at === 'string' && !Number.isNaN(Date.parse(a.at)));
    if (history.length) await tx.insert(s.adminAudit).values(history.map(a => ({ id: randomUUID(), at: new Date(a.at), actor: `${String(a.actor || 'Admin').slice(0, 80)} (browser)`, action: a.action.slice(0, 120), target: String(a.target || '').slice(0, 200) })));
    await recordAudit(tx, admin.name, 'Imported admin workspace from this browser', `${imported} records${skipped ? `, ${skipped} skipped` : ''}`);
    await touchCatalog(tx);
    return { imported, skipped };
  });
}

/**
 * "Clear workspace data": restores coupons, reviews, journal, shipping, payment methods, roles, homepage
 * wording and business settings to their starting state, deletes products added in the admin and clears
 * stock levels. Orders, customers, the team, storefront products, prices, images and the audit log are kept.
 */
export async function resetWorkspace(admin: Admin) {
  if (!isOwner(admin)) throw new WorkspaceError('Only an Owner can clear the workspace.');
  const database = await db();
  await database.transaction(async tx => {
    await tx.delete(s.adminRecords);
    await tx.delete(s.adminSettings);
    await tx.delete(s.products).where(notInArray(s.products.id, [...BUILT_IN]));
    await tx.update(s.productVariants).set({ stock: 0, threshold: 0, updatedAt: new Date() });
    await tx.delete(s.collections);
    await tx.delete(s.meta).where(eq(s.meta.key, SEEDED));
    await ensureCatalogSeeded(tx);
    await recordAudit(tx, admin.name, 'Cleared workspace data', 'Admin panel');
    await touchCatalog(tx);
  });
  await ensureWorkspaceSeeded(database);
}
