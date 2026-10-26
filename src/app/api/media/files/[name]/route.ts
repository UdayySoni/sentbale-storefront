import { isUploadName, readUpload } from '@/lib/media-store';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isUploadName(name)) return new Response('Not found', { status: 404 });
  try {
    const bytes = await readUpload(name);
    if (!bytes) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { console.error('[api/media/files]', error); return new Response('Not found', { status: 404 }); }
}
