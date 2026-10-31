import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, schema as s, type Tx } from '@/db';
import type { Product } from './catalog';

/**
 * Compare-and-swap on a revision key: succeeds only if nobody saved since `expected` was read,
 * which is how a stale admin tab is stopped from overwriting newer changes.
 */
export async function bumpRevision(tx: Tx, key: string, expected: string) {
  const next = randomUUID();
  const [row] = await tx.update(s.meta).set({ value: next }).where(and(eq(s.meta.key, key), eq(s.meta.value, expected))).returning();
  return row ? next : null;
}

export type Catalog = { revision: string; products: Product[] };

/** The storefront catalogue: published products with at least one size, in display order, each with its per-size prices. */
export async function readCatalog(): Promise<Catalog> {
  const database = await db();
  const [rows, [revision]] = await Promise.all([
    database.select().from(s.products).where(eq(s.products.published, true)).orderBy(asc(s.products.position)),
    database.select().from(s.meta).where(eq(s.meta.key, 'catalog_revision')),
  ]);
  const variants = rows.length ? await database.select().from(s.productVariants).where(inArray(s.productVariants.productId, rows.map(r => r.id))).orderBy(asc(s.productVariants.size)) : [];
  return {
    revision: revision?.value ?? '0',
    products: rows.flatMap(({ id, name, family, mood, description, image, images, price, color, notes, badge }) => {
      const own = variants.filter(v => v.productId === id);
      if (!own.length) return [];
      return [{
        id, name, family, mood, description, image, images, color, notes, ...(badge ? { badge } : {}),
        price: Math.min(price, ...own.map(v => v.price)),
        prices: Object.fromEntries(own.map(v => [v.size, v.price])),
        soldOut: own.filter(v => v.threshold > 0 && v.stock <= 0).map(v => v.size),
      }];
    }),
  };
}
