import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { config, shiprocketEnabled } from './config';

/**
 * Shiprocket over its REST API (https://apidocs.shiprocket.in). Orders are sent there once they are paid
 * (or placed as cash on delivery); the store team then picks a courier and books the pickup in Shiprocket.
 * Checkout shows Shiprocket's live courier rates, and tracking comes back by webhook and on refresh.
 */
const API = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_KEY = 'shiprocket_token';

/** Packed weight (kg) of one bottle by its size in ml (glass and box plus the liquid: 50 ml ≈ 0.33 kg), and the box it ships in (cm). */
const bottleKg = (ml: number) => 0.2 + ml * 0.0025;
const BOX = { length: 15, breadth: 10, height: 8 };
/** A gift basket adds its own weight and needs a bigger box. */
const BASKET_KG = 0.5;
const BASKET_BOX = { length: 30, breadth: 25, height: 15 };
export const parcelWeight = (lines: { size: number; quantity: number }[], basket = false) =>
  Math.max(0.1, Math.round(lines.reduce((kg, l) => kg + bottleKg(l.size) * l.quantity, basket ? BASKET_KG : 0) * 100) / 100);
const parcelBox = (units: number) => ({ ...BOX, height: BOX.height * Math.min(Math.max(units, 1), 4) });

export class ShiprocketError extends Error {}

// ---- Auth -----------------------------------------------------------------------------------

/** Tokens last 10 days. One is kept in the database so every server instance shares it. */
async function token(fresh = false): Promise<string> {
  const database = await db();
  if (!fresh) {
    const [row] = await database.select().from(s.meta).where(eq(s.meta.key, TOKEN_KEY));
    if (row) {
      const saved = JSON.parse(row.value) as { token: string; expires: number };
      if (saved.expires > Date.now()) return saved.token;
    }
  }
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: config.shiprocket.email, password: config.shiprocket.password }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({})) as { token?: string; message?: string };
  if (!response.ok || !data.token) throw new ShiprocketError(`Shiprocket sign-in failed: ${data.message || response.status}`);
  const value = JSON.stringify({ token: data.token, expires: Date.now() + 9 * 24 * 3600 * 1000 });
  await database.insert(s.meta).values({ key: TOKEN_KEY, value }).onConflictDoUpdate({ target: s.meta.key, set: { value } });
  return data.token;
}

