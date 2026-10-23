import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';
import { readCatalog } from '@/lib/catalog-server';
import { readContent } from '@/lib/content-server';

// Built from the live catalogue and content, so new products and posts appear without a redeploy.
export const dynamic = 'force-dynamic';

const pages = ['', 'shop', 'collections', 'journal', 'our-story', 'contact', 'faq', 'shipping', 'returns', 'privacy'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ products }, content] = await Promise.all([readCatalog(), readContent()]);
  const url = (path: string) => `${config.siteUrl}/${path}`.replace(/\/$/, '');
  return [
    ...pages.map(path => ({ url: url(path) })),
    ...products.map(p => ({ url: url(`product/${p.id}`) })),
    ...content.collections.map(c => ({ url: url(`collections/${c.id}`) })),
    ...content.posts.map(p => ({ url: url(`journal/${p.slug}`), ...(Date.parse(p.date) ? { lastModified: new Date(p.date) } : {}) })),
  ];
}
