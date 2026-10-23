import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { currentUser } from '@/lib/accounts-server';
import { markPaid } from '@/lib/commerce-server';
import { razorpayEnabled } from '@/lib/config';
import { toDemoOrder } from '@/lib/orders-server';
import { validPaymentSignature } from '@/lib/razorpay-server';
import { writeAllowed } from '@/lib/request-security';
export const runtime = 'nodejs';

/** Called by the checkout page after Razorpay reports success; the signature proves the payment is genuine. */
export async function POST(request: Request) {
  if (!writeAllowed(request)) return Response.json({ error: 'Same-origin requests only.' }, { status: 403 });
  if (!razorpayEnabled()) return Response.json({ error: 'Online payment is not configured.' }, { status: 404 });
  const user = await currentUser();
  if (!user) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  try {
    const { orderId, razorpayOrderId, paymentId, signature } = await request.json();
    if (![orderId, razorpayOrderId, paymentId, signature].every(v => typeof v === 'string' && v.length > 0 && v.length < 200)) return Response.json({ error: 'Invalid payment confirmation.' }, { status: 400 });
    const database = await db();
    const [order] = await database.select().from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.customerId, user.id), eq(schema.orders.paymentRef, razorpayOrderId)));
    if (!order || !validPaymentSignature(razorpayOrderId, paymentId, signature)) return Response.json({ error: 'This payment could not be verified. If money left your account, contact us with your order number.' }, { status: 400 });
    const paid = await markPaid(order.id, paymentId);
    const items = await database.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
    return Response.json({ order: toDemoOrder(paid!, items) });
  } catch (error) {
    console.error('[api/payments/razorpay/verify]', error);
    return Response.json({ error: 'Your payment is being confirmed. Check My Orders in a minute.' }, { status: 500 });
  }
}
