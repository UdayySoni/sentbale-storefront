import 'server-only';
import { permissionSections } from './nav';
import { records } from '@/lib/records-server';
import type { Access } from './types';

export type AccessMap = Record<string, Access>;
type Who = { role: string };

/** The permission section that governs each workspace list or setting. */
const SECTION: Record<string, string[]> = {
  products: ['products'], skus: ['inventory', 'products'], collections: ['collections'],
  orders: ['orders', 'payments', 'shipments'], shipments: ['shipments', 'orders'], customers: ['customers'], enquiries: ['customers'],
  baskets: ['gifts'], coupons: ['coupons'], reviews: ['reviews'], posts: ['journal'], zones: ['shipping'], partners: ['shipping'],
  methods: ['payments'], roles: ['roles'], team: ['roles'], audit: ['audit'],
  homepage: ['homepage'], settings: ['settings'], seen: ['dashboard'], media: ['products', 'homepage'],
};
const rank: Record<Access, number> = { none: 0, view: 1, manage: 2 };

export const isOwner = (admin: Who) => admin.role === 'Owner';

/** What the admin's role allows in each section. The Owner role always has full access. */
export async function accessFor(admin: Who): Promise<AccessMap> {
  if (isOwner(admin)) return Object.fromEntries(permissionSections.map(s => [s.key, 'manage'])) as AccessMap;
  const role = (await records('roles')).find(r => r.name === admin.role);
  return Object.fromEntries(permissionSections.map(s => [s.key, role?.access?.[s.key] ?? (s.key === 'dashboard' ? 'view' : 'none')])) as AccessMap;
}

/** True if any section governing `key` (a list, setting, or section name) grants at least `level`. */
export function allows(access: AccessMap, key: string, level: Exclude<Access, 'none'>) {
  if (key === 'seen') return true;
  return (SECTION[key] ?? [key]).some(section => rank[access[section] ?? 'none'] >= rank[level]);
}
