import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, count, eq, gt, isNotNull, lt } from 'drizzle-orm';
import { db, schema as s, type Tx } from '@/db';
import { attemptsExceeded, clearAttempts, digest, passwordHash, passwordMatches, recordAttempt } from './accounts-server';
import { accessFor, allows } from './admin/access-server';
import { recordAudit } from './audit-server';
import { completeReset } from './password-reset-server';
import { writeAllowed, secureCookies } from './request-security';

export const ADMIN_COOKIE = 'sentbale-admin';
const SESSION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const INVITE_MS = 7 * 24 * 60 * 60 * 1000;
export type Admin = { id: string; name: string; email: string; role: string };

export const adminCount = async () => (await (await db()).select({ total: count() }).from(s.admins))[0].total;

export async function currentAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [row] = await (await db()).select({ id: s.admins.id, name: s.admins.name, email: s.admins.email, role: s.admins.role })
    .from(s.admins).innerJoin(s.adminSessions, eq(s.admins.id, s.adminSessions.adminId))
    .where(and(eq(s.adminSessions.tokenHash, digest(token)), gt(s.adminSessions.expiresAt, new Date()), eq(s.admins.status, 'Active')));
  return row ?? null;
}

/**
 * Guard for admin-only write routes: same-origin request, a live admin session and, when `section` is
 * given, a role that may manage it. Returns the response to send when refused.
 */
export async function adminWriteDenied(request: Request, section?: string): Promise<Response | null> {
  if (!writeAllowed(request)) return Response.json({ error: 'This action is available only from the admin panel.' }, { status: 403 });
  const admin = await currentAdmin();
  if (!admin) return Response.json({ error: 'Your admin session has ended. Please sign in again.' }, { status: 401 });
  if (section && !allows(await accessFor(admin), section, 'manage')) return Response.json({ error: 'Your role does not allow this change.' }, { status: 403 });
  return null;
}

async function startSession(adminId: string) {
  const database = await db();
  await database.delete(s.adminSessions).where(lt(s.adminSessions.expiresAt, new Date()));
  const token = randomBytes(32).toString('hex');
  await database.insert(s.adminSessions).values({ tokenHash: digest(token), adminId, expiresAt: new Date(Date.now() + SESSION_MS) });
  await database.update(s.admins).set({ lastActiveAt: new Date() }).where(eq(s.admins.id, adminId));
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_MS / 1000, secure: await secureCookies() });
}

export async function endSession(everywhere = false) {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) {
    const database = await db();
    const admin = everywhere ? await currentAdmin() : null;
    if (admin) await database.delete(s.adminSessions).where(eq(s.adminSessions.adminId, admin.id));
    else await database.delete(s.adminSessions).where(eq(s.adminSessions.tokenHash, digest(token)));
  }
  jar.delete(ADMIN_COOKIE);
}

export const validEmail = (email: unknown): email is string => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const validPassword = (password: unknown): password is string => typeof password === 'string' && password.length >= 12 && password.length <= 128 && /[a-z]/i.test(password) && /[0-9]/.test(password);

export async function createOwner(name: string, email: string, password: string) {
  const id = randomUUID();
  // Inserts only while the table is empty, so of two simultaneous setups only the first wins.
  const created = await (await db()).transaction(async tx => {
    const [{ total }] = await tx.select({ total: count() }).from(s.admins);
    if (total > 0) return false;
    await tx.insert(s.admins).values({ id, name, email, passwordHash: passwordHash(password), role: 'Owner' });
    return true;
  }, { isolationLevel: 'serializable' });
  if (!created) return false;
  await startSession(id);
  return true;
}

// Compared against when the email is unknown so both paths cost one scrypt run.
const decoy = passwordHash(randomBytes(16).toString('hex'));
export async function signIn(email: string, password: string): Promise<'ok' | 'invalid' | 'locked'> {
  const key = `admin:${email}`;
  if (await attemptsExceeded(key, MAX_ATTEMPTS)) return 'locked';
  const [admin] = await (await db()).select({ id: s.admins.id, passwordHash: s.admins.passwordHash, status: s.admins.status }).from(s.admins).where(eq(s.admins.email, email));
  let matches = false;
  try { matches = passwordMatches(password, admin?.passwordHash || decoy) && !!admin?.passwordHash && admin.status === 'Active'; } catch { matches = false; }
  if (!matches) { await recordAttempt(key, WINDOW_MS); return 'invalid'; }
  await clearAttempts(key);
  await startSession(admin.id);
  return 'ok';
}

export async function changePassword(admin: Admin, current: string, next: string) {
  const database = await db();
  const [row] = await database.select({ passwordHash: s.admins.passwordHash }).from(s.admins).where(eq(s.admins.id, admin.id));
  if (!row?.passwordHash || !passwordMatches(current, row.passwordHash)) return false;
  await database.transaction(async tx => {
    await tx.update(s.admins).set({ passwordHash: passwordHash(next) }).where(eq(s.admins.id, admin.id));
    await tx.delete(s.adminSessions).where(eq(s.adminSessions.adminId, admin.id));
  });
  await startSession(admin.id);
  return true;
}

// ---- Team invitations -----------------------------------------------------------------------

/** Issues a fresh one-time invite token (valid 7 days); only its hash is stored. */
export async function issueInvite(tx: Tx, adminId: string) {
  const token = randomBytes(32).toString('hex');
  await tx.update(s.admins).set({ inviteTokenHash: digest(token), inviteExpiresAt: new Date(Date.now() + INVITE_MS) }).where(eq(s.admins.id, adminId));
  return token;
}

/** Lets an invited team member set their name and password, then signs them in. */
export async function acceptInvite(token: string, name: string, password: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const database = await db();
  const accepted = await database.transaction(async tx => {
    const [admin] = await tx.update(s.admins)
      .set({ name, passwordHash: passwordHash(password), status: 'Active', inviteTokenHash: null, inviteExpiresAt: null })
      .where(and(eq(s.admins.inviteTokenHash, digest(token)), isNotNull(s.admins.inviteExpiresAt), gt(s.admins.inviteExpiresAt, new Date()), eq(s.admins.status, 'Invited')))
      .returning({ id: s.admins.id, name: s.admins.name });
    if (admin) await recordAudit(tx, admin.name, 'Accepted team invitation', admin.name);
    return admin ?? null;
  });
  if (!accepted) return false;
  await startSession(accepted.id);
  return true;
}

export async function inviteDetails(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const [row] = await (await db()).select({ name: s.admins.name, email: s.admins.email, role: s.admins.role }).from(s.admins)
    .where(and(eq(s.admins.inviteTokenHash, digest(token)), gt(s.admins.inviteExpiresAt, new Date()), eq(s.admins.status, 'Invited')));
  return row ?? null;
}

/** Completes an emailed password reset for an admin and signs them in. */
export async function resetAdminPassword(token: string, password: string) {
  const adminId = await completeReset('admin', token, password);
  if (!adminId) return false;
  await startSession(adminId);
  return true;
}
