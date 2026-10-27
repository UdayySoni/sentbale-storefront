'use client';
import { useProducts } from '@/components/catalog-provider';
import { useEffect, useState } from 'react';
import { firstSize, priceFor, sizesOf, type Size } from './catalog';

export type CartLine = { id: string; size: Size; quantity: number };
export type DemoOrder = { id: string; date: string; items: CartLine[]; total: number; name: string; shipping?: number;
  number?: number; status?: string; paymentStatus?: string; paymentMethod?: string; subtotal?: number; discount?: number; couponCode?: string | null; tax?: number; taxIncluded?: boolean; address?: { line: string; city: string; state: string; pincode: string }; snapshot?: (CartLine & { name: string; unitPrice: number; image: string })[];
  /** Courier tracking once the order has been handed to Shiprocket. */
  tracking?: { courier?: string; awb?: string; status?: string; url?: string } };
const CART_KEY = 'sentbale.cart.v1';
const WISH_KEY = 'sentbale.wishlist.v1';

export function useStore() {
  const products = useProducts();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      const lines: unknown = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      // Lines for products or sizes no longer sold are dropped.
      if (Array.isArray(lines)) setCart(lines.filter((line): line is CartLine => !!line && products.some(p => p.id === line.id && sizesOf(p).includes(line.size)) && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 10));
      const wishes: unknown = JSON.parse(localStorage.getItem(WISH_KEY) || '[]');
      if (Array.isArray(wishes)) setWishlist(wishes.filter(id => typeof id === 'string' && products.some(p => p.id === id)));
    } catch { setStorageError(true); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); localStorage.setItem(WISH_KEY, JSON.stringify(wishlist)); }
    catch { setStorageError(true); }
  }, [cart, wishlist, ready]);
  function add(id: string, size?: Size, quantity = 1) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    if (size === undefined) size = firstSize(product);
    setCart(lines => {
      const match = lines.find(l => l.id === id && l.size === size);
      return match ? lines.map(l => l === match ? { ...l, quantity: Math.min(10, l.quantity + quantity) } : l) : [...lines, { id, size, quantity: Math.min(10, quantity) }];
    });
  }
  function quantity(id: string, size: Size, count: number) {
    setCart(lines => count <= 0 ? lines.filter(l => !(l.id === id && l.size === size)) : lines.map(l => l.id === id && l.size === size ? { ...l, quantity: Math.min(10, count) } : l));
  }
  function toggleWish(id: string) { setWishlist(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]); }
  // A product that leaves the catalogue while in the bag counts as nothing until checkout removes it.
  const total = cart.reduce((sum, l) => { const p = products.find(p => p.id === l.id); return sum + (p ? priceFor(p, l.size) * l.quantity : 0); }, 0);
  return { cart, wishlist, ready, storageError, add, quantity, toggleWish, total, count: cart.reduce((sum, l) => sum + l.quantity, 0), clear: () => setCart([]) };
}
