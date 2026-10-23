import { acceptInvite, adminCount, resetAdminPassword, changePassword, createOwner, currentAdmin, endSession, signIn, validEmail, validPassword } from '@/lib/admin-auth';
import { writeAllowed } from '@/lib/request-security';
import { requestReset } from '@/lib/password-reset-server';
import { setupCodeMatches } from '@/lib/config';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const PASSWORD_RULE = 'Use a password of 12–128 characters with at least one letter and one number.';

export async function GET() {
  try {
    const admin = await currentAdmin();
    return reply({ admin: admin && { name: admin.name, email: admin.email, role: admin.role }, setupRequired: !admin && (await adminCount()) === 0 });
  } catch { return reply({ error: 'The admin session could not be checked.' }, 500); }
}

export async function POST(request: Request) {
  if (!writeAllowed(request)) return reply({ error: 'Admin sign-in is available only from this site.' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 2000) return reply({ error: 'Request is too large.' }, 413);
    const body = JSON.parse(raw);
    if (body.action === 'logout' || body.action === 'logout-all') { await endSession(body.action === 'logout-all'); return reply({ ok: true }); }
    if (body.action === 'password') {
      const admin = await currentAdmin();
      if (!admin) return reply({ error: 'Your admin session has ended. Please sign in again.' }, 401);
      if (typeof body.current !== 'string' || !validPassword(body.next)) return reply({ error: PASSWORD_RULE }, 400);
      if (body.current === body.next) return reply({ error: 'Choose a password you have not just used.' }, 400);
      return (await changePassword(admin, body.current, body.next)) ? reply({ ok: true }) : reply({ error: 'Your current password is incorrect.' }, 400);
    }
    if (body.action === 'forgot') {
      const address = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (validEmail(address)) await requestReset('admin', address);
      return reply({ ok: true });
    }
    if (body.action === 'reset') {
      if (!validPassword(body.password)) return reply({ error: PASSWORD_RULE }, 400);
      return (await resetAdminPassword(String(body.token || ''), body.password)) ? reply({ ok: true }) : reply({ error: 'This reset link has expired or was already used. Ask for a new one.' }, 400);
    }
    if (body.action === 'accept') {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) return reply({ error: 'Enter your name.' }, 400);
      if (!validPassword(body.password)) return reply({ error: PASSWORD_RULE }, 400);
      return (await acceptInvite(String(body.token || ''), body.name.trim(), body.password)) ? reply({ ok: true }) : reply({ error: 'This invitation has expired or was already used. Ask the store owner for a new one.' }, 400);
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (body.action === 'setup') {
      if ((await adminCount()) > 0) return reply({ error: 'An owner account already exists. Please sign in.' }, 409);
      if (!setupCodeMatches(body.setupCode)) return reply({ error: 'Enter the setup code from the server settings (ADMIN_SETUP_CODE).' }, 403);
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) return reply({ error: 'Enter your name.' }, 400);
      if (!validEmail(email)) return reply({ error: 'Enter a valid email address.' }, 400);
      if (!validPassword(body.password)) return reply({ error: PASSWORD_RULE }, 400);
      return (await createOwner(body.name.trim(), email, body.password)) ? reply({ ok: true }) : reply({ error: 'An owner account already exists. Please sign in.' }, 409);
    }
    if (body.action === 'login') {
      if (!validEmail(email) || typeof body.password !== 'string' || !body.password || body.password.length > 128) return reply({ error: 'Email or password is incorrect.' }, 401);
      const result = await signIn(email, body.password);
      if (result === 'locked') return reply({ error: 'Too many attempts. Please try again in 15 minutes.' }, 429);
      return result === 'ok' ? reply({ ok: true }) : reply({ error: 'Email or password is incorrect.' }, 401);
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch { return reply({ error: 'This request could not be completed. Please try again.' }, 400); }
}
