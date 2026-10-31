/** A fragrance family; it is also the collection the product is shown in. */
export type Family = string;
export type Product = {
  id: string; name: string; family: Family; mood: string; description: string;
  image: string; /** More photos, after the main one. */ images?: string[]; price: number; color: string; notes: [string[], string[], string[]]; badge?: string;
  /** Selling price per size in ml, from the product's variants. Absent in the built-in defaults. */
  prices?: Record<number, number>;
  /** Tracked sizes with no stock left. */
  soldOut?: Size[];
};
// Illustrative catalogue from the supplied blueprint. Confirm prices and claims before launch.
export const products: Product[] = [
  { id: 'legacy', name: 'Legacy', family: 'Oud', mood: 'Bold. Warm. Unforgettable.', price: 4999, image: '/images/legacy.png', color: '#93602e', badge: 'THE SIGNATURE', description: 'For the moments that become memories. Saffron opens into a rich heart of oud and rose, before settling into the quiet warmth of amber. A scent with presence, and a story all its own.', notes: [['Saffron', 'Bergamot'], ['Rose', 'Jasmine'], ['Oud', 'Amber']] },
  { id: 'noir', name: 'Noir', family: 'Woody', mood: 'Quiet confidence. After dark.', price: 4999, image: '/images/noir.png', color: '#33332e', description: 'An invitation to the unexpected. A spark of spice gives way to smoky woods and soft musk. Intimate, intriguing, and made for the hours that belong to you.', notes: [['Black pepper', 'Cardamom'], ['Cedar', 'Iris'], ['Vetiver', 'Musk']] },
  { id: 'aurora', name: 'Aurora', family: 'Floral', mood: 'Soft light. A new beginning.', price: 4999, image: '/images/aurora.png', color: '#c0a47d', badge: 'DISCOVER', description: 'The feeling of the first light on your skin. Luminous florals unfold around a delicate heart of jasmine, grounded by a soft, lingering base of sandalwood.', notes: [['Mandarin', 'Pear'], ['Jasmine', 'Magnolia'], ['Sandalwood', 'White musk']] },
  { id: 'citrus-bloom', name: 'Citrus Bloom', family: 'Citrus', mood: 'Bright days. Endless possibility.', price: 4499, image: '/images/citrus.png', color: '#6b7047', description: 'A little sunshine, bottled. Fresh bergamot and green leaves meet an uplifting orange blossom heart. An effortless companion for wherever the day takes you.', notes: [['Bergamot', 'Lemon'], ['Neroli', 'Orange blossom'], ['Cedar', 'Musk']] },
];
/** Bottle size in ml. Each product has its own sizes, set in the admin. */
export type Size = number;
/** The sizes a new database starts with, on the price ladder below. */
export const defaultSizes: Size[] = [50, 100, 200];
export const ladderPrice = (base: number, size: Size) => base + (size === 100 ? 2000 : size === 200 ? 5000 : 0);
/** The sizes a product is sold in, smallest first. */
export const sizesOf = (p: Pick<Product, 'prices'>): Size[] => p.prices ? Object.keys(p.prices).map(Number).sort((a, b) => a - b) : defaultSizes;
export const priceFor = (p: Pick<Product, 'price' | 'prices'>, size: Size) => p.prices ? p.prices[size] ?? 0 : ladderPrice(p.price, size);
/** The size shown first: the smallest one still in stock. */
export const firstSize = (p: Pick<Product, 'prices' | 'soldOut'>) => { const all = sizesOf(p); return all.find(s => !p.soldOut?.includes(s)) ?? all[0]; };
/** The lowest price the product sells for, with its size, for "from" prices. */
export function fromPrice(p: Pick<Product, 'price' | 'prices'>) {
  const all = sizesOf(p), prices = all.map(s => priceFor(p, s)), low = Math.min(...prices);
  return { price: low, size: all[prices.indexOf(low)] };
}
export const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
export const families: { name: Family; description: string; image: string; number: string }[] = [
  { name: 'Oud', description: 'Rich. Bold. Unforgettable.', image: '/images/family-oud.jpg', number: '01' },
  { name: 'Floral', description: 'Grace in every unfolding.', image: '/images/family-floral.jpg', number: '02' },
  { name: 'Citrus', description: 'A brighter kind of energy.', image: '/images/family-citrus.jpg', number: '03' },
  { name: 'Woody', description: 'Deep roots. Quiet warmth.', image: '/images/family-woody.jpg', number: '04' },
];
/** The general photo for a family's collection; the products inside show their own. */
export const familyPhoto = (name: string) => [...families, { name: 'Musk', image: '/images/family-musk.jpg' }].find(f => f.name.toLowerCase() === name.toLowerCase())?.image;
export const articles = [
  { slug: 'the-art-of-oud', title: 'The art of oud', category: 'INGREDIENT STORIES', image: '/images/legacy.png', excerpt: 'An introduction to the warm, woody note at the heart of Legacy.', body: ['Some notes announce themselves. Others draw you closer. Oud belongs to the latter: woody, textured, and wonderfully complex.', 'In the Legacy fragrance concept, oud sits alongside rose and jasmine, with saffron at the opening and amber in the base. The composition explores contrast: brightness and depth, softness and presence.', 'When discovering a new scent, give it time. Notice the first impression, return to it later, and find the part of its story that feels like yours.'] },
  { slug: 'find-your-signature', title: 'A scent that feels like you', category: 'THE FRAGRANCE GUIDE', image: '/images/aurora.png', excerpt: 'Let curiosity lead you to your next signature fragrance.', body: ['Your signature fragrance can begin with a feeling. The comfort of warm woods. The brightness of citrus. The softness of a favourite flower.', 'Explore one family at a time and pay attention to what draws you in. Our scent finder offers a starting point, with a small selection based on the mood and notes you enjoy.', 'There is no need to choose a scent for every occasion at once. Begin with one that feels natural, and let your collection grow with you.'] },
  { slug: 'a-daily-ritual', title: 'The beauty of a daily ritual', category: 'LIFE, SCENTED', image: '/images/citrus.png', excerpt: 'A quiet moment. A favourite fragrance. A day made your own.', body: ['A fragrance can turn an ordinary moment into a personal ritual. Before the day begins, pause and choose the feeling you want to carry with you.', 'A fresh citrus composition can bring to mind an open window and morning light. A warmer woody scent can feel like a familiar place at the end of the day.', 'Make space for those small moments. Sometimes they are the ones that stay.'] },
];
