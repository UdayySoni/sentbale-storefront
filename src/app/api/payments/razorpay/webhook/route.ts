import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { markPaid } from '@/lib/commerce-server';
import { validWebhookSignature } from '@/lib/razorpay-server';
export const runtime = 'nodejs';

/**
 * Razorpay webhook. In the Razorpay dashboard, point it at /api/payments/razorpay/webhook with the
 * events payment.captured and order.paid. It confirms payment even when the shopper closes the tab before
 * the checkout callback runs. Failed attempts need no action: the shopper may retry, and unpaid orders
 * release their stock when the hold expires.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 1_000_000 || !validWebhookSignature(raw, request.headers.get('x-razorpay-signature') || '')) return new Response('invalid signature', { status: 400 });
  try {
    const event = JSON.parse(raw);
    if (event?.event !== 'payment.captured' && event?.event !== 'order.paid') return new Response('ignored');
    const payment = event.payload?.payment?.entity;
    const razorpayOrderId: string | undefined = payment?.order_id ?? event.payload?.order?.entity?.id;
    if (!razorpayOrderId) return new Response('ignored');
    const [order] = await (await db()).select().from(schema.orders).where(eq(schema.orders.paymentRef, razorpayOrderId));
    if (!order) return new Response('unknown order');
    await markPaid(order.id, payment?.id ?? order.paymentId ?? '');
    return new Response('ok');
  } catch (error) {
    console.error('[api/payments/razorpay/webhook]', error);
    return new Response('error', { status: 500 });
  }
}
