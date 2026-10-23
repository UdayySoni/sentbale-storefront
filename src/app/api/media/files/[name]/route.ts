import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mediaDirectory } from '@/lib/media-server';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(name)) return new Response('Not found', { status: 404 });
  try {
    const bytes = await readFile(path.join(mediaDirectory, name));
    return new Response(bytes, { headers: { 'Content-Type': name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response('Not found', { status: 404 }); }
}
