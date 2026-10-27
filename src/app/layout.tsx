import type { Metadata } from 'next';
import { DM_Sans, Jost, Playfair_Display } from 'next/font/google';
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
import { indexableHere } from '@/lib/request-security';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'SENTBALE — Scents that stay',
    description: 'Discover a world of fragrance. Explore the SENTBALE collection of oud, floral, woody and citrus perfumes.',
    // Search engines are kept out until the store is launched (SITE_INDEXABLE=true), and off any address but the main one.
    robots: (await indexableHere()) ? { index: true, follow: true } : { index: false, follow: false },
    ...(config.siteOrigins[0] ? { metadataBase: new URL(config.siteOrigins[0]) } : {}),
  };
}

// Headings in Playfair Display, reading text in DM Sans, labels and buttons in Jost (see --serif, --sans and --label in globals.css).
const display = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-display', display: 'swap' });
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const label = Jost({ subsets: ['latin'], variable: '--font-label', display: 'swap' });

export const dynamic = 'force-dynamic';
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [media, catalog, content] = await Promise.all([readMedia(), readCatalog(), readContent()]);
  return <html lang="en" data-scroll-behavior="smooth" className={`${display.variable} ${body.variable} ${label.variable}`}><body><CatalogProvider initial={catalog}><MediaProvider initial={media}><ContentProvider initial={content}>{children}</ContentProvider></MediaProvider></CatalogProvider></body></html>;
}
