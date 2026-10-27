import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db, schema as s, type Db as Database, type Tx } from '@/db';
import { money, type Size } from './catalog';
import { config, razorpayEnabled, testPaymentsEnabled } from './config';
import { records, setting } from './records-server';
import { queueMail, type Mail } from './mail-server';
import { courierRates, parcelWeight, sendToShiprocket } from './shiprocket-server';
import type { Coupon, Zone } from './admin/types';

/** Shown to the shopper as-is. */
export class CheckoutError extends Error {}

export type CartItem = { id: string; size: Size; quantity: number };
export type Delivery = 'standard' | 'express';
export type PaymentChoice = 'test' | 'razorpay' | 'cod';
export type OrderStatus = 'Pending payment' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Refunded';
export type PaymentStatus = 'Pending' | 'Paid' | 'Failed' | 'Refunded';
type Source = Database | Tx;

const DEFAULT_DELIVERY = { standard: 0, express: 199, eta: '3–5 business days', expressEta: '1–2 business days' };
const EVERYWHERE = ['*', 'all', 'india', 'all india', 'rest of india', 'everywhere'];
/** Orders in these states no longer hold stock. */
const RELEASED: OrderStatus[] = ['Cancelled', 'Refunded'];

// ---- Input ----------------------------------------------------------------------------------

export function cartItems(value: unknown): CartItem[] {
  const items = value as CartItem[];
  if (!Array.isArray(items) || !items.length || items.length > 12
    || !items.every(l => l && typeof l.id === 'string' && Number.isInteger(l.size) && l.size >= 1 && l.size <= 10000 && Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= 10)
    || new Set(items.map(l => `${l.id}-${l.size}`)).size !== items.length) throw new CheckoutError('Check your bag quantities.');
  return items.map(({ id, size, quantity }) => ({ id, size, quantity }));
}

// ---- Rules ----------------------------------------------------------------------------------

const regionsOf = (zone: Zone) => String(zone.regions || '').split(/[,;\n]/).map(t => t.trim().toLowerCase()).filter(Boolean);

/** The active zone for a state: an exact match first, then a zone covering everywhere. */
export function zoneFor(zones: Zone[], state: string) {
  const active = zones.filter(z => z.status === 'Active');
  const wanted = state.trim().toLowerCase();
  return active.find(z => regionsOf(z).includes(wanted)) ?? active.find(z => regionsOf(z).some(t => EVERYWHERE.includes(t))) ?? null;
}

export function couponResult(coupons: Coupon[], code: string, subtotal: number, now = new Date()) {
  const wanted = code.trim().toUpperCase();
  const coupon = coupons.find(c => String(c.code).toUpperCase() === wanted);
  const fail = (message: string) => ({ coupon: null, discount: 0, freeShipping: false, message });
  if (!coupon) return fail('This code isn’t valid.');
  if (coupon.status !== 'Active') return fail('This code is no longer active.');
  if (coupon.expires && new Date(`${coupon.expires}T23:59:59+05:30`) < now) return fail('This code has expired.');
  if (Number(coupon.limit) > 0 && Number(coupon.used || 0) >= Number(coupon.limit)) return fail('This code has been fully redeemed.');
  if (subtotal < Number(coupon.minOrder || 0)) return fail(`Add ${money(Number(coupon.minOrder) - subtotal)} more to use this code.`);
  const value = Math.max(0, Number(coupon.value) || 0);
  const discount = coupon.type === 'Percent' ? Math.round(subtotal * Math.min(value, 100) / 100) : coupon.type === 'Flat' ? Math.min(value, subtotal) : 0;
  return { coupon, discount, freeShipping: coupon.type === 'Free shipping', message: 'Code applied.' };
}

// ---- Quote ----------------------------------------------------------------------------------

export type QuoteInput = { items: CartItem[]; delivery: Delivery; state?: string; pincode?: string; coupon?: string };

