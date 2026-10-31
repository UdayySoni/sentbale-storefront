import { CheckoutError, giftInput, orderLines, quote, type Delivery } from '@/lib/commerce-server';
import { writeAllowed } from '@/lib/request-security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Live checkout totals for a bag: delivery options, coupon, GST and stock problems. */
export async function POST(request: Request) {
  if (!writeAllowed(request)) return Response.json({ error: 'Same-origin requests only.' }, { status: 403 });
  try {
    const body = await request.json();
    const delivery: Delivery = body?.delivery === 'express' ? 'express' : 'standard';
    const state = typeof body?.state === 'string' ? body.state.slice(0, 80) : '';
    const coupon = typeof body?.coupon === 'string' ? body.coupon.slice(0, 20) : '';
    const pincode = typeof body?.pincode === 'string' && /^[1-9][0-9]{5}$/.test(body.pincode) ? body.pincode : '';
    const gift = giftInput(body?.gift);
    const result = await quote({ items: orderLines(body?.items, gift), delivery, state, pincode, coupon, gift });
    // Internal stock details stay on the server.
    const { lines, coupon: code, ...rest } = result;
    return Response.json({
      ...rest,
      lines: lines.map(({ id, size, quantity, name, image, unitPrice }) => ({ id, size, quantity, name, image, unitPrice })),
      coupon: code && { code: code.code, applied: code.applied, message: code.message },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof CheckoutError) return Response.json({ error: error.message }, { status: 400 });
    console.error('[api/checkout/quote]', error);
    return Response.json({ error: 'Totals could not be calculated. Please try again.' }, { status: 500 });
  }
}
