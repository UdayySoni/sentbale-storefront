import type { Metadata } from 'next';
import './globals.css';
import '@/components/customer-pages.css';
import '@/components/premium.css';
import { MediaProvider } from '@/components/media-provider';
import { CatalogProvider } from '@/components/catalog-provider';
import { ContentProvider } from '@/components/content-provider';
import { readCatalog } from '@/lib/catalog-server';
import { readContent } from '@/lib/content-server';
import { readMedia } from '@/lib/media-server';
import { config } from '@/lib/config';

export function generateMetadata(): Metadata {
  return {
    title: 'SENTBALE — Scents that stay',
    description: 'Discover a world of fragrance. Explore the SENTBALE collection of oud, floral, woody and citrus perfumes.',
    // Search engines are kept out until the store is launched (SITE_INDEXABLE=true).
    robots: config.indexable ? { index: true, follow: true } : { index: false, follow: false },
    ...(config.siteOrigins[0] ? { metadataBase: new URL(config.siteOrigins[0]) } : {}),
  };
}

export const dynamic = 'force-dynamic';
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [media, catalog, content] = await Promise.all([readMedia(), readCatalog(), readContent()]);
  return <html lang="en" data-scroll-behavior="smooth"><body><CatalogProvider initial={catalog}><MediaProvider initial={media}><ContentProvider initial={content}>{children}</ContentProvider></MediaProvider></CatalogProvider></body></html>;
}
