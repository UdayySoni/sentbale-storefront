'use client';
import Image, { getImageProps } from 'next/image';
import type { CSSProperties } from 'react';
import { products } from '@/lib/catalog';
import { useMediaImage } from './media-provider';

export function Photo({ src, alt, slot, className = '', priority = false, sizes: imageSizes = '(max-width: 700px) 100vw, 50vw' }: { src: string; alt: string; slot?: string; className?: string; priority?: boolean; sizes?: string }) {
  const product = products.find(p => p.image === src);
  const image = useMediaImage(slot || (product ? `product.${product.id}` : undefined), src, alt);
  return <Image src={image.src} alt={image.alt} fill sizes={imageSizes} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} unoptimized={image.src.startsWith('/api/')} style={{ objectPosition: image.position }} className={`photo ${className}`} />;
}
export function HeroPhoto() {
  const desktopImage = useMediaImage('hero.desktop', '/images/hero.png', 'Legacy perfume in an amber-lit landscape');
  const mobileImage = useMediaImage('hero.mobile', '/images/hero-mobile.png', desktopImage.alt);
  const common = { alt: desktopImage.alt, fill: true, sizes: '100vw', loading: 'eager' as const, fetchPriority: 'high' as const, className: 'photo' };
  const { props: desktop } = getImageProps({ ...common, src: desktopImage.src, unoptimized: desktopImage.src.startsWith('/api/') });
  const { props: mobile } = getImageProps({ ...common, src: mobileImage.src, unoptimized: mobileImage.src.startsWith('/api/') });
  return <picture style={{ '--hero-desktop-position': desktopImage.position, '--hero-mobile-position': mobileImage.position } as CSSProperties}><source media="(max-width: 700px)" srcSet={mobile.srcSet || mobile.src} sizes="100vw" /><img {...desktop} /></picture>;
}
