'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

async function post(body: unknown) {
  const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Please try again.');
}

/** Asks for a reset link. The reply is the same whether or not the email has an account. */
export function ForgotPassword({ back }: { back: () => void }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await post({ action: 'forgot', email: new FormData(event.currentTarget).get('email') }); setSent(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  if (sent) return <div className="contact-success" role="status"><CheckCircle2 size={30} /><p>If an account uses that email, a link to reset your password is on its way. It works for one hour.</p><button type="button" className="text-link" onClick={back}>Back to sign in</button></div>;
  return <form onSubmit={submit}>
    <p className="muted">Enter your account email and we will send you a link to choose a new password.</p>
    <label className="field">Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
    <button className="button" disabled={busy}>{busy ? 'One moment…' : 'Send reset link'}<ArrowRight size={17} /></button>
    {error && <p className="form-message" role="alert">{error}</p>}
    <button type="button" className="text-link" onClick={back}>Back to sign in</button>
  </form>;
}

/** The page a reset link opens: choose a new password, then continue signed in. */
export function ResetPassword() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (fields.get('password') !== fields.get('confirm')) return setError('Your passwords do not match.');
    setBusy(true); setError('');
    try { await post({ action: 'reset', token: new URLSearchParams(window.location.search).get('token') || '', password: fields.get('password') }); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="section account-page"><p className="eyebrow">MY SENTBALE</p><h1>A fresh start.</h1>
    {done ? <div className="contact-success" role="status"><CheckCircle2 size={35} /><p>Your password has been changed and you are signed in.</p><Link className="button" href="/account">Go to my account <ArrowRight size={17} /></Link></div>
      : <form className="auth-form" onSubmit={submit}>
        <label className="field">New password<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
        <label className="field">Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
        <button className="button" disabled={busy}>{busy ? 'One moment…' : 'Save new password'}<ArrowRight size={17} /></button>
        {error && <p className="form-message" role="alert">{error}</p>}
      </form>}
  </section>;
}
