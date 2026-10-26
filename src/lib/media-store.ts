import 'server-only';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

/**
 * Where uploaded images live. With MEDIA_BUCKET set (Firebase App Hosting, Cloud Run) they go to that
 * Cloud Storage bucket under `media/`, because those servers lose their disk on every restart; otherwise
 * to the folder in MEDIA_DIR (default data/media). File names are already unique, so uploads never overwrite.
 */
const UPLOAD_NAME = /^[a-f0-9-]{36}\.(png|jpg|webp)$/;
const PREFIX = 'media/';
export const isUploadName = (name: string) => UPLOAD_NAME.test(name);

type Bucket = import('@google-cloud/storage').Bucket;
const shared = globalThis as typeof globalThis & { sentbaleBucket?: Promise<Bucket> };
/** The storage client loads only when a bucket is configured. On Google's servers it signs in as the service account. */
function bucket() {
  shared.sentbaleBucket ??= import('@google-cloud/storage').then(({ Storage }) => new Storage().bucket(config.mediaBucket));
  return shared.sentbaleBucket;
}
const local = (name: string) => path.join(/*turbopackIgnore: true*/ config.mediaDir, name);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT' || (error as { code?: number }).code === 404;

export async function saveUpload(name: string, bytes: Buffer, contentType: string) {
  if (config.mediaBucket) return (await bucket()).file(PREFIX + name).save(bytes, { contentType, resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { cacheControl: 'public, max-age=31536000, immutable' } });
  await mkdir(config.mediaDir, { recursive: true });
  await writeFile(local(name), bytes, { flag: 'wx' });
}

/** The image's bytes, or null if there is no such upload. */
export async function readUpload(name: string): Promise<Buffer | null> {
  try {
    if (config.mediaBucket) return (await (await bucket()).file(PREFIX + name).download())[0];
    return await readFile(local(name));
  } catch (error) { if (missing(error)) return null; throw error; }
}

export async function uploadExists(name: string) {
  if (config.mediaBucket) return (await (await bucket()).file(PREFIX + name).exists())[0];
  try { await access(local(name)); return true; } catch { return false; }
}

export async function listUploadNames(): Promise<string[]> {
  try {
    const names = config.mediaBucket
      ? (await (await bucket()).getFiles({ prefix: PREFIX }))[0].map(file => file.name.slice(PREFIX.length))
      : await readdir(config.mediaDir);
    return names.filter(isUploadName);
  } catch (error) { if (missing(error)) return []; throw error; }
}
