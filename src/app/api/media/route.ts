import { readMedia, listUploads, saveMedia, validImageChanges } from '@/lib/media-server';
import { adminWriteDenied, currentAdmin } from '@/lib/admin-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return Response.json({ ...(await readMedia()), uploads: (await currentAdmin()) ? await listUploads() : [] }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'The local media library could not be read.' }, { status: 500 }); }
}
export async function PUT(request: Request) {
  const denied = await adminWriteDenied(request, 'media');
  if (denied) return denied;
  if (Number(request.headers.get('content-length') || 0) > 40000) return Response.json({ error: 'Image settings are too large.' }, { status: 413 });
  try {
    const body = await request.json();
    if (typeof body.revision !== 'string' || !validImageChanges(body.images)) return Response.json({ error: 'Please check the image selections, descriptions and crop positions.' }, { status: 400 });
    const saved = await saveMedia(body.revision, body.images, (await currentAdmin())?.name || 'Admin');
    if (!saved) return Response.json({ error: 'Another tab saved newer changes. Reload the library before editing again.' }, { status: 409 });
    return Response.json(saved);
  } catch { return Response.json({ error: 'Changes could not be saved. Your existing images are unchanged.' }, { status: 500 }); }
}
