import { articles, defaultSizes, families, priceFor, products as liveProducts } from '@/lib/catalog';
import { permissionSections } from './nav';
import type { Access, Db, Role, Sku } from './types';

// Bump when the stored shape or starting content changes; older workspaces are replaced on load.
export const DB_VERSION = 2;

export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const skuCode = (name: string, size: number) => `SB-${name.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase()}-${size}`;
export function skusFor(product: { id: string; name: string; price: number }, threshold = 10): Sku[] {
  return defaultSizes.map(size => ({ id: `${product.id}-${size}`, productId: product.id, product: product.name, size, sku: skuCode(product.name, size), price: priceFor(product, size), stock: 0, threshold }));
}

/**
 * A clean workspace: no orders, customers, coupons, reviews, shipping or payment records until the
 * backend supplies them. Only what already exists on the storefront is present (the catalogue's sizes
 * with no stock entered and no alert level, its collections and journal articles) plus role templates.
 */
export function seed(): Db {
  const now = new Date().toISOString();
  const full = Object.fromEntries(permissionSections.map(s => [s.key, 'manage'])) as Record<string, Access>;
  const none = Object.fromEntries(permissionSections.map(s => [s.key, 'none'])) as Record<string, Access>;
  const roles: Role[] = [
    { id: 'owner', name: 'Owner', description: 'Full access to every section, billing and team.', access: full },
    { id: 'manager', name: 'Store Manager', description: 'Runs the catalogue, orders and customers.', access: { ...full, settings: 'view', roles: 'view', audit: 'view' } },
    { id: 'fulfilment', name: 'Fulfilment', description: 'Packs and ships orders, keeps stock accurate.', access: { ...none, dashboard: 'view', orders: 'manage', inventory: 'manage', shipping: 'view', customers: 'view' } },
    { id: 'editor', name: 'Content Editor', description: 'Writes the journal and curates the homepage.', access: { ...none, dashboard: 'view', journal: 'manage', homepage: 'manage', collections: 'manage', products: 'view', reviews: 'manage' } },
    { id: 'support', name: 'Customer Support', description: 'Helps customers with orders and reviews.', access: { ...none, dashboard: 'view', orders: 'view', customers: 'manage', reviews: 'manage', coupons: 'view' } },
  ];
  return {
    version: DB_VERSION, roles,
    products: [], orders: [], customers: [], coupons: [], reviews: [], zones: [], partners: [], methods: [], team: [], audit: [], enquiries: [],
    baskets: [
      { id: 'classic', name: 'Classic basket', description: 'Woven basket with ribbon', image: '/images/basket-classic.jpg', price: 199, status: 'Active' },
      { id: 'premium', name: 'Premium basket', description: 'Lined basket with satin bow', image: '/images/basket-premium.jpg', price: 499, status: 'Active' },
      { id: 'luxury', name: 'Luxury hamper', description: 'Keepsake box with tissue and seal', image: '/images/basket-luxury.jpg', price: 999, status: 'Active' },
    ],
    skus: liveProducts.flatMap(product => skusFor(product, 0)),
    collections: families.map((family, i) => ({ id: slug(family.name), name: family.name, description: family.description, position: i + 1, featured: false, status: 'Visible' as const })),
    posts: articles.map(article => ({ id: article.slug, title: article.title, category: article.category, excerpt: article.excerpt, body: article.body.join('\n\n'), author: 'SENTBALE Studio', status: 'Published' as const, date: now })),
    homepage: { announcement: '', announcementOn: false, eyebrow: '', headline: 'More than a fragrance. A feeling.', subheadline: '', cta: 'Explore fragrances', ctaHref: '/shop', featured: '', showFinder: true, showJournal: true, showGifts: true },
    settings: { storeName: 'SENTBALE', email: '', phone: '', address: '', gstin: '', gstRate: 18, pricesIncludeTax: true, invoicePrefix: 'SB-', lowStock: 10, notifyOrders: true, notifyLowStock: true, notifyReviews: false },
    seen: '',
  };
}
