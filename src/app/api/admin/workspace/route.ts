import { and, desc, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db, schema } from '@/db';
import { adminWriteDenied, currentAdmin } from '@/lib/admin-auth';
import { applyChanges, changesSchema, importable, importWorkspace, readWorkspace, resetWorkspace, WorkspaceError } from '@/lib/admin/workspace-server';
import { needsRefresh, refreshTracking } from '@/lib/shiprocket-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const LIMIT = 2 * 1024 * 1024;

/** The admin workspace the signed-in admin may see, in the shape the admin panel works with. */
export async function GET() {
  try {
    const admin = await currentAdmin();
    if (!admin) return reply({ error: 'Your admin session has ended. Please sign in again.' }, 401);
    // "Last active" for Team members, written at most every five minutes.
    await (await db()).update(schema.admins).set({ lastActiveAt: new Date() })
      .where(and(eq(schema.admins.id, admin.id), or(isNull(schema.admins.lastActiveAt), lt(schema.admins.lastActiveAt, new Date(Date.now() - 300000)))));
    // Orders on their way get the courier's latest status (the webhook usually has it already).
    const moving = await (await db()).select({ id: schema.orders.id, shipRef: schema.orders.shipRef, status: schema.orders.status, shipSyncedAt: schema.orders.shipSyncedAt })
      .from(schema.orders).where(and(isNotNull(schema.orders.shipRef), inArray(schema.orders.status, ['Processing', 'Shipped']))).orderBy(desc(schema.orders.number)).limit(50);
    await refreshTracking(moving.filter(needsRefresh).map(o => o.id));
    const [workspace, canImport] = await Promise.all([readWorkspace(admin), importable()]);
    return reply({ db: workspace, importable: canImport });
  } catch (error) { console.error('[api/admin/workspace]', error); return reply({ error: 'The admin workspace could not be loaded.' }, 500); }
}

/** `apply` saves one change set, `import` copies a browser-kept workspace once, `reset` clears it. */
export async function POST(request: Request) {
  const denied = await adminWriteDenied(request);
  if (denied) return denied;
  const admin = (await currentAdmin())!;
  try {
    const raw = await request.text();
    if (raw.length > LIMIT) return reply({ error: 'This change is too large to save at once.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'Invalid request.' }, 400); }
    if (body?.action === 'apply') {
      const parsed = changesSchema.safeParse(body.changes);
      if (!parsed.success) return reply({ error: 'These changes could not be read. Reload the page and try again.' }, 400);
      const { catalogChanged, notices } = await applyChanges(admin, parsed.data);
      return reply({ db: await readWorkspace(admin), catalogChanged, notices });
    }
    if (body?.action === 'import') {
      if (!body.db || typeof body.db !== 'object') return reply({ error: 'Nothing to import.' }, 400);
      const result = await importWorkspace(admin, body.db);
      if (!result) return reply({ error: 'The server workspace is already in use, so this browser’s copy was not imported.' }, 409);
      return reply({ db: await readWorkspace(admin), ...result });
    }
    if (body?.action === 'reset') {
      await resetWorkspace(admin);
      return reply({ db: await readWorkspace(admin), catalogChanged: true });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (error) {
    if (error instanceof WorkspaceError) return reply({ error: error.message }, 400);
    console.error('[api/admin/workspace]', error);
    return reply({ error: 'Your change could not be saved. Please try again.' }, 500);
  }
}
