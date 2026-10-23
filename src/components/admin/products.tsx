'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ImageIcon, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useProducts } from '@/components/catalog-provider';
import { money, priceFor, type Family, type Product } from '@/lib/catalog';
import { skuCode, skusFor, slug } from '@/lib/admin/seed';
import { patchDb, refreshDb, useDb } from '@/lib/admin/store';
import type { AdminProduct } from '@/lib/admin/types';
import { announce } from '@/lib/use-live';
import { Thumb } from './dashboard';
import { Badge, Confirm, Drawer, Loading, PageHeader, useToast } from './ui';

const familyNames: Family[] = ['Oud', 'Woody', 'Floral', 'Citrus'];
const familyImage: Record<Family, string> = { Oud: '/images/legacy.png', Woody: '/images/noir.png', Floral: '/images/aurora.png', Citrus: '/images/citrus.png' };
type Catalog = { revision: string; products: Product[] };
type Entry = { id: string; name: string; family: Family; mood: string; description: string; price: number; image: string; badge?: string; status: string; live: boolean };
type Form = { name: string; family: Family; mood: string; description: string; badge: string; price: string; status: 'Active' | 'Draft' };
const blank: Form = { name: '', family: 'Oud', mood: '', description: '', badge: '', price: '4999', status: 'Draft' };
const formOf = (entry: Entry): Form => ({ name: entry.name, family: entry.family, mood: entry.mood, description: entry.description, badge: entry.badge || '', price: String(entry.price), status: entry.status === 'Draft' ? 'Draft' : 'Active' });

