import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mediaDirectory } from '@/lib/media-server';
import { adminWriteDenied } from '@/lib/admin-auth';
export const runtime = 'nodejs';
const LIMIT = 8 * 1024 * 1024;
export async function POST(request: Request) {
  const denied = await adminWriteDenied(request, 'media');
  if (denied) return denied;
  if (Number(request.headers.get('content-length') || 0) > LIMIT + 8192) return Response.json({ error: 'Choose an image smaller than 8 MB.' }, { status: 413 });
  try {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || !file.size || file.size > LIMIT) return Response.json({ error: 'Choose a PNG, JPEG or WebP image smaller than 8 MB.' }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png' : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg' : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
    if (!ext) return Response.json({ error: 'This file is not a supported image. Use PNG, JPEG or WebP.' }, { status: 415 });
    const name = `${randomUUID()}.${ext}`;
    await mkdir(mediaDirectory, { recursive: true });
    await writeFile(path.join(/*turbopackIgnore: true*/ mediaDirectory, name), bytes, { flag: 'wx' });
    return Response.json({ src: `/api/media/files/${name}`, name }, { status: 201 });
  } catch { return Response.json({ error: 'The image could not be uploaded. Please try again.' }, { status: 500 }); }
}
