'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { SiteContent } from '@/lib/content';
import { useLive } from '@/lib/use-live';

const Context = createContext<SiteContent | null>(null);
/** Store content edited in the admin; admin saves announce themselves so open tabs refresh at once. */
export function ContentProvider({ initial, children }: { initial: SiteContent; children: ReactNode }) {
  const content = useLive('/api/content', 'sentbale-content', initial);
  return <Context.Provider value={content}>{children}</Context.Provider>;
}
export function useContent() {
  const content = useContext(Context);
  if (!content) throw new Error('useContent must be used inside ContentProvider.');
  return content;
}
