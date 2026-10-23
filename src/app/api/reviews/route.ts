import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { currentUser } from '@/lib/accounts-server';
import { readCatalog } from '@/lib/catalog-server';
import { config } from '@/lib/config';
import { queueMail } from '@/lib/mail-server';
import { setting } from '@/lib/records-server';
import { writeAllowed } from '@/lib/request-security';
export const runtime = 'nodejs';

/** A signed-in customer reviews a product; it waits in Admin → Reviews until it is published. */
export async function POST(request: Request) {
  if (!writeAllowed(request)) return Response.json({ error: 'Same-origin requests only.' }, { status: 403 });
  const user = await currentUser();
  if (!user) return Response.json({ error: 'Sign in to write a review.' }, { status: 401 });
  try {
    const body = await request.json();
    const product = (await readCatalog()).products.find(p => p.id === body?.productId);
    const rating = Number(body?.rating);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!product || !Number.isInteger(rating) || rating < 1 || rating > 5 || !title || title.length > 120 || text.length > 1500) return Response.json({ error: 'Choose a rating and add a headline of up to 120 characters.' }, { status: 400 });
    const database = await db();
    // One review per customer per product; writing again replaces the earlier one and sends it back for approval.
    const [existing] = await database.select({ id: schema.adminRecords.id }).from(schema.adminRecords)
      .where(and(eq(schema.adminRecords.list, 'reviews'), sql`${schema.adminRecords.data}->>'customerId' = ${user.id}`, sql`${schema.adminRecords.data}->>'productId' = ${product.id}`));
    const id = existing?.id ?? randomUUID();
    const data = { id, productId: product.id, product: product.name, customerId: user.id, customer: user.name, rating, title, body: text, status: 'Pending', date: new Date().toISOString() };
    await database.insert(schema.adminRecords).values({ list: 'reviews', id, data }).onConflictDoUpdate({ target: [schema.adminRecords.list, schema.adminRecords.id], set: { data, updatedAt: new Date() } });
    const settings = await setting('settings', database);
    if (settings.email && settings.notifyReviews) queueMail({ to: settings.email, subject: `New review of ${product.name} (${rating}/5)`, body: `${user.name} wrote:\n\n${title}\n${text}\n\nPublish or hide it at ${config.siteUrl}/admin/reviews` });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[api/reviews]', error);
    return Response.json({ error: 'Your review could not be saved. Please try again.' }, { status: 500 });
  }
}
