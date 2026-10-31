'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ImageIcon, ImagePlus, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { money, products as builtIn } from '@/lib/catalog';
import { skuCode, slug } from '@/lib/admin/seed';
import { patchDb, useDb } from '@/lib/admin/store';
import type { AdminProduct, Collection, Sku } from '@/lib/admin/types';
import { Thumb } from './dashboard';
import { Badge, Confirm, Drawer, Loading, PageHeader, useToast } from './ui';

type SizeRow = { key: string; size: string; price: string; stock: string; threshold: string };
type Form = { name: string; family: string; mood: string; description: string; badge: string; images: string[]; color: string; top: string; heart: string; base: string; status: 'Active' | 'Draft'; sizes: SizeRow[] };

const key = () => Math.random().toString(36).slice(2);
const sizeRow = (size = '', price = '', stock = '0', threshold = '0'): SizeRow => ({ key: key(), size, price, stock, threshold });
const blank = (): Form => ({ name: '', family: '', mood: '', description: '', badge: '', images: [], color: '#7a6a55', top: '', heart: '', base: '', status: 'Draft', sizes: [sizeRow('50', '')] });
const list = (text: string) => text.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);
const MAX_PHOTOS = 13;
const familyImage = (family: string) => builtIn.find(p => p.family.toLowerCase() === family.toLowerCase())?.image || '/images/legacy.png';

function formOf(p: AdminProduct, skus: Sku[]): Form {
  const own = skus.filter(s => s.productId === p.id).sort((a, b) => a.size - b.size);
  return {
    name: p.name, family: p.family, mood: p.mood, description: p.description, badge: p.badge || '', images: [p.image, ...(p.images ?? [])], color: p.color || '#7a6a55',
    top: p.notes?.[0]?.join(', ') || '', heart: p.notes?.[1]?.join(', ') || '', base: p.notes?.[2]?.join(', ') || '',
    status: p.status, sizes: own.length ? own.map(s => sizeRow(String(s.size), String(s.price), String(s.stock), String(s.threshold))) : [sizeRow('50', String(p.price))],
  };
}

