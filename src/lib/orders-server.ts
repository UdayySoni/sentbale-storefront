import 'server-only';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import type { DemoOrder } from './store';
import type { Size } from './catalog';

/** Shapes rows as the storefront's order type. */
export function toDemoOrder(order: typeof s.orders.$inferSelect, items: (typeof s.orderItems.$inferSelect)[]): DemoOrder {
  const snapshot = items.map(i => ({ id: i.productId, size: i.size as Size, quantity: i.quantity, name: i.name, image: i.image, unitPrice: i.unitPrice }));
  return {
    id: order.id, number: order.number, date: order.createdAt.toISOString(), name: order.name, total: order.total, shipping: order.shipping,
    subtotal: order.subtotal, discount: order.discount, couponCode: order.couponCode, tax: order.tax, taxIncluded: order.taxIncluded,
    status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod,
    items: snapshot.map(({ id, size, quantity }) => ({ id, size, quantity })), snapshot, address: order.address ?? undefined,
  };
}

/** A customer's orders, newest first. Online orders whose payment never completed are left out. */
export async function listOrders(customerId: string) {
  const database = await db();
  const rows = (await database.select().from(s.orders).where(eq(s.orders.customerId, customerId)).orderBy(desc(s.orders.number)))
    .filter(o => !(o.paymentProvider === 'razorpay' && o.paymentStatus === 'Failed'));
  if (!rows.length) return [];
  const items = await database.select().from(s.orderItems).where(inArray(s.orderItems.orderId, rows.map(r => r.id))).orderBy(asc(s.orderItems.line));
  return rows.map(order => toDemoOrder(order, items.filter(i => i.orderId === order.id)));
}
