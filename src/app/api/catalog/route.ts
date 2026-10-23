import { readCatalog, saveCatalog, validProducts } from '@/lib/catalog-server';
import { adminWriteDenied, currentAdmin } from '@/lib/admin-auth';
import { products } from '@/lib/catalog';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return Response.json(await readCatalog(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'Could not load the catalogue.' }, { status: 500 }); }
}
export async function PUT(request: Request) {
  const denied = await adminWriteDenied(request, 'products');
  if (denied) return denied;
  try {
    const raw = await request.text();
    if (raw.length > 40000) return Response.json({ error: 'Product data is too large.' }, { status: 413 });
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid product data.' }, { status: 400 }); }
    // This form edits the built-in fragrances; products added in the admin are saved through the workspace.
    const builtIn = Array.isArray(body?.products) ? body.products.filter((p: { id?: unknown }) => products.some(own => own.id === p?.id)) : null;
    if (!body || typeof body.revision !== 'string' || !validProducts(builtIn)) return Response.json({ error: 'Check product fields. Prices must be whole rupees between 1 and 1,000,000.' }, { status: 400 });
    const saved = await saveCatalog(body.revision, builtIn, (await currentAdmin())?.name || 'Admin');
    if (!saved) return Response.json({ error: 'Another tab saved newer changes. Reload the catalogue before editing again.' }, { status: 409 });
    return Response.json(saved);
  } catch { return Response.json({ error: 'Could not save products. Please try again.' }, { status: 500 }); }
}
