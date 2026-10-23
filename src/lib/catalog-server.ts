import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, schema as s, type Tx } from '@/db';
import { skuCode } from './admin/seed';
import { recordAudit } from './audit-server';
import { ladderPrice, products, type Product, type Size } from './catalog';

export type Catalog = { revision: string; products: Product[] };

/** The storefront catalogue: published products in display order, each with its per-size prices. */
export async function readCatalog(): Promise<Catalog> {
  const database = await db();
  const [rows, [revision]] = await Promise.all([
    database.select().from(s.products).where(eq(s.products.published, true)).orderBy(asc(s.products.position)),
    database.select().from(s.meta).where(eq(s.meta.key, 'catalog_revision')),
  ]);
  const variants = rows.length ? await database.select().from(s.productVariants).where(inArray(s.productVariants.productId, rows.map(r => r.id))) : [];
  return {
    revision: revision?.value ?? '0',
    products: rows.map(({ id, name, family, mood, description, image, price, color, notes, badge }) => ({
      id, name, family: family as Product['family'], mood, description, image, price, color, notes, ...(badge ? { badge } : {}),
      prices: Object.fromEntries(variants.filter(v => v.productId === id).map(v => [v.size, v.price])) as Partial<Record<Size, number>>,
      soldOut: variants.filter(v => v.productId === id && v.threshold > 0 && v.stock <= 0).map(v => v.size as Size),
    })),
  };
}

export function validProducts(value: unknown): value is Product[] {
  return Array.isArray(value) && value.length === products.length && new Set(value.map(p => p?.id)).size === products.length && value.every(p => {
    const original = products.find(item => item.id === p?.id);
    return original && p.image === original.image && ['Oud', 'Woody', 'Floral', 'Citrus'].includes(p.family)
      && Number.isSafeInteger(p.price) && p.price > 0 && p.price <= 1000000
      && ['name', 'mood', 'description'].every(key => typeof p[key] === 'string' && p[key].trim().length > 0 && p[key].length <= (key === 'description' ? 3000 : 150))
      && (p.badge === undefined || typeof p.badge === 'string' && p.badge.length <= 50)
      && typeof p.color === 'string' && /^#[a-f0-9]{6}$/i.test(p.color)
      && Array.isArray(p.notes) && p.notes.length === 3 && p.notes.every((notes: unknown) => Array.isArray(notes) && notes.length > 0 && notes.length <= 10 && notes.every(n => typeof n === 'string' && n.trim().length > 0 && n.length <= 80));
  });
}

/**
 * Compare-and-swap on a revision key: succeeds only if nobody saved since `expected` was read,
 * which is how a stale admin tab is stopped from overwriting newer changes.
 */
export async function bumpRevision(tx: Tx, key: string, expected: string) {
  const next = randomUUID();
  const [row] = await tx.update(s.meta).set({ value: next }).where(and(eq(s.meta.key, key), eq(s.meta.value, expected))).returning();
  return row ? next : null;
}

export async function saveCatalog(revision: string, next: Product[], actor: string): Promise<Catalog | null> {
  const saved = await (await db()).transaction(async tx => {
    const updated = await bumpRevision(tx, 'catalog_revision', revision);
    if (!updated) return null;
    const before = await tx.select().from(s.products).where(inArray(s.products.id, next.map(p => p.id)));
    for (const [position, p] of next.entries()) {
      const old = before.find(b => b.id === p.id);
      await tx.update(s.products).set({ position, name: p.name, family: p.family, mood: p.mood, description: p.description, price: p.price, color: p.color, notes: p.notes, badge: p.badge ?? null, updatedAt: new Date() }).where(eq(s.products.id, p.id));
      // A new 50 ml price re-applies the price ladder to every size; otherwise per-size prices set in
      // Inventory are kept. A rename refreshes the SKU codes.
      if (old && (old.price !== p.price || old.name !== p.name)) {
        for (const variant of await tx.select().from(s.productVariants).where(eq(s.productVariants.productId, p.id))) {
          const size = variant.size as Size;
          await tx.update(s.productVariants).set({ sku: old.name !== p.name ? skuCode(p.name, size) : variant.sku, price: old.price !== p.price ? ladderPrice(p.price, size) : variant.price, updatedAt: new Date() }).where(eq(s.productVariants.id, variant.id));
        }
      }
      if (old && JSON.stringify([old.name, old.family, old.mood, old.description, old.price, old.badge]) !== JSON.stringify([p.name, p.family, p.mood, p.description, p.price, p.badge ?? null])) await recordAudit(tx, actor, 'Updated product', p.name);
    }
    return true;
  });
  return saved ? readCatalog() : null;
}
