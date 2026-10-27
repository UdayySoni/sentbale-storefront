import 'server-only';
import { count, notInArray } from 'drizzle-orm';
import { defaultSizes, families, ladderPrice } from '@/lib/catalog';
import { skuCode, slug } from '@/lib/admin/seed';
import * as s from './schema';
import type { Db, Tx } from './index';

/** The three sizes of a product at the standard price ladder, with stock not yet tracked. */
export function variantsFor(product: { id: string; name: string; price: number }, threshold = 0) {
  return defaultSizes.map(size => ({ id: `${product.id}-${size}`, productId: product.id, size, sku: skuCode(product.name, size), price: ladderPrice(product.price, size), stock: 0, threshold }));
}

/**
 * Runs on every start and only fills gaps: any product without sizes gets its 50/100/200 ml variants,
 * and an empty collections table gets the four fragrance families.
 */
export async function ensureCatalogSeeded(database: Db | Tx) {
  const withVariants = database.selectDistinct({ id: s.productVariants.productId }).from(s.productVariants);
  const missing = await database.select().from(s.products).where(notInArray(s.products.id, withVariants));
  if (missing.length) await database.insert(s.productVariants).values(missing.flatMap(p => variantsFor(p))).onConflictDoNothing();

  const [{ total }] = await database.select({ total: count() }).from(s.collections);
  if (!total) await database.insert(s.collections).values(families.map((family, i) => ({ id: slug(family.name), name: family.name, description: family.description, position: i + 1 })));
}
