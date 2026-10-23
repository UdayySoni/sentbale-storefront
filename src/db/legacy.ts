import 'server-only';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import type { Db } from './index';
import { priceFor, products as builtInProducts, type Product, type Size } from '@/lib/catalog';
import * as s from './schema';

const MARKER = 'legacy_import';
const dataDir = () => path.join(process.cwd(), 'data');

type LegacyOrder = {
  id: string; date: string; name: string; total: number; shipping?: number;
  items: { id: string; size: Size; quantity: number }[];
  snapshot?: { id: string; size: Size; quantity: number; name: string; unitPrice: number; image: string }[];
  address?: s.OrderAddress;
};

/** SENTBALE_LEGACY_IMPORT=off starts a database as a fresh install (used for test databases). */
const legacyEnabled = () => process.env.SENTBALE_LEGACY_IMPORT !== 'off';

function readJson<T>(file: string): T | null {
  if (!legacyEnabled()) return null;
  const full = path.join(dataDir(), file);
  return existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) as T : null;
}

/**
 * Runs once per database. Copies the pre-Postgres stores — `data/customers.sqlite`, `data/catalog.json`
 * and `data/media.json` — into the new tables, then records a marker so it never runs again. The old
 * files are left untouched as a backup. A fresh install with no old files just gets the built-in catalogue.
 */
export async function importLegacyData(database: Db) {
  const done = await database.select().from(s.meta).where(eq(s.meta.key, MARKER));
  if (done.length) return;

  const catalog = readJson<{ revision: string; products: Product[] }>('catalog.json');
  const media = readJson<{ revision: string; images: Record<string, { src: string; alt: string; position: string }> }>('media.json');
  const sqlitePath = path.join(dataDir(), 'customers.sqlite');
  // node:sqlite is only loaded when there is something to import.
  const legacy = legacyEnabled() && existsSync(sqlitePath) ? new (await import('node:sqlite')).DatabaseSync(sqlitePath, { readOnly: true }) : null;
  const rows = (table: string) => {
    if (!legacy?.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) return [];
    return legacy.prepare(`SELECT * FROM "${table}"`).all() as Record<string, string | number>[];
  };
  const str = (v: unknown) => String(v ?? '');
  const now = Date.now();

  try {
    await database.transaction(async tx => {
      const catalogProducts = catalog?.products ?? builtInProducts;
      await tx.insert(s.products).values(catalogProducts.map((p, position) => ({
        id: p.id, position, name: p.name, family: p.family, mood: p.mood, description: p.description,
        image: p.image, price: p.price, color: p.color, notes: p.notes, badge: p.badge ?? null,
      }))).onConflictDoNothing();
      const revisions = [{ key: 'catalog_revision', value: catalog?.revision ?? '0' }, { key: 'media_revision', value: media?.revision ?? '0' }];
      await tx.insert(s.meta).values(revisions).onConflictDoNothing();
      const images = Object.entries(media?.images ?? {});
      if (images.length) await tx.insert(s.mediaSlots).values(images.map(([slot, v]) => ({ slot, src: v.src, alt: v.alt, position: v.position }))).onConflictDoNothing();

      const users = rows('users');
      const emailOf = new Map(users.map(u => [str(u.id), str(u.email)]));
      if (users.length) {
        await tx.insert(s.customers).values(users.map(u => ({ id: str(u.id), name: str(u.name), email: str(u.email), passwordHash: str(u.password) })));
        const addresses = users.flatMap(u => (JSON.parse(str(u.addresses) || '[]') as (Record<string, string> & { isDefault?: boolean })[]).map((a, position) => ({
          id: a.id, customerId: str(u.id), position, label: a.label, name: a.name, phone: a.phone, line: a.line, city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault === true,
        })));
        if (addresses.length) await tx.insert(s.customerAddresses).values(addresses);
      }
      const sessions = rows('sessions').filter(r => Number(r.expires) > now && emailOf.has(str(r.user_id)));
      if (sessions.length) await tx.insert(s.customerSessions).values(sessions.map(r => ({ tokenHash: str(r.token), customerId: str(r.user_id), expiresAt: new Date(Number(r.expires)) })));

      const legacyAdmins = rows('admins');
      if (legacyAdmins.length) await tx.insert(s.admins).values(legacyAdmins.map(a => ({ id: str(a.id), name: str(a.name), email: str(a.email), passwordHash: str(a.password), role: str(a.role) || 'Owner', createdAt: new Date(str(a.created)) })));
      const adminIds = new Set(legacyAdmins.map(a => str(a.id)));
      const adminSessions = rows('admin_sessions').filter(r => Number(r.expires) > now && adminIds.has(str(r.admin_id)));
      if (adminSessions.length) await tx.insert(s.adminSessions).values(adminSessions.map(r => ({ tokenHash: str(r.token), adminId: str(r.admin_id), expiresAt: new Date(Number(r.expires)) })));

      const attempts = rows('attempts').filter(r => Number(r.expires) > now);
      if (attempts.length) await tx.insert(s.loginAttempts).values(attempts.map(r => ({ key: str(r.email), count: Number(r.count), expiresAt: new Date(Number(r.expires)) })));

      // Insert oldest first so the new sequential order numbers follow purchase order.
      for (const row of rows('orders').sort((a, b) => JSON.parse(str(a.payload)).date.localeCompare(JSON.parse(str(b.payload)).date))) {
        const o = JSON.parse(str(row.payload)) as LegacyOrder;
        const lines = o.snapshot ?? o.items.map(item => {
          const p = catalogProducts.find(p => p.id === item.id);
          return { ...item, name: p?.name ?? item.id, image: p?.image ?? '', unitPrice: p ? priceFor(p, item.size) : 0 };
        });
        const shipping = o.shipping ?? 0;
        await tx.insert(s.orders).values({
          id: o.id, customerId: str(row.user_id), requestId: str(row.request_id), name: o.name, email: emailOf.get(str(row.user_id)) ?? '',
          address: o.address ?? null, delivery: shipping > 0 ? 'express' : 'standard',
          subtotal: o.total - shipping, shipping, total: o.total, createdAt: new Date(o.date),
        });
        if (lines.length) await tx.insert(s.orderItems).values(lines.map((l, line) => ({ orderId: o.id, line, productId: l.id, size: l.size, quantity: l.quantity, name: l.name, image: l.image, unitPrice: l.unitPrice })));
      }

      const legacyEnquiries = rows('enquiries');
      if (legacyEnquiries.length) await tx.insert(s.enquiries).values(legacyEnquiries.map(e => {
        const payload = JSON.parse(str(e.payload) || '{}');
        return { id: str(e.id), kind: str(e.kind), email: str(e.email), name: payload.name ?? '', subject: payload.subject ?? '', message: payload.message ?? '', createdAt: new Date(str(e.created)) };
      }));

      await tx.insert(s.meta).values({ key: MARKER, value: new Date().toISOString() });
    });
  } finally {
    legacy?.close();
  }
}