/** Everything checkout shows and charges, computed from the database. Never trusts client prices. */
export async function quote(input: QuoteInput, source?: Source) {
  const database = source ?? await db();
  const ids = [...new Set(input.items.map(i => i.id))];
  const [productRows, variantRows, coupons, zones, settings, methods] = await Promise.all([
    database.select().from(s.products).where(and(inArray(s.products.id, ids), eq(s.products.published, true))),
    database.select().from(s.productVariants).where(inArray(s.productVariants.productId, ids)),
    records('coupons', database), records('zones', database), setting('settings', database), records('methods', database),
  ]);
  const problems: string[] = [];
  const lines = input.items.flatMap(item => {
    const product = productRows.find(p => p.id === item.id);
    const variant = variantRows.find(v => v.productId === item.id && v.size === item.size);
    if (!product || !variant) { problems.push('An item in your bag is no longer available.'); return []; }
    if (variant.threshold > 0 && variant.stock < item.quantity) problems.push(variant.stock > 0 ? `Only ${variant.stock} of ${product.name} ${item.size} ml left.` : `${product.name} ${item.size} ml is sold out.`);
    return [{ ...item, variantId: variant.id, tracked: variant.threshold > 0, threshold: variant.threshold, name: product.name, image: product.image, unitPrice: variant.price }];
  });
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  const applied = input.coupon?.trim() ? couponResult(coupons, input.coupon, subtotal) : null;
  const discount = applied?.discount ?? 0;
  const zone = zones.some(z => z.status === 'Active') ? zoneFor(zones, input.state ?? '') : null;
  // With Shiprocket set up, a pincode gets live courier rates and couriers decide where we deliver;
  // shipping zones then only set free-delivery thresholds. Without it (or if it does not answer), zones price delivery.
  const live = input.pincode && lines.length ? await courierRates(input.pincode, parcelWeight(lines)) : null;
  const deliverable = live ? live !== 'none' : !input.state?.trim() || !zones.some(z => z.status === 'Active') || !!zone;
  const rates = live && live !== 'none' ? { standard: live.standard.price, express: live.express.price, eta: live.standard.eta, expressEta: live.express.eta }
    : zone ? { standard: Number(zone.standard) || 0, express: Number(zone.express) || 0, eta: zone.eta || DEFAULT_DELIVERY.eta, expressEta: DEFAULT_DELIVERY.expressEta }
    : DEFAULT_DELIVERY;
  const freeStandard = applied?.freeShipping || (!!zone && Number(zone.freeAbove) > 0 && subtotal - discount >= Number(zone.freeAbove));
  const options = [
    { id: 'standard' as const, label: 'Standard delivery', eta: rates.eta, price: freeStandard ? 0 : rates.standard },
    { id: 'express' as const, label: 'Express delivery', eta: rates.expressEta, price: applied?.freeShipping ? 0 : rates.express },
  ];
  const shipping = options.find(o => o.id === input.delivery)?.price ?? 0;

  const rate = Math.min(Math.max(Number(settings.gstRate) || 0, 0), 40);
  const taxIncluded = settings.pricesIncludeTax !== false;
  const taxable = subtotal - discount + shipping;
  const tax = taxIncluded ? Math.round(taxable * rate / (100 + rate)) : Math.round(taxable * rate / 100);
  const enabled = methods.filter(m => m.status === 'Enabled');
  return {
    lines, subtotal, discount, shipping, tax, taxRate: rate, taxIncluded, total: taxable + (taxIncluded ? 0 : tax),
    coupon: applied ? { code: input.coupon!.trim().toUpperCase(), applied: !!applied.coupon, message: applied.message, id: applied.coupon?.id } : null,
    delivery: options, deliverable, zone: zone?.name ?? null, problems,
    payments: {
      razorpay: razorpayEnabled(), test: testPaymentsEnabled(),
      cod: enabled.some(m => /^(cod|cash on delivery)$/i.test(String(m.name).trim()) || /cash on delivery/i.test(String(m.provider))),
      methods: enabled.map(m => String(m.name)),
    },
  };
}
export type Quote = Awaited<ReturnType<typeof quote>>;

// ---- Orders ---------------------------------------------------------------------------------

export type PlaceOrder = {
  customer: { id: string; email: string }; requestId: string; name: string; phone: string;
  address: s.OrderAddress; delivery: Delivery; coupon?: string; payment: PaymentChoice; items: CartItem[];
};

async function withItems(order: typeof s.orders.$inferSelect, source: Source) {
  const items = await source.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id)).orderBy(asc(s.orderItems.line));
  return { order, items };
}

/** Stock and coupon use come back when an order that never completed, or was refunded, is closed. */
async function release(tx: Tx, order: typeof s.orders.$inferSelect) {
  const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id));
  for (const item of items) {
    await tx.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} + ${item.quantity}`, updatedAt: new Date() })
      .where(and(eq(s.productVariants.productId, item.productId), eq(s.productVariants.size, item.size), sql`${s.productVariants.threshold} > 0`));
  }
  if (order.couponCode && order.paymentStatus !== 'Paid') await changeCouponUse(tx, order.couponCode, -1);
}

async function changeCouponUse(tx: Tx, code: string, by: 1 | -1) {
  const used = sql`coalesce((${s.adminRecords.data}->>'used')::int, 0)`;
  const limit = sql`coalesce((${s.adminRecords.data}->>'limit')::int, 0)`;
  const rows = await tx.update(s.adminRecords)
    .set({ data: sql`jsonb_set(${s.adminRecords.data}, '{used}', to_jsonb(greatest(${used} + ${by}, 0)))`, updatedAt: new Date() })
    .where(and(eq(s.adminRecords.list, 'coupons'), sql`upper(${s.adminRecords.data}->>'code') = ${code.toUpperCase()}`, by > 0 ? sql`(${limit} = 0 or ${used} < ${limit})` : sql`true`))
    .returning({ id: s.adminRecords.id });
  return rows.length > 0;
}

/** Holds stock for each line, or fails the whole order if any size has run out. */
async function reserve(tx: Tx, lines: Quote['lines']) {
  for (const line of lines) {
    const [held] = await tx.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} - ${line.quantity}`, updatedAt: new Date() })
      .where(and(eq(s.productVariants.id, line.variantId), or(eq(s.productVariants.threshold, 0), sql`${s.productVariants.stock} >= ${line.quantity}`)))
      .returning({ stock: s.productVariants.stock, threshold: s.productVariants.threshold });
    if (!held) throw new CheckoutError(`${line.name} ${line.size} ml has just sold out. Please update your bag.`);
  }
}

