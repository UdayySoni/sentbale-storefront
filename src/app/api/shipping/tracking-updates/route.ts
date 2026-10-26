import { timingSafeEqual } from 'node:crypto';
import { eq, or } from 'drizzle-orm';
import { db, schema } from '@/db';
import { config } from '@/lib/config';
import { applyTracking } from '@/lib/shiprocket-server';
export const runtime = 'nodejs';

/**
 * Shiprocket tracking webhook. In Shiprocket: Settings → API → Webhooks, URL
 * https://YOUR-DOMAIN/api/shipping/tracking-updates with the token in SHIPROCKET_WEBHOOK_TOKEN.
 * (Shiprocket refuses webhook URLs containing "shiprocket", hence the neutral path.)
 */
function tokenMatches(given: string) {
  const expected = config.shiprocket.webhookToken;
  if (!expected) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!tokenMatches(request.headers.get('x-api-key') || '')) return new Response('unauthorized', { status: 401 });
  const raw = await request.text();
  if (raw.length > 200_000) return new Response('too large', { status: 413 });
  try {
    const event = JSON.parse(raw) as { order_id?: string | number; sr_order_id?: string | number; awb?: string | number; courier_name?: string; current_status?: string; shipment_status?: string };
    const ids = [event.order_id, event.sr_order_id, event.awb].filter(v => v !== undefined && v !== null && v !== '').map(String);
    if (!ids.length) return new Response('ignored');
    const o = schema.orders;
    const [order] = await (await db()).select({ id: o.id }).from(o)
      .where(or(...ids.flatMap(id => [eq(o.id, id), eq(o.shipRef, id), eq(o.awb, id)])));
    // Shiprocket retries anything but a 200, so unknown orders (e.g. shipped from another channel) are acknowledged.
    if (!order) return new Response('unknown order');
    await applyTracking(order.id, { awb: event.awb ? String(event.awb) : null, courier: event.courier_name || null, shipStatus: event.current_status || event.shipment_status || null });
    return new Response('ok');
  } catch (error) {
    console.error('[api/shipping/tracking-updates]', error);
    return new Response('error', { status: 500 });
  }
}
