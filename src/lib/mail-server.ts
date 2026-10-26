import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema as s } from '@/db';
import { config, mailEnabled } from './config';

export type Mail = { to: string; subject: string; body: string };

/**
 * Records an email in the outbox and, when Resend is configured (RESEND_API_KEY + MAIL_FROM), sends it.
 * Never throws: a failed send is recorded on the outbox row and must not undo the order or form that caused it.
 */
export async function sendMail(mail: Mail) {
  const id = randomUUID();
  try {
    const database = await db();
    await database.insert(s.outbox).values({ id, to: mail.to, subject: mail.subject.slice(0, 200), body: mail.body.slice(0, 20000) });
    if (!mailEnabled()) return;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mail.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mail.from, to: [mail.to], subject: mail.subject, text: mail.body }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) await database.update(s.outbox).set({ status: 'sent', sentAt: new Date() }).where(eq(s.outbox.id, id));
    else await database.update(s.outbox).set({ status: 'failed', error: `${response.status} ${(await response.text()).slice(0, 500)}` }).where(eq(s.outbox.id, id));
  } catch (error) {
    console.error('[mail]', error);
    try { await (await db()).update(s.outbox).set({ status: 'failed', error: String(error).slice(0, 500) }).where(eq(s.outbox.id, id)); } catch { /* Already logged. */ }
  }
}

/**
 * Sends the emails side by side and resolves when all are recorded and sent (or failed). Callers await it
 * before responding: serverless hosts such as Firebase App Hosting pause the server once the response is out,
 * which would cut off a send still in flight. Never throws.
 */
export async function queueMail(...mails: (Mail | null | undefined | false)[]) {
  await Promise.all(mails.filter((mail): mail is Mail => !!mail && !!mail.to).map(sendMail));
}
