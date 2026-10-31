import type { Homepage } from './admin/types';

/** Storefront content edited in the admin (see content-server.ts). */
export type SitePost = { slug: string; title: string; category: string; excerpt: string; body: string[]; author: string; date: string; image: string };
export type SiteReview = { id: string; product: string; customer: string; rating: number; title: string; body: string; date: string };
export type SiteContent = {
  revision: string;
  homepage: Homepage;
  store: { name: string; email: string; phone: string; address: string };
  collections: { id: string; name: string; description: string; image: string; featured: boolean }[];
  posts: SitePost[];
  reviews: SiteReview[];
  /** Gift baskets on offer, cheapest first. */
  baskets: { id: string; name: string; description: string; image: string; price: number }[];
  payments: { online: boolean; test: boolean; cod: boolean; methods: string[] };
  /** True while test payments are possible: the storefront then shows its preview notices. */
  preview: boolean;
};
