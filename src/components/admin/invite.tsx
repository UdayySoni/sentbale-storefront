'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';

type Invite = { name: string; email: string; role: string } | null;

/** Where an invited team member sets their password. The link comes from Roles & Permissions → Team members. */
export default function AcceptInvite({ token, invite }: { token: string; invite: Invite }) {
  const [form, setForm] = useState({ name: invite?.name || '', password: '', repeat: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (patch: Partial<typeof form>) => { setForm({ ...form, ...patch }); setError(''); };
  async function submit() {
    if (form.password !== form.repeat) return setError('The passwords do not match.');
    setBusy(true);
    try {
      const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept', token, name: form.name, password: form.password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Please try again.');
      window.location.assign('/admin');
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); setBusy(false); }
  }
  return <main className="adm-login">
    <section className="adm-login-art" aria-hidden="true"><strong>SENTBALE</strong><span>Admin Panel</span><p>Scents that stay.</p></section>
    {invite ? <form className="adm-login-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <span className="adm-login-lock"><LockKeyhole size={22} strokeWidth={1.5} /></span>
      <p className="adm-eyebrow">TEAM INVITATION</p>
      <h1>Join SENTBALE Admin</h1>
      <p className="adm-muted">You have been invited as <b>{invite.role}</b> with the email <b>{invite.email}</b>. Choose a password to finish.</p>
      <fieldset className="adm-fields" disabled={busy}>
        <label className="adm-field">Your name<input value={form.name} maxLength={100} autoComplete="name" required onChange={event => change({ name: event.target.value })} /></label>
        <label className="adm-field">Password<input type="password" value={form.password} minLength={12} maxLength={128} autoComplete="new-password" required onChange={event => change({ password: event.target.value })} /></label>
        <label className="adm-field">Repeat password<input type="password" value={form.repeat} maxLength={128} autoComplete="new-password" required onChange={event => change({ repeat: event.target.value })} /></label>
      </fieldset>
      <p className="adm-muted">At least 12 characters, with a letter and a number.</p>
      {error && <p className="adm-form-error" role="alert">{error}</p>}
      <button type="submit" className="adm-btn wide" disabled={busy}>{busy ? 'Please wait…' : 'Create my sign-in'} <ArrowRight size={16} /></button>
    </form> : <div className="adm-login-form">
      <p className="adm-eyebrow">TEAM INVITATION</p>
      <h1>This invitation is not valid</h1>
      <p className="adm-muted">It may have expired or already been used. Ask the store owner to send a new invitation.</p>
      <Link className="adm-link" href="/admin/login">Go to sign in</Link>
    </div>}
  </main>;
}
