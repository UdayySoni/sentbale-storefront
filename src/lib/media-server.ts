import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { bumpRevision } from './catalog-server';
import { recordAudit } from './audit-server';
import { defaultMedia, type MediaManifest, type MediaValue, mediaSlots, isAllowedMediaSource } from './media';
import { listUploadNames, uploadExists } from './media-store';

export async function readMedia(): Promise<MediaManifest> {
  const database = await db();
  const [rows, [revision]] = await Promise.all([database.select().from(s.mediaSlots), database.select().from(s.meta).where(eq(s.meta.key, 'media_revision'))]);
  return { revision: revision?.value ?? '0', images: { ...defaultMedia.images, ...Object.fromEntries(rows.map(({ slot, src, alt, position }) => [slot, { src, alt, position }])) } };
}
export async function listUploads() {
  return (await listUploadNames()).map(name => ({ name, src: `/api/media/files/${name}` }));
}
// Rejects stale admin tabs: the save applies only if the revision is still the one the tab loaded.
export async function saveMedia(revision: string, images: Record<string, MediaValue>, actor: string): Promise<MediaManifest | null> {
  for (const value of Object.values(images)) {
    if (value.src.startsWith('/api/media/files/') && !(await uploadExists(value.src.slice('/api/media/files/'.length)))) throw new Error(`Upload not found: ${value.src}`);
  }
  const updated = await (await db()).transaction(async tx => {
    const next = await bumpRevision(tx, 'media_revision', revision);
    if (!next) return null;
    for (const [slot, { src, alt, position }] of Object.entries(images)) {
      await tx.insert(s.mediaSlots).values({ slot, src, alt, position }).onConflictDoUpdate({ target: s.mediaSlots.slot, set: { src, alt, position } });
    }
    await recordAudit(tx, actor, 'Updated images', Object.keys(images).map(slot => mediaSlots.find(m => m.id === slot)?.label ?? slot).join(', '));
    return next;
  });
  return updated ? readMedia() : null;
}
export function validImageChanges(images: unknown): images is Record<string, MediaValue> {
  if (!images || typeof images !== 'object' || Array.isArray(images)) return false;
  return Object.entries(images).every(([key, value]) => mediaSlots.some(s => s.id === key) && value && typeof value.src === 'string' && isAllowedMediaSource(value.src) && typeof value.alt === 'string' && value.alt.length <= 250 && typeof value.position === 'string' && /^(100|[0-9]{1,2})% (100|[0-9]{1,2})%$/.test(value.position));
}
