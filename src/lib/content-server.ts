import 'server-only';
import { createHash } from 'node:crypto';
import { asc } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { articles } from './catalog';
import { razorpayEnabled, testPaymentsEnabled } from './config';
import { records, setting } from './records-server';
import type { SiteContent } from './content';

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'story';

/** Everything the storefront shows that is edited in the admin, apart from products and images. */
export async function readContent(): Promise<SiteContent> {
  const database = await db();
  const [homepage, settings, collections, posts, reviews, methods, baskets] = await Promise.all([
    setting('homepage', database), setting('settings', database),
    database.select().from(s.collections).orderBy(asc(s.collections.position)),
    records('posts', database), records('reviews', database), records('methods', database), records('baskets', database),
  ]);
  const used = new Set<string>();
  const published = posts.filter(p => p.status === 'Published').sort((a, b) => String(b.date).localeCompare(String(a.date))).map(p => {
    // Built-in stories keep their original address; new ones get one from their title.
    const builtIn = articles.find(a => a.slug === p.id);
    let slug = builtIn ? builtIn.slug : slugify(p.title);
    while (used.has(slug)) slug += '-2';
    used.add(slug);
    return { slug, title: p.title, category: p.category, excerpt: p.excerpt, body: String(p.body || '').split(/\n\s*\n/).map(t => t.trim()).filter(Boolean), author: p.author, date: p.date, image: builtIn?.image ?? '/images/hero.png' };
  });
  const content = {
    homepage,
    store: { name: settings.storeName || 'SENTBALE', email: settings.email, phone: settings.phone, address: settings.address },
    collections: collections.filter(c => c.status !== 'Hidden').map(c => ({ id: c.id, name: c.name, description: c.description, image: c.image ?? '', featured: c.featured })),
    posts: published,
    reviews: reviews.filter(r => r.status === 'Published').map(r => ({ id: r.id, product: r.product, customer: r.customer, rating: Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5))), title: r.title, body: r.body, date: r.date })),
    baskets: baskets.filter(b => b.status === 'Active').map(b => ({ id: b.id, name: b.name, description: b.description, image: b.image ?? '', price: Number(b.price) || 0 })).sort((a, b) => a.price - b.price),
    payments: {
      online: razorpayEnabled(), test: testPaymentsEnabled(),
      cod: methods.some(m => m.status === 'Enabled' && (/^(cod|cash on delivery)$/i.test(String(m.name).trim()) || /cash on delivery/i.test(String(m.provider)))),
      methods: methods.filter(m => m.status === 'Enabled').map(m => String(m.name)),
    },
    preview: testPaymentsEnabled(),
  };
  // A fingerprint of the content, so open tabs only re-render when something actually changed.
  return { revision: createHash('sha1').update(JSON.stringify(content)).digest('hex').slice(0, 16), ...content };
}
