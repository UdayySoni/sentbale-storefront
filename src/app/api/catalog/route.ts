import { readCatalog } from '@/lib/catalog-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** The storefront catalogue. Products are edited through the admin workspace. */
export async function GET() {
  try { return Response.json(await readCatalog(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Could not load the catalogue.' }, { status: 500 }); }
}
