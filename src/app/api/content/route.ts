import { readContent } from '@/lib/content-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try { return Response.json(await readContent(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { console.error('[api/content]', error); return Response.json({ error: 'Could not load the store content.' }, { status: 500 }); }
}
