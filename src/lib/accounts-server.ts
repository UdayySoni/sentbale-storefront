import 'server-only';
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, asc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { secureCookies } from './request-security';

export const CUSTOMER_COOKIE = 'sentbale-session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export type Customer = { id: string; name: string; email: string };
export type Address = { id: string; label: string; name: string; phone: string; line: string; city: string; state: string; pincode: string; isDefault: boolean };

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function passwordHash(password: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
export function passwordMatches(password: string, saved: string) { const [salt, hash] = saved.split(':'); return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64)); }

// ---- Failed sign-in throttling (shared by customer and admin sign-in) ------------------------

export async function attemptsExceeded(key: string, max: number) {
  const [row] = await (await db()).select().from(s.loginAttempts).where(eq(s.loginAttempts.key, key));
  return !!row && row.expiresAt.getTime() > Date.now() && row.count >= max;
}
/** Counts an attempt; the window restarts once the previous one has expired. */
export async function recordAttempt(key: string, windowMs: number) {
  const now = new Date();
  // Raw SQL fragments do not get column-typed Date handling, so pass an ISO timestamp explicitly.
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  await (await db()).insert(s.loginAttempts).values({ key, count: 1, expiresAt: new Date(now.getTime() + windowMs) }).onConflictDoUpdate({
    target: s.loginAttempts.key,
    set: {
      count: sql`CASE WHEN ${s.loginAttempts.expiresAt} < ${nowSql} THEN 1 ELSE ${s.loginAttempts.count} + 1 END`,
      expiresAt: sql`CASE WHEN ${s.loginAttempts.expiresAt} < ${nowSql} THEN excluded.expires_at ELSE ${s.loginAttempts.expiresAt} END`,
    },
  });
}
export async function clearAttempts(key: string) { await (await db()).delete(s.loginAttempts).where(eq(s.loginAttempts.key, key)); }

// ---- Customers -------------------------------------------------------------------------------

export async function currentUser(): Promise<Customer | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const [row] = await (await db()).select({ id: s.customers.id, name: s.customers.name, email: s.customers.email })
    .from(s.customers).innerJoin(s.customerSessions, eq(s.customers.id, s.customerSessions.customerId))
    .where(and(eq(s.customerSessions.tokenHash, digest(token)), gt(s.customerSessions.expiresAt, new Date()), eq(s.customers.status, 'Active')));
  return row ?? null;
}

export async function findCustomerByEmail(email: string) {
  const [row] = await (await db()).select().from(s.customers).where(eq(s.customers.email, email));
  return row ?? null;
}

export async function createCustomer(name: string, email: string, password: string) {
  const id = randomUUID();
  await (await db()).insert(s.customers).values({ id, name, email, passwordHash: passwordHash(password) });
  return id;
}

/** Sets the password of a customer the admin added, so they can sign in from now on. */
export async function claimCustomer(id: string, name: string, password: string) {
  const [row] = await (await db()).update(s.customers).set({ name, passwordHash: passwordHash(password) }).where(and(eq(s.customers.id, id), isNull(s.customers.passwordHash))).returning({ id: s.customers.id });
  return !!row;
}

export async function renameCustomer(id: string, name: string) {
  await (await db()).update(s.customers).set({ name }).where(eq(s.customers.id, id));
}

export async function createSession(id: string) {
  const database = await db();
  const jar = await cookies();
  const old = jar.get(CUSTOMER_COOKIE)?.value;
  if (old) await database.delete(s.customerSessions).where(eq(s.customerSessions.tokenHash, digest(old)));
  await database.delete(s.customerSessions).where(lt(s.customerSessions.expiresAt, new Date()));
  const token = randomBytes(32).toString('hex');
  await database.insert(s.customerSessions).values({ tokenHash: digest(token), customerId: id, expiresAt: new Date(Date.now() + SESSION_MS) });
  jar.set(CUSTOMER_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_MS / 1000, secure: await secureCookies() });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (token) await (await db()).delete(s.customerSessions).where(eq(s.customerSessions.tokenHash, digest(token)));
  jar.delete(CUSTOMER_COOKIE);
}

// ---- Address book ----------------------------------------------------------------------------

export async function listAddresses(customerId: string): Promise<Address[]> {
  return (await db()).select({
    id: s.customerAddresses.id, label: s.customerAddresses.label, name: s.customerAddresses.name, phone: s.customerAddresses.phone,
    line: s.customerAddresses.line, city: s.customerAddresses.city, state: s.customerAddresses.state, pincode: s.customerAddresses.pincode, isDefault: s.customerAddresses.isDefault,
  }).from(s.customerAddresses).where(eq(s.customerAddresses.customerId, customerId)).orderBy(asc(s.customerAddresses.position));
}

/** The address book is edited as a whole list, so it is replaced in one transaction. */
export async function replaceAddresses(customerId: string, addresses: Address[]) {
  await (await db()).transaction(async tx => {
    await tx.delete(s.customerAddresses).where(eq(s.customerAddresses.customerId, customerId));
    if (addresses.length) await tx.insert(s.customerAddresses).values(addresses.map((a, position) => ({
      id: a.id, customerId, position, label: a.label, name: a.name, phone: a.phone, line: a.line, city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault,
    })));
  });
}
