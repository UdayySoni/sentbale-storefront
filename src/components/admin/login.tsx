'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';

export default function AdminLogin({ setup, needsCode = false, next }: { setup: boolean; needsCode?: boolean; next: string }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', repeat: '', code: '' });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (patch: Partial<typeof form>) => { setForm({ ...form, ...patch }); setError(''); };
  async function submit() {
    if (setup && form.password !== form.repeat) return setError('The passwords do not match.');
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(setup ? { action: 'setup', name: form.name, email: form.email, password: form.password, setupCode: form.code } : { action: 'login', email: form.email, password: form.password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Please try again.');
      window.location.assign(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in. Please try again.'); setBusy(false); }
  }
  return <main className="adm-login">
    <section className="adm-login-art" aria-hidden="true"><strong>SENTBALE</strong><span>Admin Panel</span><p>Scents that stay.</p></section>
    <form className="adm-login-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <span className="adm-login-lock"><LockKeyhole size={22} strokeWidth={1.5} /></span>
      <p className="adm-eyebrow">{setup ? 'FIRST-TIME SETUP' : 'WELCOME BACK'}</p>
      <h1>{setup ? 'Create the owner account' : 'Sign in to SENTBALE Admin'}</h1>
      <p className="adm-muted">{setup ? 'This account controls the catalogue, images and every admin section. Choose a password you do not use anywhere else.' : 'Enter your admin email and password to continue.'}</p>
      <fieldset className="adm-fields" disabled={busy}>
        {setup && needsCode && <label className="adm-field">Setup code<input value={form.code} maxLength={200} autoComplete="off" required onChange={event => change({ code: event.target.value })} /><small className="adm-muted">The ADMIN_SETUP_CODE value from the server settings.</small></label>}
        {setup && <label className="adm-field">Your name<input value={form.name} maxLength={100} autoComplete="name" required onChange={event => change({ name: event.target.value })} /></label>}
        <label className="adm-field">Email<input type="email" value={form.email} maxLength={254} autoComplete="username" required onChange={event => change({ email: event.target.value })} /></label>
        <label className="adm-field">Password<span className="adm-password"><input type={visible ? 'text' : 'password'} value={form.password} minLength={setup ? 12 : undefined} maxLength={128} autoComplete={setup ? 'new-password' : 'current-password'} required onChange={event => change({ password: event.target.value })} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>{setup && <small>At least 12 characters, with a letter and a number.</small>}</label>
        {setup && <label className="adm-field">Repeat password<input type={visible ? 'text' : 'password'} value={form.repeat} maxLength={128} autoComplete="new-password" required onChange={event => change({ repeat: event.target.value })} /></label>}
      </fieldset>
      {error && <p className="adm-form-error" role="alert">{error}</p>}
      <button type="submit" className="adm-btn wide" disabled={busy}>{busy ? 'Please wait…' : setup ? 'Create account' : 'Sign in'} <ArrowRight size={16} /></button>
      {!setup && <Link className="adm-link" href="/admin/reset">Forgot your password?</Link>}
      <Link className="adm-link" href="/">← Back to the storefront</Link>
    </form>
  </main>;
}
