import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * SENTBALE commerce schema. Money is whole rupees (integer), matching the storefront's pricing.
 * Ids are text so existing UUIDs and `DEMO-…` order ids carry over unchanged.
 */
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/** Small key/value store: catalogue and media revisions, one-time migration markers. */
export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ---- Customers ------------------------------------------------------------------------------

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  /** Null for customers added in the admin who have not created their sign-in yet. */
  passwordHash: text('password_hash'),
  phone: text('phone').notNull().default(''),
  city: text('city').notNull().default(''),
  tag: text('tag').notNull().default('New'),
  /** 'Blocked' customers cannot sign in or order. */
  status: text('status').notNull().default('Active'),
  createdAt: created(),
});

export const customerAddresses = pgTable('customer_addresses', {
  id: text('id').notNull(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  label: text('label').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  line: text('line').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  pincode: text('pincode').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
}, t => [primaryKey({ columns: [t.customerId, t.id] })]);

export const customerSessions = pgTable('customer_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [index('customer_sessions_customer_idx').on(t.customerId)]);

/** Failed sign-in counters, keyed by `email` (customers) or `admin:email` (admins). */
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// ---- Admin ----------------------------------------------------------------------------------

export const admins = pgTable('admins', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  /** Null until an invited team member accepts. */
  passwordHash: text('password_hash'),
  /** Role name, matching a role in Roles & Permissions. */
  role: text('role').notNull().default('Owner'),
  status: text('status').notNull().default('Active'),
  inviteTokenHash: text('invite_token_hash'),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  createdAt: created(),
});

export const adminSessions = pgTable('admin_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  adminId: text('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [index('admin_sessions_admin_idx').on(t.adminId)]);

// ---- Catalogue ------------------------------------------------------------------------------

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  position: integer('position').notNull(),
  name: text('name').notNull(),
  family: text('family').notNull(),
  mood: text('mood').notNull(),
  description: text('description').notNull(),
  image: text('image').notNull(),
  /** 50 ml list price. Each size's selling price lives on its variant. */
  price: integer('price').notNull(),
  color: text('color').notNull(),
  notes: jsonb('notes').$type<[string[], string[], string[]]>().notNull(),
  badge: text('badge'),
  /** Published products are on the storefront; the rest are admin drafts until storefront pages exist for them. */
  published: boolean('published').notNull().default(true),
  /** Admin status for unpublished products: 'Active' or 'Draft'. */
  status: text('status').notNull().default('Active'),
  updatedAt: updated(),
});

/** One row per size of a product: what is sold, at what price, and how many are on hand. */
export const productVariants = pgTable('product_variants', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  size: integer('size').notNull(),
  sku: text('sku').notNull(),
  price: integer('price').notNull(),
  stock: integer('stock').notNull().default(0),
  /** Low-stock alert level; 0 means the size is not tracked. */
  threshold: integer('threshold').notNull().default(0),
  updatedAt: updated(),
}, t => [uniqueIndex('product_variants_product_size_idx').on(t.productId, t.size)]);

export const collections = pgTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  position: integer('position').notNull(),
  featured: boolean('featured').notNull().default(false),
  status: text('status').notNull().default('Visible'),
  updatedAt: updated(),
});

export const mediaSlots = pgTable('media_slots', {
  slot: text('slot').primaryKey(),
  src: text('src').notNull(),
  alt: text('alt').notNull(),
  position: text('position').notNull(),
});

// ---- Orders ---------------------------------------------------------------------------------

export type OrderAddress = { line: string; city: string; state: string; pincode: string };

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  number: serial('number').notNull().unique(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  /** Client-generated id that makes a checkout submission idempotent. */
  requestId: text('request_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  address: jsonb('address').$type<OrderAddress>(),
  phone: text('phone').notNull().default(''),
  delivery: text('delivery').notNull().default('standard'),
  status: text('status').notNull().default('Processing'),
  paymentStatus: text('payment_status').notNull().default('Paid'),
  subtotal: integer('subtotal').notNull(),
  shipping: integer('shipping').notNull().default(0),
  discount: integer('discount').notNull().default(0),
  couponCode: text('coupon_code'),
  /** GST on the order; included in the prices unless `taxIncluded` is false. */
  tax: integer('tax').notNull().default(0),
  taxIncluded: boolean('tax_included').notNull().default(true),
  /** 'test', 'razorpay', or 'manual' (entered in the admin). */
  paymentProvider: text('payment_provider').notNull().default('test'),
  paymentMethod: text('payment_method').notNull().default(''),
  /** Provider order id (Razorpay `order_…`) and payment id once paid. */
  paymentRef: text('payment_ref'),
  paymentId: text('payment_id'),
  /** Stock is held for unpaid orders until this time. */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  total: integer('total').notNull(),
  createdAt: created(),
  updatedAt: updated(),
}, t => [
  uniqueIndex('orders_request_idx').on(t.customerId, t.requestId),
  index('orders_customer_idx').on(t.customerId),
]);

export const orderItems = pgTable('order_items', {
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  line: integer('line').notNull(),
  productId: text('product_id').notNull(),
  size: integer('size').notNull(),
  quantity: integer('quantity').notNull(),
  /** Snapshots taken at purchase so later catalogue edits never rewrite past orders. */
  name: text('name').notNull(),
  image: text('image').notNull(),
  unitPrice: integer('unit_price').notNull(),
}, t => [primaryKey({ columns: [t.orderId, t.line] })]);

// ---- Enquiries ------------------------------------------------------------------------------

export const enquiries = pgTable('enquiries', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  subject: text('subject').notNull().default(''),
  message: text('message').notNull().default(''),
  handled: boolean('handled').notNull().default(false),
  createdAt: created(),
}, t => [index('enquiries_kind_idx').on(t.kind, t.createdAt)]);

// ---- Admin workspace ------------------------------------------------------------------------

/**
 * Admin sections that do not have their own table yet (orders entered by hand, customers, coupons,
 * reviews, journal, shipping, payments, roles, team). Each record is one row, so concurrent edits to
 * different records never overwrite each other. Sections move to typed tables as the backend grows.
 */
export const adminRecords = pgTable('admin_records', {
  list: text('list').notNull(),
  id: text('id').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  updatedAt: updated(),
}, t => [primaryKey({ columns: [t.list, t.id] })]);

/** Single-value admin settings: `homepage`, `settings`, `seen`. */
export const adminSettings = pgTable('admin_settings', {
  key: text('key').primaryKey(),
  data: jsonb('data').notNull(),
  updatedAt: updated(),
});

/** Written only by the server, with the signed-in admin as the actor. */
export const adminAudit = pgTable('admin_audit', {
  id: text('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull().default(''),
}, t => [index('admin_audit_at_idx').on(t.at)]);

// ---- Email ----------------------------------------------------------------------------------

/** Every email the store sends, with its delivery result. Without a mail provider, emails stop at 'logged'. */
export const outbox = pgTable('outbox', {
  id: text('id').primaryKey(),
  to: text('to').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('logged'),
  error: text('error'),
  createdAt: created(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, t => [index('outbox_created_idx').on(t.createdAt)]);

/** One-time password reset links (hashed), for customers and admins. */
export const passwordResets = pgTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(),
  kind: text('kind').notNull(),
  accountId: text('account_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [index('password_resets_account_idx').on(t.kind, t.accountId)]);
