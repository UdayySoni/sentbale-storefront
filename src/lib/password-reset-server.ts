import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNotNull } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { attemptsExceeded, digest, passwordHash, recordAttempt } from './accounts-server';
import { config, mailEnabled } from './config';
import { queueMail } from './mail-server';

type Kind = 'customer' | 'admin';
const LINK_MS = 60 * 60 * 1000;

/**
 * Emails a one-time reset link valid for an hour. The reply never reveals whether the email has an
 * account, and requests are limited to five per email per hour.
 */
export async function requestReset(kind: Kind, email: string) {
  const key = `reset:${kind}:${email}`;
  if (await attemptsExceeded(key, 5)) return;
  await recordAttempt(key, LINK_MS);
  const database = await db();
  const [account] = kind === 'customer'
    ? await database.select({ id: s.customers.id, name: s.customers.name }).from(s.customers).where(and(eq(s.customers.email, email), eq(s.customers.status, 'Active'), isNotNull(s.customers.passwordHash)))
    : await database.select({ id: s.admins.id, name: s.admins.name }).from(s.admins).where(and(eq(s.admins.email, email), eq(s.admins.status, 'Active')));
  if (!account) return;
  const token = randomBytes(32).toString('hex');
  await database.transaction(async tx => {
    await tx.delete(s.passwordResets).where(and(eq(s.passwordResets.kind, kind), eq(s.passwordResets.accountId, account.id)));
    await tx.insert(s.passwordResets).values({ tokenHash: digest(token), kind, accountId: account.id, expiresAt: new Date(Date.now() + LINK_MS) });
  });
  const link = `${config.siteUrl}/${kind === 'customer' ? 'account' : 'admin'}/reset?token=${token}`;
  // Without a mail provider in development, the link is printed so the flow can still be used.
  if (!mailEnabled() && !config.production) console.info(`[password reset] ${email}: ${link}`);
  queueMail({ to: email, subject: kind === 'customer' ? 'Reset your SENTBALE password' : 'Reset your SENTBALE Admin password', body: `Hello ${account.name.split(' ')[0]},\n\nUse this link within an hour to choose a new password:\n${link}\n\nIf you did not ask for this, you can ignore this email; your password stays the same.` });
}

/** Sets the new password and signs the account out everywhere. Returns the account id, or null if the link is invalid. */
export async function completeReset(kind: Kind, token: string, password: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return (await db()).transaction(async tx => {
    const [reset] = await tx.delete(s.passwordResets).where(and(eq(s.passwordResets.tokenHash, digest(token)), eq(s.passwordResets.kind, kind), gt(s.passwordResets.expiresAt, new Date()))).returning();
    if (!reset) return null;
    if (kind === 'customer') {
      await tx.update(s.customers).set({ passwordHash: passwordHash(password) }).where(eq(s.customers.id, reset.accountId));
      await tx.delete(s.customerSessions).where(eq(s.customerSessions.customerId, reset.accountId));
    } else {
      await tx.update(s.admins).set({ passwordHash: passwordHash(password) }).where(eq(s.admins.id, reset.accountId));
      await tx.delete(s.adminSessions).where(eq(s.adminSessions.adminId, reset.accountId));
    }
    return reset.accountId;
  });
}
