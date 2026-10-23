'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';

async function post(body: unknown) {
  const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Please try again.');
}

/** Admin password recovery: with a token, choose a new password; without one, ask for a link. */
export default function AdminReset({ token }: { token: string }) {
  const [form, setForm] = useState({ email: '', password: '', repeat: '' });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (patch: Partial<typeof form>) => { setForm({ ...form, ...patch }); setError(''); };
  async function submit() {
    if (token && form.password !== form.repeat) return setError('The passwords do not match.');
    setBusy(true);
    try {
      if (token) { await post({ action: 'reset', token, password: form.password }); window.location.assign('/admin'); return; }
      await post({ action: 'forgot', email: form.email });
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    setBusy(false);
  }
  return <main className="adm-login">
    <section className="adm-login-art" aria-hidden="true"><strong>SENTBALE</strong><span>Admin Panel</span><p>Scents that stay.</p></section>
    <form className="adm-login-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <span className="adm-login-lock"><LockKeyhole size={22} strokeWidth={1.5} /></span>
      <p className="adm-eyebrow">PASSWORD RESET</p>
      <h1>{token ? 'Choose a new password' : 'Forgot your password?'}</h1>
      {sent ? <p className="adm-muted" role="status">If that email belongs to an active admin, a reset link is on its way. It works for one hour.</p> : <>
        <p className="adm-muted">{token ? 'At least 12 characters, with a letter and a number. You will be signed out everywhere else.' : 'Enter your admin email and we will send you a reset link.'}</p>
        <fieldset className="adm-fields" disabled={busy}>
          {token ? <>
            <label className="adm-field">New password<input type="password" value={form.password} minLength={12} maxLength={128} autoComplete="new-password" required onChange={event => change({ password: event.target.value })} /></label>
            <label className="adm-field">Repeat password<input type="password" value={form.repeat} maxLength={128} autoComplete="new-password" required onChange={event => change({ repeat: event.target.value })} /></label>
          </> : <label className="adm-field">Email<input type="email" value={form.email} maxLength={254} autoComplete="username" required onChange={event => change({ email: event.target.value })} /></label>}
        </fieldset>
        {error && <p className="adm-form-error" role="alert">{error}</p>}
        <button type="submit" className="adm-btn wide" disabled={busy}>{busy ? 'Please wait…' : token ? 'Save password' : 'Send reset link'} <ArrowRight size={16} /></button>
      </>}
      <Link className="adm-link" href="/admin/login">← Back to sign in</Link>
    </form>
  </main>;
}