/** Calls the API, signing in again once if the saved token has been revoked. */
async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 10000): Promise<{ status: number; data: T }> {
  for (const fresh of [false, true]) {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token(fresh)}`, ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 && !fresh) continue;
    return { status: response.status, data: await response.json().catch(() => ({})) as T };
  }
  throw new ShiprocketError('Shiprocket refused the saved sign-in.');
}

// ---- Pickup ---------------------------------------------------------------------------------

type Pickup = { name: string; pincode: string };
const cached = globalThis as typeof globalThis & { sentbalePickup?: { at: number; pickup: Pickup } };

/** The pickup address orders ship from: SHIPROCKET_PICKUP, else the account's primary one. Cached for an hour. */
export async function pickup(): Promise<Pickup> {
  if (cached.sentbalePickup && Date.now() - cached.sentbalePickup.at < 3600000) return cached.sentbalePickup.pickup;
  const { data } = await call<{ data?: { shipping_address?: { pickup_location: string; pin_code: string | number; is_primary_location?: number; status?: number }[] } }>('/settings/company/pickup');
  const places = data.data?.shipping_address ?? [];
  const chosen = config.shiprocket.pickup
    ? places.find(p => p.pickup_location === config.shiprocket.pickup)
    : places.find(p => p.is_primary_location === 1) ?? places[0];
  if (!chosen) throw new ShiprocketError(config.shiprocket.pickup ? `Shiprocket has no pickup location named "${config.shiprocket.pickup}".` : 'Add a pickup address in Shiprocket (Settings → Pickup Addresses).');
  const result = { name: chosen.pickup_location, pincode: String(chosen.pin_code) };
  cached.sentbalePickup = { at: Date.now(), pickup: result };
  return result;
}

// ---- Rates ----------------------------------------------------------------------------------

export type CourierRate = { courierId: number | null; courier: string; air: boolean; price: number; days: number | null; eta: string };
type Serviceable = { data?: { available_courier_companies?: { courier_company_id?: number; courier_name?: string; is_surface?: boolean; rate: number | string; estimated_delivery_days?: string | number; etd?: string }[] } };

/**
 * The couriers on the Shiprocket account for a pincode: the cheapest is standard, and express is a dearer one at
 * least as fast. Express is null when no such courier exists, so two options never show one price. Null when
 * Shiprocket is not set up or does not answer, so checkout falls back to the shipping zones; `none` when nobody delivers there.
 */
export async function courierRates(pincode: string, weightKg: number): Promise<{ standard: CourierRate; express: CourierRate | null } | 'none' | null> {
  if (!shiprocketEnabled() || !/^[1-9][0-9]{5}$/.test(pincode)) return null;
  try {
    const from = await pickup();
    const query = new URLSearchParams({ pickup_postcode: from.pincode, delivery_postcode: pincode, weight: String(weightKg), cod: '0' });
    const { status, data } = await call<Serviceable>(`/courier/serviceability/?${query}`, {}, 6000);
    const options = (data.data?.available_courier_companies ?? []).map(c => {
      const days = Number(c.estimated_delivery_days) || null;
      return { courierId: c.courier_company_id ?? null, courier: c.courier_name ?? '', air: c.is_surface === false, price: Math.ceil(Number(c.rate) || 0), days, eta: days ? `${days}–${days + 1} business days` : c.etd ? `By ${c.etd}` : '3–7 business days' };
    }).filter(c => c.price > 0);
    if (!options.length) return status === 200 || status === 404 ? 'none' : null;
    const speed = (c: CourierRate) => c.days ?? 99;
    const standard = options.reduce((a, b) => b.price < a.price || (b.price === a.price && speed(b) < speed(a)) ? b : a);
    const upgrades = options.filter(c => c.price > standard.price && speed(c) <= speed(standard));
    // Fastest first, then air over road, then the lower price.
    const express = upgrades.reduce<CourierRate | null>((a, b) => !a || speed(b) < speed(a) || (speed(b) === speed(a) && (b.air > a.air || (b.air === a.air && b.price < a.price))) ? b : a, null);
    return { standard, express };
  } catch (error) {
    console.error('[shiprocket] rates', error);
    return null;
  }
}

// ---- Orders ---------------------------------------------------------------------------------

const ist = (date: Date) => new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 16).replace('T', ' ');

/**
 * Sends a paid or cash-on-delivery order to Shiprocket, once. Never throws: a failure is saved on the order
 * (shown in Admin → Orders, where it can be sent again) so it never undoes the order itself.
 */
export async function sendToShiprocket(orderId: string) {
  if (!shiprocketEnabled()) return;
  const database = await db();
  const [order] = await database.select().from(s.orders).where(eq(s.orders.id, orderId));
  // Test-checkout orders were never paid for, and orders typed into the admin have no address to ship to.
  if (!order || order.shipRef || !order.address || order.status !== 'Processing' || order.paymentProvider === 'test') return;
  try {
    const items = await database.select().from(s.orderItems).where(eq(s.orderItems.orderId, orderId)).orderBy(asc(s.orderItems.line));
    const from = await pickup();
    const [first, ...rest] = order.name.trim().split(/\s+/);
    const units = items.reduce((n, i) => n + i.quantity, 0);
    const cod = order.paymentProvider === 'cod';
    const phone = order.phone.replace(/\D/g, '').slice(-10);
    const { status, data } = await call<{ order_id?: number; shipment_id?: number; status?: string; awb_code?: string; courier_name?: string; message?: string; errors?: Record<string, string[]> }>('/orders/create/adhoc', {
      method: 'POST',
      body: JSON.stringify({
        order_id: order.id, order_date: ist(order.createdAt), pickup_location: from.name,
        billing_customer_name: first || order.name, billing_last_name: rest.join(' '),
        billing_address: order.address.line, billing_city: order.address.city, billing_pincode: order.address.pincode,
        billing_state: order.address.state, billing_country: 'India', billing_email: order.email, billing_phone: phone,
        shipping_is_billing: true,
        // The basket is a line of its own, so the lines add up to what the courier collects on cash orders.
        order_items: [...items.map(i => ({ name: `${i.name} ${i.size} ml`, sku: `${i.productId}-${i.size}`, units: i.quantity, selling_price: i.unitPrice })), ...(order.gift && order.giftCharge > 0 ? [{ name: order.gift.basket, sku: 'gift-basket', units: 1, selling_price: order.giftCharge }] : [])],
        payment_method: cod ? 'COD' : 'Prepaid',
        shipping_charges: order.shipping, total_discount: order.discount, sub_total: order.total - order.shipping + order.discount,
        weight: parcelWeight(items, !!order.gift), ...(order.gift ? BASKET_BOX : parcelBox(units)),
      }),
    });
    if (status >= 300 || !data.order_id) {
      const detail = data.errors ? Object.values(data.errors).flat().join(' ') : data.message;
      throw new ShiprocketError(detail || `Shiprocket answered ${status}.`);
    }
    await database.update(s.orders).set({
      shipRef: String(data.order_id), shipmentId: data.shipment_id ? String(data.shipment_id) : null,
      awb: data.awb_code || null, courier: data.courier_name || null, shipStatus: data.status || 'NEW', shipError: null, shipSyncedAt: new Date(),
    }).where(eq(s.orders.id, orderId));
  } catch (error) {
    console.error('[shiprocket] create order', orderId, error);
    const message = error instanceof ShiprocketError ? error.message : 'Shiprocket could not be reached.';
    await database.update(s.orders).set({ shipError: message.slice(0, 300) }).where(eq(s.orders.id, orderId)).catch(() => {});
  }
}

// ---- Admin → Shiprocket ---------------------------------------------------------------------

/** The account behind the integration, for the top of the admin page. */
export async function shiprocketAccount() {
  const base = { enabled: shiprocketEnabled(), webhook: !!config.shiprocket.webhookToken };
  if (!base.enabled) return { ...base, connected: false };
  try {
    const [from, wallet] = await Promise.all([pickup(), call<{ data?: { balance_amount?: string | number } }>('/account/details/wallet-balance')]);
    return { ...base, connected: true, pickup: from, wallet: Number(wallet.data.data?.balance_amount ?? 0) };
  } catch (error) {
    console.error('[shiprocket] account', error);
    return { ...base, connected: false, error: error instanceof ShiprocketError ? error.message : 'Shiprocket could not be reached.' };
  }
}

/**
 * Books the shopper's courier (or Shiprocket's pick, by your dashboard's courier rules, if none is saved) and asks
 * for a pickup. This is what charges the Shiprocket wallet, so it only ever runs from an admin's button.
 */
export async function bookCourier(orderId: string) {
  const database = await db();
  const [order] = await database.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order?.shipmentId) throw new ShiprocketError('Send this order to Shiprocket first.');
  if (order.awb) throw new ShiprocketError('This order already has a courier.');
  type Assigned = { awb_assign_status?: number; message?: string; response?: { data?: { awb_code?: string; courier_name?: string; awb_assign_error?: string } } };
  const { data } = await call<Assigned>('/courier/assign/awb', { method: 'POST', body: JSON.stringify({ shipment_id: Number(order.shipmentId), ...(order.shipChoice?.courierId ? { courier_id: order.shipChoice.courierId } : {}) }) }, 20000);
  const assigned = data.response?.data;
  if (data.awb_assign_status !== 1 || !assigned?.awb_code) throw new ShiprocketError(assigned?.awb_assign_error || data.message || 'Shiprocket could not assign a courier.');
  const picked = await call('/courier/generate/pickup', { method: 'POST', body: JSON.stringify({ shipment_id: [Number(order.shipmentId)] }) }, 20000).catch(() => null);
  const scheduled = !!picked && picked.status < 300;
  await applyTracking(orderId, { awb: assigned.awb_code, courier: assigned.courier_name, shipStatus: scheduled ? 'PICKUP SCHEDULED' : 'AWB ASSIGNED' });
  return { awb: assigned.awb_code, courier: assigned.courier_name ?? '', scheduled };
}

/** A link to the printable shipping label of a booked order. */
export async function shippingLabel(orderId: string) {
  const [order] = await (await db()).select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order?.shipmentId || !order.awb) throw new ShiprocketError('Book a courier before printing the label.');
  const { data } = await call<{ label_url?: string; message?: string; response?: string }>('/courier/generate/label', { method: 'POST', body: JSON.stringify({ shipment_id: [Number(order.shipmentId)] }) }, 20000);
  if (!data.label_url) throw new ShiprocketError(data.response || data.message || 'Shiprocket could not create the label.');
  return data.label_url;
}

// ---- Tracking -------------------------------------------------------------------------------

/** Moves the store's order along with the courier: picked up → Shipped, delivered → Delivered. */
export function orderStatusFor(shipStatus: string, current: string) {
  const status = shipStatus.toUpperCase();
  if (current === 'Cancelled' || current === 'Refunded' || current === 'Delivered') return null;
  if (/^DELIVERED$/.test(status)) return 'Delivered';
  if (current === 'Processing' && /PICKED UP|IN TRANSIT|SHIPPED|OUT FOR DELIVERY|REACHED|DISPATCHED/.test(status) && !/RTO|UNDELIVERED/.test(status)) return 'Shipped';
  return null;
}

/** Saves a tracking update and moves the order on when the courier's progress says so. */
export async function applyTracking(orderId: string, update: { awb?: string | null; courier?: string | null; shipStatus?: string | null }) {
  const database = await db();
  const [order] = await database.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order) return;
  await database.update(s.orders).set({
    awb: update.awb || order.awb, courier: update.courier || order.courier, shipStatus: update.shipStatus || order.shipStatus, shipSyncedAt: new Date(),
  }).where(eq(s.orders.id, orderId));
  const next = update.shipStatus ? orderStatusFor(update.shipStatus, order.status) : null;
  if (next) {
    const { updateOrder } = await import('./commerce-server');
    await updateOrder(orderId, { status: next, ...(next === 'Delivered' && order.paymentProvider === 'cod' ? { paymentStatus: 'Paid' as const } : {}) });
  }
}

type ShowOrder = { data?: { status?: string; shipments?: { awb?: string; courier?: string; status?: string } | { awb?: string; courier?: string; status?: string }[] } };

/** Fetches the latest courier, tracking number and status of orders sent to Shiprocket. */
export async function refreshTracking(orderIds: string[]) {
  if (!shiprocketEnabled() || !orderIds.length) return;
  const database = await db();
  await Promise.all(orderIds.slice(0, 10).map(async id => {
    try {
      const [order] = await database.select({ shipRef: s.orders.shipRef }).from(s.orders).where(eq(s.orders.id, id));
      if (!order?.shipRef) return;
      const { status, data } = await call<ShowOrder>(`/orders/show/${encodeURIComponent(order.shipRef)}`, {}, 5000);
      if (status !== 200) return;
      const shipment = Array.isArray(data.data?.shipments) ? data.data?.shipments[0] : data.data?.shipments;
      await applyTracking(id, { awb: shipment?.awb, courier: shipment?.courier, shipStatus: shipment?.status || data.data?.status });
    } catch (error) { console.error('[shiprocket] tracking', id, error); }
  }));
}

/** Orders worth asking Shiprocket about: sent there, not finished, and not checked in the last half hour. */
export function needsRefresh(order: { shipRef: string | null; status: string; shipSyncedAt: Date | null }) {
  return !!order.shipRef && (order.status === 'Processing' || order.status === 'Shipped')
    && (!order.shipSyncedAt || Date.now() - order.shipSyncedAt.getTime() > 30 * 60000);
}

export const trackingUrl = (awb: string) => `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