export default function Products() {
  const db = useDb();
  const fallback = useProducts();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [query, setQuery] = useState(params.get('q') || '');
  const [family, setFamily] = useState('');
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doomed, setDoomed] = useState<Entry | null>(null);

  async function loadCatalog() {
    try { const response = await fetch('/api/catalog', { cache: 'no-store' }); if (response.ok) setCatalog(await response.json()); } catch { /* The list falls back to the server-rendered catalogue. */ }
  }
  useEffect(() => { void loadCatalog(); }, []);
  const q = params.get('q'), wantsNew = params.get('new');
  useEffect(() => { setQuery(q || ''); }, [q]);
  useEffect(() => { if (wantsNew) { open('new'); router.replace(pathname, { scroll: false }); } }, [wantsNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo<Entry[]>(() => [
    // Products added in the admin are edited as such even once Active (on sale), so they are not repeated here.
    ...(catalog?.products || fallback).filter(p => !db?.products.some(own => own.id === p.id)).map(p => ({ ...p, status: 'Live', live: true })),
    ...(db?.products || []).map(p => ({ ...p, live: false })),
  ], [catalog, fallback, db]);
  const stock = useMemo(() => { const totals = new Map<string, number>(); for (const sku of db?.skus || []) totals.set(sku.productId, (totals.get(sku.productId) || 0) + sku.stock); return totals; }, [db]);
  if (!db) return <Loading />;
  const term = query.trim().toLowerCase();
  const visible = entries.filter(entry => (!family || entry.family === family) && (!term || `${entry.name} ${entry.family} ${entry.mood}`.toLowerCase().includes(term)));

  function open(entry: Entry | 'new') { setForm(entry === 'new' ? blank : formOf(entry)); setError(''); setEditing(entry); }
  const change = (patch: Partial<Form>) => { setForm(current => ({ ...current, ...patch })); setError(''); };
  const syncSkus = (id: string, name: string, price: number) => (current: NonNullable<typeof db>) => current.skus.map(sku => sku.productId === id ? { ...sku, product: name, sku: skuCode(name, sku.size), price: priceFor({ price }, sku.size as 50) } : sku);

  async function save() {
    if (!editing || busy) return;
    const name = form.name.trim(), mood = form.mood.trim(), description = form.description.trim(), badge = form.badge.trim(), price = Number(form.price);
    if (!name || name.length > 150) return setError('Enter a product name of up to 150 characters.');
    if (!mood || mood.length > 150) return setError('Enter a tagline of up to 150 characters.');
    if (!description || description.length > 3000) return setError('Enter a description of up to 3,000 characters.');
    if (!Number.isInteger(price) || price < 1 || price > 1000000) return setError('Price must be whole rupees between 1 and 10,00,000.');
    if (badge.length > 50) return setError('Keep the badge under 50 characters.');
    if (entries.some(entry => entry.name.toLowerCase() === name.toLowerCase() && (editing === 'new' || entry.id !== editing.id))) return setError('Another product already has this name.');

    if (editing !== 'new' && editing.live) {
      if (!catalog) return setError('The catalogue is still loading. Please try again.');
      setBusy(true);
      try {
        const products = catalog.products.map(p => p.id === editing.id ? { ...p, name, family: form.family, mood, description, price, badge: badge || undefined } : p);
        const response = await fetch('/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: catalog.revision, products }) });
        const data = await response.json();
        if (response.status === 401) return void window.location.assign('/admin/login');
        if (!response.ok) { if (response.status === 409) void loadCatalog(); throw new Error(data.error); }
        setCatalog(data);
        announce('sentbale-catalog');
        // The server re-prices the sizes and records the change; reload them.
        void refreshDb();
        toast('Product catalogue saved. The storefront is up to date.');
        setEditing(null);
      } catch (e) { setError(e instanceof Error && e.message ? e.message : 'Could not save this product. Please try again.'); }
      finally { setBusy(false); }
      return;
    }
    if (editing === 'new') {
      let id = slug(name) || 'product';
      while (entries.some(entry => entry.id === id)) id += '-2';
      const product: AdminProduct = { id, name, family: form.family, mood, description, price, badge: badge || undefined, image: familyImage[form.family], status: form.status };
      patchDb(current => ({ products: [product, ...current.products], skus: [...skusFor(product, current.settings.lowStock), ...current.skus] }), 'Created product', name);
      toast('Product created with 50, 100 and 200 ml sizes. Add stock in Inventory.');
    } else {
      patchDb(current => ({ products: current.products.map(p => p.id === editing.id ? { ...p, name, family: form.family, mood, description, price, badge: badge || undefined, image: familyImage[form.family], status: form.status } : p), skus: syncSkus(editing.id, name, price)(current) }), 'Updated product', name);
      toast('Product saved.');
    }
    setEditing(null);
  }
  function remove(entry: Entry) {
    patchDb(current => ({ products: current.products.filter(p => p.id !== entry.id), skus: current.skus.filter(sku => sku.productId !== entry.id) }), 'Deleted product', entry.name);
    toast('Product deleted.');
    setDoomed(null);
  }
  const target = editing && editing !== 'new' ? editing : null;
  const price = Number(form.price) || 0;

  return <>
    <PageHeader title="Products" description="Every fragrance in the house, with its story and price.">
      <Link className="adm-btn ghost" href="/admin/images"><ImageIcon size={16} /> Image studio</Link>
      <button type="button" className="adm-btn" onClick={() => open('new')}><Plus size={16} /> Add product</button>
    </PageHeader>
    <p className="adm-note"><b>Live</b> products are on the storefront now and update the moment you save. Products you add go on sale when their status is <b>Active</b>, using their fragrance family's bottle image; <b>Draft</b> keeps them hidden.</p>
    <section className="adm-card adm-resource">
      <div className="adm-toolbar">
        <label className="adm-inline-search"><Search size={16} /><input type="search" aria-label="Search products" placeholder="Search products…" value={query} maxLength={80} onChange={event => setQuery(event.target.value)} /></label>
        <select aria-label="Fragrance family filter" value={family} onChange={event => setFamily(event.target.value)}><option value="">Family: All</option>{familyNames.map(name => <option key={name}>{name}</option>)}</select>
        <span className="adm-count">{visible.length} {visible.length === 1 ? 'product' : 'products'}</span>
      </div>
      <div className="adm-table-wrap"><table className="adm-table">
        <thead><tr><th>Product</th><th>Family</th><th className="right">Price (50 ml)</th><th className="right">In stock</th><th>Status</th><th className="right">Actions</th></tr></thead>
        <tbody>{visible.map(entry => <tr key={entry.id}>
          <td><div className="adm-product-cell"><Thumb src={entry.image} /><span className="adm-cell-main"><b>{entry.name}</b><small>{entry.mood}</small></span></div></td>
          <td>{entry.family}</td><td className="right">{money(entry.price)}</td><td className="right">{stock.get(entry.id) ?? 0}</td><td><Badge>{entry.status}</Badge></td>
          <td className="right"><div className="adm-row-actions">
            <button type="button" className="adm-icon-btn small" aria-label={`Edit ${entry.name}`} title="Edit" onClick={() => open(entry)}><Pencil size={15} /></button>
            {!entry.live && <button type="button" className="adm-icon-btn small danger" aria-label={`Delete ${entry.name}`} title="Delete" onClick={() => setDoomed(entry)}><Trash2 size={15} /></button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
      {!visible.length && <p className="adm-empty">No products match. Try clearing the search or filter.</p>}
    </section>

    <Drawer open={!!editing} eyebrow={editing === 'new' ? 'NEW PRODUCT' : target?.live ? 'LIVE ON STOREFRONT' : 'EDIT PRODUCT'} title={editing === 'new' ? 'Add product' : target?.name || ''} onClose={() => setEditing(null)}>
      <form onSubmit={event => { event.preventDefault(); void save(); }} noValidate>
        {target?.live && <div className="adm-drawer-image"><Thumb src={target.image} /><Link href={`/admin/images?product=${target.id}`}><ImageIcon size={15} /> Change image</Link></div>}
        <fieldset disabled={busy} className="adm-fields">
          <label className="adm-field">Product name<input value={form.name} maxLength={150} required onChange={event => change({ name: event.target.value })} /></label>
          <label className="adm-field half">Fragrance family<select value={form.family} onChange={event => change({ family: event.target.value as Family })}>{familyNames.map(name => <option key={name}>{name}</option>)}</select></label>
          <label className="adm-field half">Price for 50 ml (₹)<input type="number" inputMode="numeric" min={1} max={1000000} step={1} value={form.price} required onChange={event => change({ price: event.target.value })} /></label>
          <p className="adm-price-note">100 ml sells at {money(price + 2000)} and 200 ml at {money(price + 5000)}.</p>
          <label className="adm-field">Tagline<input value={form.mood} maxLength={150} required onChange={event => change({ mood: event.target.value })} /></label>
          <label className="adm-field">Description<textarea rows={5} value={form.description} maxLength={3000} required onChange={event => change({ description: event.target.value })} /></label>
          <label className={`adm-field ${target?.live ? '' : 'half'}`}>Badge<input value={form.badge} maxLength={50} placeholder="Optional, e.g. NEW" onChange={event => change({ badge: event.target.value })} /></label>
          {!target?.live && <label className="adm-field half">Status<select value={form.status} onChange={event => change({ status: event.target.value as Form['status'] })}><option>Draft</option><option>Active</option></select></label>}
        </fieldset>
        {error && <p className="adm-form-error" role="alert">{error}</p>}
        <div className="adm-form-actions"><button type="button" className="adm-btn ghost" disabled={busy} onClick={() => { setForm(target ? formOf(target) : blank); setError(''); }}>Discard product changes</button><button type="submit" className="adm-btn" disabled={busy}>{busy ? 'Saving…' : editing === 'new' ? 'Create product' : 'Save changes'}</button></div>
      </form>
    </Drawer>
    <Confirm open={!!doomed} title="Delete this product?" body={doomed ? `“${doomed.name}” and its three sizes will be deleted. This cannot be undone.` : ''} action="Delete" onCancel={() => setDoomed(null)} onConfirm={() => doomed && remove(doomed)} />
  </>;
}
