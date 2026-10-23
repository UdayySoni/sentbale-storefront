'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { defaultMedia, type MediaManifest } from '@/lib/media';
import { useLive } from '@/lib/use-live';
const MediaContext = createContext(defaultMedia);
export function MediaProvider({ initial, children }: { initial: MediaManifest; children: ReactNode }) {
  const media = useLive('/api/media', 'sentbale-media', initial);
  return <MediaContext.Provider value={media}>{children}</MediaContext.Provider>;
}
export function useMediaImage(slot: string | undefined, fallback: string, alt: string) {
  const media = useContext(MediaContext);
  return (slot && media.images[slot]) || { src: fallback, alt, position: '50% 50%' };
}
