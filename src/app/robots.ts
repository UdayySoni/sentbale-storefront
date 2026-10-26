import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';
import { indexableHere } from '@/lib/request-security';

// Read SITE_INDEXABLE / SITE_URL at request time, not at build time.
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  // A staging site (SITE_INDEXABLE unset), or any address but the main one, stays out of search engines entirely.
  if (!(await indexableHere())) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/account', '/cart', '/checkout'] },
    sitemap: `${config.siteUrl}/sitemap.xml`,
  };
}