/** Unpaid online orders whose hold has run out are closed, returning their stock. */
export async function expireUnpaid() {
  const database = await db();
  const stale = await database.select().from(s.orders).where(and(eq(s.orders.status, 'Pending payment'), lt(s.orders.expiresAt, new Date())));
  for (const order of stale) await updateOrder(order.id, { status: 'Cancelled', paymentStatus: 'Failed' });
}

export async function placeOrder(input: PlaceOrder) {
  if (input.payment === 'razorpay' && !razorpayEnabled()) throw new CheckoutError('Online payment is not available right now.');
  if (input.payment === 'test' && !testPaymentsEnabled()) throw new CheckoutError('Test payments are turned off on this store.');
  await expireUnpaid();
  const database = await db();
  const id = `${input.payment === 'test' ? 'DEMO' : 'SB'}-${randomUUID()}`;
  const result = await database.transaction(async tx => {
    const [existing] = await tx.select().from(s.orders).where(and(eq(s.orders.customerId, input.customer.id), eq(s.orders.requestId, input.requestId)));
    if (existing) return { ...(await withItems(existing, tx)), created: false };
    // Delivery is priced for the address being shipped to.
    const priced = await quote({ ...input, state: input.address.state, pincode: input.address.pincode }, tx);
    if (priced.problems.length) throw new CheckoutError(priced.problems[0]);
    if (!priced.deliverable) throw new CheckoutError(`We don’t deliver to ${input.address.state} yet.`);
    if (priced.coupon && !priced.coupon.applied) throw new CheckoutError(priced.coupon.message);
    if (input.payment === 'cod' && !priced.payments.cod) throw new CheckoutError('Cash on delivery is not available.');
    await reserve(tx, priced.lines);
    if (priced.coupon?.applied && !(await changeCouponUse(tx, priced.coupon.code, 1))) throw new CheckoutError('This code has been fully redeemed.');
    const online = input.payment === 'razorpay';
    const [order] = await tx.insert(s.orders).values({
      id, customerId: input.customer.id, requestId: input.requestId, name: input.name, email: input.customer.email, phone: input.phone,
      address: input.address, delivery: input.delivery,
      status: online ? 'Pending payment' : 'Processing', paymentStatus: input.payment === 'test' ? 'Paid' : 'Pending',
      paymentProvider: input.payment, paymentMethod: input.payment === 'cod' ? 'Cash on delivery' : input.payment === 'test' ? 'Test payment' : 'Razorpay',
      subtotal: priced.subtotal, discount: priced.discount, couponCode: priced.coupon?.applied ? priced.coupon.code : null,
      shipping: priced.shipping, tax: priced.tax, taxIncluded: priced.taxIncluded, total: priced.total,
      expiresAt: online ? new Date(Date.now() + config.holdMinutes * 60000) : null,
    }).returning();
    const items = await tx.insert(s.orderItems).values(priced.lines.map((l, line) => ({ orderId: id, line, productId: l.id, size: l.size, quantity: l.quantity, name: l.name, image: l.image, unitPrice: l.unitPrice }))).returning();
    return { order, items, created: true };
  });
  if (result.created && result.order.status === 'Processing') {
    await announceOrder(result.order.id);
    if (result.order.paymentProvider === 'cod') await sendToShiprocket(result.order.id);
  }
  return result;
}

/**
 * The one place order state changes: the admin, payment confirmations and expiry all come through here,
 * so stock and coupon use always follow the order.
 */
