import { sql } from 'drizzle-orm';
import { db } from '@/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** For load balancers and uptime checks: 200 when the database answers. */
export async function GET() {
  try {
    await (await db()).execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
