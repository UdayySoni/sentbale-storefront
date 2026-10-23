'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ImageIcon, LogOut, RotateCcw } from 'lucide-react';
import { patchDb, resetDb, useDb } from '@/lib/admin/store';
import type { Db } from '@/lib/admin/types';
import { Confirm, Fields, fromForm, Loading, PageHeader, Tabs, toForm, useToast, type Fld, type FormValues } from './ui';

function ObjectForm({ db, source, title, hint, fields }: { db: Db; source: 'homepage' | 'settings'; title: string; hint: string; fields: Fld[] }) {
  const toast = useToast();
  const saved = db[source] as unknown as Record<string, unknown>;
  const [values, setValues] = useState<FormValues>(() => toForm(fields, saved));
  const [error, setError] = useState('');
  const original = JSON.stringify(toForm(fields, saved));
  useEffect(() => { setValues(JSON.parse(original)); }, [original]);
  const dirty = JSON.stringify(values) !== original;
  function save() {
    const cleaned = fromForm(fields, values);
    if (typeof cleaned === 'string') return setError(cleaned);
    patchDb({ [source]: { ...saved, ...cleaned } }, 'Updated settings', title);
    toast(`${title} saved.`);
  }
  return <form className="adm-card adm-settings-card" onSubmit={event => { event.preventDefault(); save(); }} noValidate>
    <header className="adm-card-head"><div><h2>{title}</h2><p>{hint}</p></div></header>
    <Fields fields={fields} values={values} db={db} onChange={(name, value) => { setValues(current => ({ ...current, [name]: value })); setError(''); }} />
    {error && <p className="adm-form-error" role="alert">{error}</p>}
    <div className="adm-form-actions"><button type="button" className="adm-btn ghost" disabled={!dirty} onClick={() => { setValues(JSON.parse(original)); setError(''); }}>Discard</button><button type="submit" className="adm-btn" disabled={!dirty}>Save changes</button></div>
  </form>;
}

const heroFields: Fld[] = [
  { name: 'eyebrow', label: 'Small heading', maxLength: 60 }, { name: 'headline', label: 'Headline', required: true, maxLength: 90 },
  { name: 'subheadline', label: 'Supporting line', type: 'textarea', maxLength: 220 },
  { name: 'cta', label: 'Button label', required: true, maxLength: 30, half: true }, { name: 'ctaHref', label: 'Button link', type: 'url', required: true, maxLength: 200, half: true, hint: 'A site path such as /shop, or an https:// address.' },
];
const announcementFields: Fld[] = [
  { name: 'announcementOn', label: 'Show the announcement bar', type: 'toggle' }, { name: 'announcement', label: 'Announcement text', maxLength: 120 },
];
const sectionFields: Fld[] = [
  { name: 'featured', label: 'Featured fragrances', maxLength: 200, hint: 'Product names separated by commas, in display order.' },
  { name: 'showFinder', label: 'Show the scent finder', type: 'toggle', half: true }, { name: 'showJournal', label: 'Show journal stories', type: 'toggle', half: true },
];
export function HomepageContent() {
  const db = useDb();
  if (!db) return <Loading />;
  return <>
    <PageHeader title="Homepage Content" description="The first impression: campaign, announcement and featured fragrances."><Link className="adm-btn" href="/admin/images"><ImageIcon size={16} /> Edit homepage images</Link></PageHeader>
    <p className="adm-note">Homepage images are live and edited in the image studio. The wording below is saved on the server and reaches the storefront once the content pages are connected.</p>
    <div className="adm-settings">
      <ObjectForm db={db} source="homepage" title="Hero campaign" hint="The headline over the main campaign image." fields={heroFields} />
      <ObjectForm db={db} source="homepage" title="Announcement bar" hint="A single line across the top of the store." fields={announcementFields} />
      <ObjectForm db={db} source="homepage" title="Homepage sections" hint="Choose what appears below the campaign." fields={sectionFields} />
    </div>
  </>;
}

const profileFields: Fld[] = [
  { name: 'storeName', label: 'Store name', required: true, maxLength: 60, half: true }, { name: 'email', label: 'Customer care email', type: 'email', required: true, half: true },
  { name: 'phone', label: 'Phone', maxLength: 20, half: true }, { name: 'gstin', label: 'GSTIN', maxLength: 15, half: true, hint: '15 characters, shown on invoices.' },
  { name: 'address', label: 'Registered address', type: 'textarea', maxLength: 300 },
];
const taxFields: Fld[] = [
  { name: 'gstRate', label: 'GST rate (%)', type: 'number', min: 0, max: 28, step: 0.5, half: true }, { name: 'invoicePrefix', label: 'Invoice prefix', maxLength: 8, half: true },
  { name: 'pricesIncludeTax', label: 'Prices include tax', type: 'toggle' }, { name: 'lowStock', label: 'Default low stock alert', type: 'number', min: 0, max: 1000, hint: 'Applied to new product sizes.' },
];
const notifyFields: Fld[] = [
  { name: 'notifyOrders', label: 'New orders', type: 'toggle', hint: 'Email the store when an order is placed.' }, { name: 'notifyLowStock', label: 'Low stock', type: 'toggle', hint: 'Email when a size reaches its alert level.' },
  { name: 'notifyReviews', label: 'New reviews', type: 'toggle', hint: 'Email when a review needs approval.' },
];