export async function updateOrder(orderId: string, patch: OrderPatch) {
  return (await db()).transaction(tx => updateOrderIn(tx, orderId, patch));
}
export type OrderPatch = { status?: OrderStatus; paymentStatus?: PaymentStatus; paymentId?: string };
/** Same as updateOrder, inside a transaction the caller already holds. */
export async function updateOrderIn(tx: Tx, orderId: string, patch: OrderPatch) {
  const [order] = await tx.select().from(s.orders).where(eq(s.orders.id, orderId)).for('update');
  if (!order) return null;
  const status = patch.status ?? order.status as OrderStatus;
  const wasHeld = !RELEASED.includes(order.status as OrderStatus), nowHeld = !RELEASED.includes(status);
  if (wasHeld && !nowHeld) await release(tx, order);
  if (!wasHeld && nowHeld) {
    // Reopening a closed order takes its stock again; it may go below zero, which Inventory then shows.
    const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id));
    for (const item of items) await tx.update(s.productVariants).set({ stock: sql`${s.productVariants.stock} - ${item.quantity}`, updatedAt: new Date() }).where(and(eq(s.productVariants.productId, item.productId), eq(s.productVariants.size, item.size), sql`${s.productVariants.threshold} > 0`));
  }
  const [updated] = await tx.update(s.orders).set({ status, paymentStatus: patch.paymentStatus ?? order.paymentStatus, paymentId: patch.paymentId ?? order.paymentId, expiresAt: status === 'Pending payment' ? order.expiresAt : null, updatedAt: new Date() }).where(eq(s.orders.id, orderId)).returning();
  return { before: order, after: updated };
}

/** Online payment confirmed (by the browser callback or the webhook, whichever arrives first). */
export async function markPaid(orderId: string, paymentId: string) {
  const result = await updateOrder(orderId, { paymentStatus: 'Paid', paymentId });
  if (!result) return null;
  let order = result.after;
  if (result.before.paymentStatus !== 'Paid') {
    // The shopper's confirmation screen shows the returned order, so it must carry the new status.
    if (['Pending payment', 'Cancelled'].includes(result.before.status)) order = (await updateOrder(orderId, { status: 'Processing' }))?.after ?? order;
    await announceOrder(orderId);
    await sendToShiprocket(orderId);
  }
  return order;
}

// ---- Notifications --------------------------------------------------------------------------

async function announceOrder(orderId: string) {
  try {
    const database = await db();
    const [order] = await database.select().from(s.orders).where(eq(s.orders.id, orderId));
    if (!order) return;
    const [items, settings, lowStock] = await Promise.all([
      database.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId)),
      setting('settings', database),
      database.select({ id: s.productVariants.id, sku: s.productVariants.sku, stock: s.productVariants.stock, threshold: s.productVariants.threshold }).from(s.productVariants).where(and(sql`${s.productVariants.threshold} > 0`, sql`${s.productVariants.stock} <= ${s.productVariants.threshold}`)),
    ]);
    const lines = items.map(i => `${i.quantity} × ${i.name} ${i.size} ml — ${money(i.unitPrice * i.quantity)}`).join('\n');
    const totals = [`Subtotal: ${money(order.subtotal)}`, order.discount ? `Discount (${order.couponCode}): −${money(order.discount)}` : '', `Delivery: ${order.shipping ? money(order.shipping) : 'Complimentary'}`, `GST${order.taxIncluded ? ' included' : ''}: ${money(order.tax)}`, `Total: ${money(order.total)}`].filter(Boolean).join('\n');
    const address = order.address ? `${order.address.line}, ${order.address.city}, ${order.address.state} ${order.address.pincode}` : '';
    const store = settings.storeName || 'SENTBALE';
    const mails: Mail[] = [{
      to: order.email, subject: `${store} order confirmed`,
      body: `Hello ${order.name.split(' ')[0]},\n\nThank you for your order ${order.id}.\n\n${lines}\n\n${totals}\n\nPayment: ${order.paymentMethod}${order.paymentStatus === 'Paid' ? ' (paid)' : ' (due on delivery)'}\nDelivering to: ${address}\n\nYou can follow your order at ${config.siteUrl}/account/orders/${order.id}\n\n${store}`,
    }];
    if (settings.email && settings.notifyOrders) mails.push({ to: settings.email, subject: `New order #${order.number} — ${money(order.total)}`, body: `${order.name} <${order.email}>${order.phone ? `, ${order.phone}` : ''}\n\n${lines}\n\n${totals}\n\nPayment: ${order.paymentMethod}, ${order.paymentStatus}\nDeliver to: ${address}\n\n${config.siteUrl}/admin/orders` });
    // Only sizes this order touched, so each alert is news.
    const ordered = new Set(items.map(i => `${i.productId}-${i.size}`));
    const low = lowStock.filter(v => ordered.has(v.id));
    if (settings.email && settings.notifyLowStock && low.length) mails.push({ to: settings.email, subject: `Low stock: ${low.map(v => v.sku).join(', ')}`, body: low.map(v => `${v.sku}: ${v.stock} left (alert at ${v.threshold})`).join('\n') + `\n\n${config.siteUrl}/admin/inventory` });
    await queueMail(...mails);
  } catch (error) { console.error('[orders] notification', error); }
}
