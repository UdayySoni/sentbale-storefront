import type { Family } from '@/lib/catalog';

export type OrderStatus = 'Pending payment' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Refunded';
/** `price` is the lowest size price, kept by the server; sizes, prices and stock are the product's skus. */
export type AdminProduct = { id: string; name: string; family: Family; mood: string; description: string; price: number; image: string; images: string[]; color: string; notes: [string[], string[], string[]]; badge?: string; status: 'Active' | 'Draft' };
export type Sku = { id: string; productId: string; product: string; size: number; sku: string; price: number; stock: number; threshold: number };
export type Order = { id: string; number: number; customer: string; email: string; skuId: string; item: string; qty: number; amount: number; status: OrderStatus; payment: string; paid: 'Paid' | 'Pending' | 'Failed' | 'Refunded'; date: string; phone?: string; address?: string; coupon?: string;
  /** Courier and tracking number, Shiprocket's status, or why sending failed; canShip when it can be (re)sent. */
  shipping?: string; shipError?: string; canShip?: boolean;
  /** What to pack for a gift order: basket, card wording and the perfumes that go in it. */
  gift?: string;
  /** Everything ordered, and the Shiprocket side of the order for Admin → Shiprocket. */
  items?: string[]; ship?: { ref: string; shipmentId: string; awb: string; courier: string; status: string; error: string; syncedAt: string; trackingUrl: string; choice: string } };
export type Customer = { id: string; name: string; email: string; phone: string; city: string; tag: 'VIP' | 'Regular' | 'New'; status: 'Active' | 'Blocked'; joined: string };
export type Collection = { id: string; name: string; description: string; image?: string; position: number; featured: boolean; status: 'Visible' | 'Hidden' };
export type Coupon = { id: string; code: string; type: 'Percent' | 'Flat' | 'Free shipping'; value: number; minOrder: number; used: number; limit: number; expires: string; status: 'Active' | 'Paused' | 'Expired' };
export type Review = { id: string; product: string; customer: string; rating: number; title: string; body: string; status: 'Pending' | 'Published' | 'Hidden'; date: string };
export type Post = { id: string; title: string; category: string; excerpt: string; body: string; author: string; status: 'Published' | 'Draft'; date: string };
export type Zone = { id: string; name: string; regions: string; standard: number; express: number; freeAbove: number; eta: string; status: 'Active' | 'Paused' };
export type GiftBasket = { id: string; name: string; description: string; image?: string; price: number; status: 'Active' | 'Paused' };
export type Partner = { id: string; name: string; service: string; cod: boolean; tracking: string; status: 'Active' | 'Paused' };
export type PayMethod = { id: string; name: string; provider: string; fee: number; status: 'Enabled' | 'Disabled' };
export type Access = 'none' | 'view' | 'manage';
export type Role = { id: string; name: string; description: string; access: Record<string, Access> };
export type Member = { id: string; name: string; email: string; role: string; status: 'Active' | 'Invited' | 'Suspended'; lastActive: string };
export type Enquiry = { id: string; kind: 'contact' | 'newsletter'; name: string; email: string; subject: string; message: string; handled: boolean; date: string };
export type AuditEntry = { id: string; at: string; actor: string; action: string; target: string };
export type Homepage = { announcement: string; announcementOn: boolean; eyebrow: string; headline: string; subheadline: string; cta: string; ctaHref: string; featured: string; showFinder: boolean; showJournal: boolean; showGifts: boolean };
export type Settings = { storeName: string; email: string; phone: string; address: string; gstin: string; gstRate: number; pricesIncludeTax: boolean; invoicePrefix: string; lowStock: number; notifyOrders: boolean; notifyLowStock: boolean; notifyReviews: boolean };

export type Db = {
  version: number;
  products: AdminProduct[]; skus: Sku[]; orders: Order[]; customers: Customer[]; collections: Collection[];
  coupons: Coupon[]; reviews: Review[]; posts: Post[]; zones: Zone[]; partners: Partner[]; methods: PayMethod[]; baskets: GiftBasket[];
  roles: Role[]; team: Member[]; audit: AuditEntry[]; enquiries: Enquiry[];
  homepage: Homepage; settings: Settings; seen: string;
  /** What the signed-in admin may do in each section; set by the server. */
  access?: Record<string, Access>;
  me?: { id: string; name: string; role: string };
};
export type ListKey = 'baskets' | 'products' | 'skus' | 'orders' | 'customers' | 'collections' | 'coupons' | 'reviews' | 'posts' | 'zones' | 'partners' | 'methods' | 'roles' | 'team' | 'audit' | 'enquiries';
// Rows are edited through one generic table/form, so they are handled structurally there.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any> & { id: string };

/** Stock is only watched once an alert level is set; sizes with none are "Not tracked". */
export const isLowStock = (sku: Pick<Sku, 'stock' | 'threshold'>) => sku.threshold > 0 && sku.stock <= sku.threshold;
export const stockLevel = (sku: Pick<Sku, 'stock' | 'threshold'>) => sku.stock <= 0 ? (sku.threshold > 0 ? 'Out of stock' : 'Not tracked') : isLowStock(sku) ? 'Low stock' : 'In stock';