async function sessionAction(body: Record<string, string>) {
  const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Please try again.');
}
function Security() {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  async function changePassword() {
    if (form.next !== form.repeat) return setError('The new passwords do not match.');
    setBusy(true); setError('');
    try { await sessionAction({ action: 'password', current: form.current, next: form.next }); setForm({ current: '', next: '', repeat: '' }); toast('Password changed. Other devices have been signed out.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not change the password.'); }
    finally { setBusy(false); }
  }
  async function signOutEverywhere() {
    try { await sessionAction({ action: 'logout-all' }); window.location.assign('/admin/login'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not sign out.', true); }
  }
  const input = (name: 'current' | 'next' | 'repeat', label: string, autoComplete: string) => <label className="adm-field">{label}<input type="password" autoComplete={autoComplete} value={form[name]} maxLength={128} required onChange={event => { setForm({ ...form, [name]: event.target.value }); setError(''); }} /></label>;
  return <div className="adm-settings">
    <form className="adm-card adm-settings-card" onSubmit={event => { event.preventDefault(); void changePassword(); }}>
      <header className="adm-card-head"><div><h2>Change password</h2><p>At least 12 characters, with a letter and a number.</p></div></header>
      <fieldset className="adm-fields" disabled={busy}>{input('current', 'Current password', 'current-password')}{input('next', 'New password', 'new-password')}{input('repeat', 'Repeat new password', 'new-password')}</fieldset>
      {error && <p className="adm-form-error" role="alert">{error}</p>}
      <div className="adm-form-actions"><button type="submit" className="adm-btn" disabled={busy || !form.current || !form.next}>{busy ? 'Saving…' : 'Change password'}</button></div>
    </form>
    <section className="adm-card adm-settings-card">
      <header className="adm-card-head"><div><h2>Sessions</h2><p>Admin sessions end after 8 hours, or 30 minutes without activity.</p></div></header>
      <div className="adm-form-actions start"><button type="button" className="adm-btn ghost" onClick={signOutEverywhere}><LogOut size={16} /> Sign out of all devices</button></div>
    </section>
    <section className="adm-card adm-settings-card">
      <header className="adm-card-head"><div><h2>Workspace data</h2><p>Records entered in the admin are stored on the server and shared by every admin session. The audit log is always kept.</p></div></header>
      <div className="adm-form-actions start"><button type="button" className="adm-btn danger" onClick={() => setConfirmReset(true)}><RotateCcw size={16} /> Clear workspace data</button></div>
    </section>
    <Confirm open={confirmReset} title="Clear workspace data?" body="Every record entered in this admin is removed, stock levels are cleared and the workspace starts empty again. Live storefront products, prices and images are not affected." action="Clear" onCancel={() => setConfirmReset(false)} onConfirm={() => { resetDb(); setConfirmReset(false); toast('Workspace cleared.'); }} />
  </div>;
}

const settingsTabs = [{ key: 'profile', label: 'Store profile' }, { key: 'preferences', label: 'Tax & notifications' }, { key: 'security', label: 'Account & security' }];
export function BusinessSettings() {
  const db = useDb();
  const requested = useSearchParams().get('tab');
  const tab = settingsTabs.find(t => t.key === requested)?.key || 'profile';
  if (!db) return <Loading />;
  return <>
    <PageHeader title="Business Settings" description="Your store’s details, tax rules and account security." />
    <Tabs base="/admin/settings" current={tab} tabs={settingsTabs} />
    {tab === 'security' ? <Security /> : <div className="adm-settings">
      {tab === 'profile' ? <ObjectForm db={db} source="settings" title="Store profile" hint="Shown on invoices, emails and the contact page." fields={profileFields} />
        : <><ObjectForm db={db} source="settings" title="Tax & invoices" hint="How prices and invoices are calculated." fields={taxFields} /><ObjectForm db={db} source="settings" title="Notifications" hint="Emails sent to the store team." fields={notifyFields} /></>}
    </div>}
  </>;
}
