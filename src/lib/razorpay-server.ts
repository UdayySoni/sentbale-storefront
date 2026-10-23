import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config';

/** Razorpay over its REST API (https://razorpay.com/docs/api/orders/). Amounts are in paise. */
const API = 'https://api.razorpay.com/v1';
const auth = () => `Basic ${Buffer.from(`${config.payments.razorpayKeyId}:${config.payments.razorpayKeySecret}`).toString('base64')}`;

export async function createRazorpayOrder(amountRupees: number, receipt: string, notes: Record<string, string>) {
  const response = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountRupees * 100, currency: 'INR', receipt: receipt.slice(0, 40), notes }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Razorpay order failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return await response.json() as { id: string; amount: number; currency: string };
}

function sameHex(expected: string, given: string) {
  const a = Buffer.from(expected, 'hex'), b = Buffer.from(/^[a-f0-9]+$/i.test(given) ? given : '', 'hex');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout callback signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function validPaymentSignature(razorpayOrderId: string, paymentId: string, signature: string) {
  return sameHex(createHmac('sha256', config.payments.razorpayKeySecret).update(`${razorpayOrderId}|${paymentId}`).digest('hex'), signature);
}

/** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
export function validWebhookSignature(rawBody: string, signature: string) {
  if (!config.payments.razorpayWebhookSecret) return false;
  return sameHex(createHmac('sha256', config.payments.razorpayWebhookSecret).update(rawBody).digest('hex'), signature);
}
