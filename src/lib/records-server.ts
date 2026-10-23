import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db, schema as s, type Db as Database, type Tx } from '@/db';
import { seed } from './admin/seed';
import type { Db } from './admin/types';

type RecordList = 'coupons' | 'reviews' | 'posts' | 'zones' | 'partners' | 'methods' | 'roles';
type Source = Database | Tx;

/** Rows of an admin-managed section that is stored as generic records. */
export async function records<K extends RecordList>(list: K, source?: Source): Promise<Db[K]> {
  const rows = await (source ?? await db()).select().from(s.adminRecords).where(eq(s.adminRecords.list, list)).orderBy(asc(s.adminRecords.updatedAt));
  return rows.map(r => ({ ...r.data, id: r.id })) as unknown as Db[K];
}

/** A single admin setting, merged over its default so newly added fields always have a value. */
export async function setting<K extends 'homepage' | 'settings'>(key: K, source?: Source): Promise<Db[K]> {
  const [row] = await (source ?? await db()).select().from(s.adminSettings).where(eq(s.adminSettings.key, key));
  return { ...seed()[key], ...(row?.data as object | undefined) } as Db[K];
}
