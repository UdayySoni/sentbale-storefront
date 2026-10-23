'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { products, type Product } from '@/lib/catalog';
import { useLive } from '@/lib/use-live';
type Catalog = { revision: string; products: Product[] };
const Context = createContext(products);
export function CatalogProvider({ initial, children }: { initial: Catalog; children: ReactNode }) {
  const catalog = useLive('/api/catalog', 'sentbale-catalog', initial);
  return <Context.Provider value={catalog.products}>{children}</Context.Provider>;
}
export function useProducts() { return useContext(Context); }
