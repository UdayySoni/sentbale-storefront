import Storefront from '@/components/storefront';
import { families } from '@/lib/catalog';
import { readCatalog } from '@/lib/catalog-server';
import { readContent } from '@/lib/content-server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

const pages: Record<string, string> = {
  shop: 'All fragrances', collections: 'The collections', cart: 'Your bag', checkout: 'Checkout',
  account: 'My SENTBALE', 'account/orders': 'Your orders', 'account/wishlist': 'Your favourites',
  'account/profile': 'Your profile', 'our-story': 'Our story', journal: 'The journal', contact: 'Get in touch',
  shipping: 'Shipping & delivery', returns: 'Returns & care', privacy: 'Your privacy', terms: 'Terms & conditions', faq: 'Fragrance FAQ', 'account/addresses': 'Your address book', 'account/reset': 'Reset your password',
};
/** Page titles, looked up in the live catalogue and content so new products and posts have pages. */
async function titleFor(path: string): Promise<string | undefined> {
  if (pages[path]) return pages[path];
  if (/^account\/orders\/(DEMO|SB)-[a-z0-9-]+$/i.test(path)) return 'Order details';
  const [section, slug, extra] = path.split('/');
  if (extra) return undefined;
  if (section === 'product') return (await readCatalog()).products.find(p => p.id === slug)?.name;
  if (section === 'collections') {
    const visible = (await readContent()).collections;
    const family = families.find(f => f.name.toLowerCase() === slug && visible.some(c => c.id === slug));
    return family ? `${family.name} fragrances` : undefined;
  }
  if (section === 'journal') return (await readContent()).posts.find(a => a.slug === slug)?.title;
}
type Props = { params: Promise<{ slug: string[] }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${(await titleFor(slug.join('/'))) || 'Page not found'} — SENTBALE` };
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  if (!(await titleFor(slug.join('/')))) notFound();
  return <Storefront />;
}