export default function Products() {
  const db = useDb();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [family, setFamily] = useState('');
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState('');
  const [doomed, setDoomed] = useState<AdminProduct | null>(null);

  const q = params.get('q'), wantsNew = params.get('new');
  useEffect(() => { setQuery(q || ''); }, [q]);
  useEffect(() => { if (wantsNew && db) { open('new'); router.replace(pathname, { scroll: false }); } }, [wantsNew, !!db]); // eslint-disable-line react-hooks/exhaustive-deps
  const skusOf = useMemo(() => { const map = new Map<string, Sku[]>(); for (const s of db?.skus || []) map.set(s.productId, [...(map.get(s.productId) || []), s].sort((a, b) => a.size - b.size)); return map; }, [db]);
  if (!db) return <Loading />;
  const familyNames = [...new Set([...db.collections.map(c => c.name), ...db.products.map(p => p.family)])];
  const term = query.trim().toLowerCase();
  const visible = db.products.filter(p => (!family || p.family === family) && (!term || `${p.name} ${p.family} ${p.mood}`.toLowerCase().includes(term)));

  function open(entry: AdminProduct | 'new') { setForm(entry === 'new' ? blank() : formOf(entry, db!.skus)); setError(''); setEditing(entry); }
  const change = (patch: Partial<Form>) => { setForm(current => ({ ...current, ...patch })); setError(''); };
  const changeSize = (rowKey: string, patch: Partial<SizeRow>) => change({ sizes: form.sizes.map(r => r.key === rowKey ? { ...r, ...patch } : r) });

  async function upload(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, MAX_PHOTOS - form.images.length);
    if (!files.length) return setError(list?.length ? `A product can have up to ${MAX_PHOTOS} photos.` : '');
    setError('');
    try {
      for (const [i, file] of files.entries()) {
        setUploading(`Uploading ${i + 1} of ${files.length}…`);
        const body = new FormData(); body.append('file', file);
        const response = await fetch('/api/media/upload', { method: 'POST', body });
        const data = await response.json();
        if (!response.ok) throw new Error(`${file.name}: ${data.error}`);
        setForm(current => ({ ...current, images: [...current.images, data.src] }));
      }
    } catch (e) { setError(e instanceof Error && e.message ? e.message : 'The image could not be uploaded.'); }
    finally { setUploading(''); }
  }

  function save() {
    if (!editing || !db) return;
    const name = form.name.trim(), familyName = form.family.trim(), mood = form.mood.trim(), description = form.description.trim(), badge = form.badge.trim();
    if (!name || name.length > 150) return setError('Enter a product name.');
    if (!familyName || familyName.length > 40) return setError('Enter a fragrance family, e.g. Oud.');
    if (!mood) return setError('Enter a short tagline.');
    if (!description) return setError('Enter a description.');
    if (db.products.some(p => p.name.toLowerCase() === name.toLowerCase() && (editing === 'new' || p.id !== editing.id))) return setError('Another product already has this name.');
    const rows = form.sizes.map(r => ({ size: Number(r.size), price: Number(r.price), stock: Number(r.stock || 0), threshold: Number(r.threshold || 0) }));
    if (!rows.length) return setError('Add at least one size.');
    if (rows.some(r => !Number.isInteger(r.size) || r.size < 1 || r.size > 10000)) return setError('Each size needs a whole number of ml, e.g. 50.');
    if (new Set(rows.map(r => r.size)).size !== rows.length) return setError('Each size can be listed only once.');
    if (rows.some(r => !Number.isInteger(r.price) || r.price < 1 || r.price > 1000000)) return setError('Each size needs a price in whole rupees.');
    if (rows.some(r => !Number.isInteger(r.stock) || !Number.isInteger(r.threshold) || r.threshold < 0)) return setError('Stock and alert levels are whole numbers.');

    let id = editing === 'new' ? slug(name) || 'product' : editing.id;
    if (editing === 'new') while (db.products.some(p => p.id === id)) id += '-2';
    const product: AdminProduct = {
      id, name, family: familyName, mood, description, badge: badge || undefined, image: form.images[0] || familyImage(familyName), images: form.images.slice(1), color: form.color,
      notes: [list(form.top), list(form.heart), list(form.base)], price: Math.min(...rows.map(r => r.price)), status: form.status,
    };
    const old = skusOf.get(id) || [];
    const skus: Sku[] = rows.map(r => {
      const was = old.find(s => s.size === r.size);
      return { id: `${id}-${r.size}`, productId: id, product: name, size: r.size, sku: was && editing !== 'new' && editing.name === name ? was.sku : skuCode(name, r.size), price: r.price, stock: r.stock, threshold: r.threshold };
    });
    // A family with no collection yet gets one, so it shows up in the shop's filters.
    const collection: Collection | null = db.collections.some(c => c.name.toLowerCase() === familyName.toLowerCase()) ? null
      : { id: slug(familyName) || key(), name: familyName, description: '', position: Math.min(99, Math.max(0, ...db.collections.map(c => c.position)) + 1), featured: false, status: 'Visible' };
    patchDb(current => ({
      products: editing === 'new' ? [...current.products, product] : current.products.map(p => p.id === id ? product : p),
      skus: [...current.skus.filter(s => s.productId !== id), ...skus],
      ...(collection ? { collections: [...current.collections, collection] } : {}),
    }), editing === 'new' ? 'Created product' : 'Updated product', name);
    toast(editing === 'new' ? 'Product created.' : 'Product saved.');
    setEditing(null);
  }
  function remove(p: AdminProduct) {
    patchDb(current => ({ products: current.products.filter(x => x.id !== p.id), skus: current.skus.filter(s => s.productId !== p.id) }), 'Deleted product', p.name);
    toast('Product deleted.');
    setDoomed(null);
  }
  const target = editing && editing !== 'new' ? editing : null;

  return <>
    <PageHeader title="Products" description="Everything about each fragrance: sizes, prices, stock, image and story.">
      <Link className="adm-btn ghost" href="/admin/images"><ImageIcon size={16} /> Image studio</Link>
      <button type="button" className="adm-btn" onClick={() => open('new')}><Plus size={16} /> Add product</button>
    </PageHeader>
    <section className="adm-card adm-resource">
      <div className="adm-toolbar">
        <label className="adm-inline-search"><Search size={16} /><input type="search" aria-label="Search products" placeholder="Search products…" value={query} maxLength={80} onChange={event => setQuery(event.target.value)} /></label>
        <select aria-label="Fragrance family filter" value={family} onChange={event => setFamily(event.target.value)}><option value="">Family: All</option>{familyNames.map(name => <option key={name}>{name}</option>)}</select>
        <span className="adm-count">{visible.length} {visible.length === 1 ? 'product' : 'products'}</span>
      </div>
      <div className="adm-table-wrap"><table className="adm-table">
        <thead><tr><th>Product</th><th>Family</th><th>Sizes</th><th className="right">From</th><th className="right">In stock</th><th>Status</th><th className="right">Actions</th></tr></thead>
        <tbody>{visible.map(p => { const own = skusOf.get(p.id) || []; return <tr key={p.id}>
          <td><div className="adm-product-cell"><Thumb src={p.image} /><span className="adm-cell-main"><b>{p.name}</b><small>{p.mood}</small></span></div></td>
          <td>{p.family}</td><td>{own.map(s => s.size).join(' · ')} ml</td><td className="right">{money(own.length ? Math.min(...own.map(s => s.price)) : p.price)}</td>
          <td className="right">{own.reduce((sum, s) => sum + s.stock, 0)}</td><td><Badge>{p.status === 'Active' ? 'Live' : 'Draft'}</Badge></td>
          <td className="right"><div className="adm-row-actions">
            <button type="button" className="adm-icon-btn small" aria-label={`Edit ${p.name}`} title="Edit" onClick={() => open(p)}><Pencil size={15} /></button>
            <button type="button" className="adm-icon-btn small danger" aria-label={`Delete ${p.name}`} title="Delete" onClick={() => setDoomed(p)}><Trash2 size={15} /></button>
          </div></td>
        </tr>; })}</tbody>
      </table></div>
      {!visible.length && <p className="adm-empty">No products match.</p>}
    </section>

    <Drawer open={!!editing} eyebrow={editing === 'new' ? 'NEW PRODUCT' : 'EDIT PRODUCT'} title={editing === 'new' ? 'Add product' : target?.name || ''} onClose={() => setEditing(null)}>
      <form onSubmit={event => { event.preventDefault(); save(); }} noValidate>
        <div className="adm-gallery">
          {form.images.map((src, i) => <div className={`adm-gallery-item ${i === 0 ? 'main' : ''}`} key={src}><Thumb src={src} />{i === 0 ? <span className="adm-gallery-tag">Main</span> : <button type="button" aria-label={`Make photo ${i + 1} the main photo`} title="Make main" onClick={() => change({ images: [src, ...form.images.filter(x => x !== src)] })}><Star size={13} /></button>}<button type="button" className="remove" aria-label={`Remove photo ${i + 1}`} title="Remove" onClick={() => change({ images: form.images.filter(x => x !== src) })}><X size={13} /></button></div>)}
          {!form.images.length && <div className="adm-gallery-item"><Thumb src={familyImage(form.family)} /></div>}
          <label className="adm-upload">{uploading || <><ImagePlus size={15} /> Add photos</>}<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={!!uploading} aria-label="Add photos" onChange={event => { void upload(event.target.files); event.target.value = ''; }} /></label>
        </div>
        <fieldset className="adm-fields">
          <label className="adm-field">Product name<input value={form.name} maxLength={150} required onChange={event => change({ name: event.target.value })} /></label>
          <label className="adm-field half">Fragrance family<input list="adm-families" value={form.family} maxLength={40} placeholder="e.g. Oud" required onChange={event => change({ family: event.target.value })} /><datalist id="adm-families">{familyNames.map(n => <option key={n} value={n} />)}</datalist></label>
          <label className="adm-field half">Status<select value={form.status} onChange={event => change({ status: event.target.value as Form['status'] })}><option value="Active">Live on store</option><option value="Draft">Draft (hidden)</option></select></label>

          <div className="adm-field"><span>Sizes, prices &amp; stock</span>
            <div className="adm-sizes">
              <div className="adm-sizes-head"><span>Size (ml)</span><span>Price (₹)</span><span>Stock</span><span>Alert at</span><span /></div>
              {form.sizes.map(r => <div className="adm-sizes-row" key={r.key}>
                <input aria-label="Size in ml" type="number" inputMode="numeric" min={1} max={10000} value={r.size} onChange={e => changeSize(r.key, { size: e.target.value })} />
                <input aria-label="Price in rupees" type="number" inputMode="numeric" min={1} value={r.price} onChange={e => changeSize(r.key, { price: e.target.value })} />
                <input aria-label="Stock" type="number" inputMode="numeric" value={r.stock} onChange={e => changeSize(r.key, { stock: e.target.value })} />
                <input aria-label="Low-stock alert level" type="number" inputMode="numeric" min={0} value={r.threshold} onChange={e => changeSize(r.key, { threshold: e.target.value })} />
                <button type="button" className="adm-icon-btn small" aria-label="Remove size" disabled={form.sizes.length === 1} onClick={() => change({ sizes: form.sizes.filter(x => x.key !== r.key) })}><X size={15} /></button>
              </div>)}
              <button type="button" className="adm-btn ghost small" onClick={() => change({ sizes: [...form.sizes, sizeRow()] })}><Plus size={15} /> Add size</button>
            </div>
            <small>Alert at 0 means stock isn’t tracked and the size never sells out.</small>
          </div>

          <label className="adm-field">Tagline<input value={form.mood} maxLength={150} required onChange={event => change({ mood: event.target.value })} /></label>
          <label className="adm-field">Description<textarea rows={4} value={form.description} maxLength={3000} required onChange={event => change({ description: event.target.value })} /></label>
          <label className="adm-field">Top notes<input value={form.top} placeholder="Saffron, Bergamot" onChange={event => change({ top: event.target.value })} /></label>
          <label className="adm-field half">Heart notes<input value={form.heart} placeholder="Rose, Jasmine" onChange={event => change({ heart: event.target.value })} /></label>
          <label className="adm-field half">Base notes<input value={form.base} placeholder="Oud, Amber" onChange={event => change({ base: event.target.value })} /></label>
          <label className="adm-field half">Badge<input value={form.badge} maxLength={50} placeholder="Optional, e.g. NEW" onChange={event => change({ badge: event.target.value })} /></label>
          <label className="adm-field half">Accent colour<input type="color" value={form.color} onChange={event => change({ color: event.target.value })} /></label>
        </fieldset>
        {error && <p className="adm-form-error" role="alert">{error}</p>}
        <div className="adm-form-actions"><button type="button" className="adm-btn ghost" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="adm-btn" disabled={!!uploading}>{editing === 'new' ? 'Create product' : 'Save changes'}</button></div>
      </form>
    </Drawer>
    <Confirm open={!!doomed} title="Delete this product?" body={doomed ? `“${doomed.name}” and all its sizes will be deleted. Past orders keep their details.` : ''} action="Delete" onCancel={() => setDoomed(null)} onConfirm={() => doomed && remove(doomed)} />
  </>;
}
