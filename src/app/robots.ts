import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

// Read SITE_INDEXABLE / SITE_URL at request time, not at build time.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // A staging site (SITE_INDEXABLE unset) stays out of search engines entirely.
  if (!config.indexable) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/account', '/cart', '/checkout'] },
    sitemap: `${config.siteUrl}/sitemap.xml`,
  };
}
