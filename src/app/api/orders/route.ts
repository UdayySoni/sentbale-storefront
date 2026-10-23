import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { currentUser } from '@/lib/accounts-server';
import { cartItems, CheckoutError, placeOrder, updateOrder, type PaymentChoice } from '@/lib/commerce-server';
import { config, razorpayEnabled, testPaymentsEnabled } from '@/lib/config';
import { toDemoOrder } from '@/lib/orders-server';
import { createRazorpayOrder } from '@/lib/razorpay-server';
import { writeAllowed } from '@/lib/request-security';
export const runtime = 'nodejs';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null;

export async function POST(request: Request) {
  if (!writeAllowed(request)) return reply({ error: 'Same-origin requests only.' }, 403);
  const user = await currentUser();
  if (!user) return reply({ error: 'Sign in before placing your order.' }, 401);
  try {
    const body = await request.json();
    const requestId = text(body?.requestId, 100);
    if (!requestId) throw new CheckoutError('Invalid request.');
    const items = cartItems(body.items);
    const address = body.address ?? {};
    const [line, city, state, pincode] = [text(address.line, 250), text(address.city, 250), text(address.state, 250), text(address.pincode, 6)];
    if (!line || !city || !state || !pincode || !/^[1-9][0-9]{5}$/.test(pincode)) throw new CheckoutError('Enter a valid delivery address.');
    const name = text(body.name, 100);
    if (!name || !['standard', 'express'].includes(body.delivery)) throw new CheckoutError('Check your delivery details.');
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (phone && !/^[0-9+ ()-]{10,16}$/.test(phone)) throw new CheckoutError('Enter a valid phone number.');
    const payment: PaymentChoice = ['test', 'razorpay', 'cod'].includes(body.payment) ? body.payment : testPaymentsEnabled() ? 'test' : 'razorpay';
    const coupon = typeof body.coupon === 'string' && body.coupon.trim() ? body.coupon.slice(0, 20) : undefined;

    const placed = await placeOrder({ customer: user, requestId, name, phone, address: { line, city, state, pincode }, delivery: body.delivery, coupon, payment, items });
    let { order } = placed;
    if (order.paymentProvider === 'razorpay' && order.status === 'Pending payment') {
      // Online orders get a Razorpay order the browser pays against; a repeat submission reuses it.
      if (!order.paymentRef) {
        try {
          const gateway = await createRazorpayOrder(order.total, `#${order.number}`, { order_id: order.id });
          [order] = await (await db()).update(schema.orders).set({ paymentRef: gateway.id }).where(eq(schema.orders.id, order.id)).returning();
        } catch (error) {
          console.error('[api/orders] razorpay', error);
          await updateOrder(order.id, { status: 'Cancelled', paymentStatus: 'Failed' });
          throw new CheckoutError('Online payment could not be started. Your bag is unchanged; please try again.');
        }
      }
      if (!razorpayEnabled()) throw new CheckoutError('Online payment is not available right now.');
      return reply({
        order: toDemoOrder(order, placed.items),
        razorpay: { keyId: config.payments.razorpayKeyId, orderId: order.paymentRef, amount: order.total * 100, currency: 'INR', name: order.name, email: order.email, phone: order.phone },
      });
    }
    return reply({ order: toDemoOrder(order, placed.items) });
  } catch (error) {
    if (error instanceof CheckoutError) return reply({ error: error.message }, 400);
    console.error('[api/orders]', error);
    return reply({ error: 'Unable to save your order. Please try again.' }, 500);
  }
}
