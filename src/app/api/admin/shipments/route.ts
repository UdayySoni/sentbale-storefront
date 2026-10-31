import { adminWriteDenied, currentAdmin } from '@/lib/admin-auth';
import { accessFor, allows } from '@/lib/admin/access-server';
import { bookCourier, refreshTracking, sendToShiprocket, shiprocketAccount, shippingLabel, ShiprocketError } from '@/lib/shiprocket-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

/** The Shiprocket account behind the integration: connection, pickup address and wallet. */
export async function GET() {
  const admin = await currentAdmin();
  if (!admin) return reply({ error: 'Your admin session has ended. Please sign in again.' }, 401);
  if (!allows(await accessFor(admin), 'shipments', 'view')) return reply({ error: 'Your role does not allow this.' }, 403);
  return reply(await shiprocketAccount());
}

/** `send` creates the order on Shiprocket, `book` buys the courier (charges the wallet), `label` prints it, `refresh` re-reads tracking. */
export async function POST(request: Request) {
  const denied = await adminWriteDenied(request, 'shipments');
  if (denied) return denied;
  try {
    const body = await request.json();
    const ids = Array.isArray(body?.orderIds) ? body.orderIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 10) : [];
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    if (body?.action === 'refresh') { await refreshTracking(ids); return reply({ ok: true }); }
    if (!orderId) return reply({ error: 'Choose an order.' }, 400);
    if (body?.action === 'send') { await sendToShiprocket(orderId); return reply({ ok: true }); }
    if (body?.action === 'book') return reply(await bookCourier(orderId));
    if (body?.action === 'label') return reply({ url: await shippingLabel(orderId) });
    return reply({ error: 'Unknown action.' }, 400);
  } catch (error) {
    if (error instanceof ShiprocketError) return reply({ error: error.message }, 400);
    console.error('[api/admin/shipments]', error);
    return reply({ error: 'Shiprocket could not be reached. Please try again.' }, 502);
  }
}
