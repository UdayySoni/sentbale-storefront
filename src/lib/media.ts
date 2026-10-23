export type MediaSlot = { id: string; label: string; group: string; src: string; alt: string; position: string; hint: string };
export type MediaValue = Pick<MediaSlot, 'src' | 'alt' | 'position'>;
export type MediaManifest = { revision: string; images: Record<string, MediaValue> };
export const mediaSlots: MediaSlot[] = [
  { id: 'hero.desktop', label: 'Desktop campaign', group: 'Banners', src: '/images/hero.png', alt: 'Legacy perfume in an amber-lit stone landscape', position: '50% 50%', hint: 'Wide landscape. Leave space on the left for the headline.' },
  { id: 'hero.mobile', label: 'Mobile campaign', group: 'Banners', src: '/images/hero-mobile.png', alt: 'Legacy perfume in a warm canyon with magnolia', position: '65% 50%', hint: 'Portrait. Keep the upper half dark and uncluttered.' },
  { id: 'page.hero', label: 'Interior page banner', group: 'Banners', src: '/images/hero.png', alt: '', position: '70% 48%', hint: 'Wide landscape. Decorative backdrop for page titles.' },
  { id: 'home.story', label: 'Homepage story', group: 'Editorial', src: '/images/hero.png', alt: 'Amber light falling across a rocky fragrance landscape', position: '74% 50%', hint: 'Landscape or square. Story section beside the brand introduction.' },
  { id: 'story.detail', label: 'Our Story feature', group: 'Editorial', src: '/images/aurora.png', alt: 'Aurora perfume with delicate magnolia petals', position: '50% 50%', hint: 'Square or portrait. The nature and fragrance feature.' },
  { id: 'contact.image', label: 'Contact feature', group: 'Editorial', src: '/images/legacy.png', alt: 'Legacy fragrance in warm light', position: '50% 50%', hint: 'Square. Image beside the contact form.' },
  { id: 'account.hero', label: 'Account welcome', group: 'Banners', src: '/images/hero.png', alt: 'Legacy, a warm amber fragrance', position: '65% 50%', hint: 'Portrait crop. Leave room for the welcome text.' },
  ...['legacy', 'noir', 'aurora', 'citrus-bloom'].map((id, i) => ({ id: `product.${id}`, label: ['Legacy', 'Noir', 'Aurora', 'Citrus Bloom'][i], group: 'Products', src: `/images/${id === 'citrus-bloom' ? 'citrus' : id}.png`, alt: `${['Legacy', 'Noir', 'Aurora', 'Citrus Bloom'][i]} eau de parfum bottle`, position: '50% 50%', hint: 'Square or portrait. Updates product cards, details, search, favourites and bag.' })),
  ...['oud', 'floral', 'citrus', 'woody'].map((id, i) => ({ id: `collection.${id}`, label: `${id[0].toUpperCase()}${id.slice(1)} collection`, group: 'Collections', src: `/images/${['legacy', 'aurora', 'citrus', 'noir'][i]}.png`, alt: `${id} fragrance world`, position: '50% 48%', hint: 'Portrait or square. Collection card and collection detail banner.' })),
  ...['the-art-of-oud', 'find-your-signature', 'a-daily-ritual'].map((id, i) => ({ id: `journal.${id}`, label: ['The art of oud', 'A scent that feels like you', 'The beauty of a daily ritual'][i], group: 'Journal', src: `/images/${['legacy', 'aurora', 'citrus'][i]}.png`, alt: ['Amber perfume and oud-inspired textures', 'Aurora fragrance with magnolia', 'Citrus fragrance with bergamot'][i], position: '50% 40%', hint: 'Landscape crop. Updates both the journal card and the article.' })),
];
export const defaultMedia: MediaManifest = { revision: '0', images: Object.fromEntries(mediaSlots.map(({ id, src, alt, position }) => [id, { src, alt, position }])) };
export const builtInImages = [...new Set(mediaSlots.map(s => s.src))];
export const isAllowedMediaSource = (src: string) => builtInImages.includes(src) || /^\/api\/media\/files\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(src);
