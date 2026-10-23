'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ImagePlus, Save, RotateCcw, CheckCircle2, LoaderCircle, AlertCircle } from 'lucide-react';
import { mediaSlots, builtInImages, defaultMedia, type MediaManifest, type MediaValue } from '@/lib/media';
import { announce } from '@/lib/use-live';
import './media-admin.css';

type Upload = { src: string; name: string };
export default function MediaAdmin() {
  const [saved, setSaved] = useState<MediaManifest | null>(null);
  const [draft, setDraft] = useState<Record<string, MediaValue>>({});
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [selected, setSelected] = useState('hero.desktop');
  const [group, setGroup] = useState('All images');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const slot = mediaSlots.find(s => s.id === selected)!;
  const value = draft[selected];
  const changed = saved ? Object.fromEntries(Object.entries(draft).filter(([id, image]) => JSON.stringify(image) !== JSON.stringify(saved.images[id]))) : {};
  const dirty = Object.keys(changed).length;
  async function load() {
    setError('');
    try { const response = await fetch('/api/media', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setSaved(data); setDraft(data.images); setUploads(data.uploads); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load images.'); }
  }
  useEffect(() => { const product = new URLSearchParams(window.location.search).get('product'); if (product && mediaSlots.some(s => s.id === 'product.' + product)) { setSelected('product.' + product); setGroup('Products'); } void load(); }, []);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  function edit(update: Partial<MediaValue>) { setDraft(current => ({ ...current, [selected]: { ...current[selected], ...update } })); setNotice(''); }
  async function save() {
    if (!saved || busy || !dirty) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/media', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: saved.revision, images: changed }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSaved(data); setDraft(data.images); setNotice('Images saved. Your local storefront is up to date.');
      announce('sentbale-media');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save changes.'); }
    finally { setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    const target = selected;
    setBusy(true); setError(''); setNotice('');
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP image smaller than 8 MB.');
      const decoded = await createImageBitmap(file); decoded.close();
      const body = new FormData(); body.set('file', file);
      const response = await fetch('/api/media/upload', { method: 'POST', body });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setUploads(current => [...current, data]);
      setDraft(current => ({ ...current, [target]: { ...current[target], src: data.src } }));
      setNotice('Image uploaded. Adjust its crop, then save your changes.');
    } catch (e) { setError(e instanceof Error ? e.message : 'That image could not be opened.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  // Sidebar and header links live outside this component, so guard unsaved changes at document level.
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a');
      if (link && link.getAttribute('href')?.startsWith('/') && link.target !== '_blank' && !window.confirm('Leave without saving your image changes?')) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener('click', guard, true);
    return () => document.removeEventListener('click', guard, true);
  }, [dirty]);
  return <div className="admin-main" id="image-studio"><div className="admin-heading"><div><p className="eyebrow">THE VISUAL WORLD OF SENTBALE</p><h1>Image studio.</h1><p>Curate the images that tell your story.</p></div><button className="button" onClick={save} disabled={!dirty || busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Save changes {dirty > 0 && `(${dirty})`}</button></div>
      <div className="admin-local-note"><span>Signed-in editing.</span> Images are saved to this site and appear on the storefront as soon as you save.</div>
      {error && <div className="admin-message error" role="alert"><AlertCircle size={18} /><span>{error}</span><button onClick={load} disabled={busy}>Reload library</button></div>}
      {notice && <div className="admin-message" role="status"><CheckCircle2 size={18} />{notice}</div>}
      {!saved || !value ? <div className="admin-loading">{error ? 'The image library is unavailable.' : 'Opening your image library…'}</div> : <>
        <div className="admin-tabs" aria-label="Image groups">{['All images', 'Banners', 'Products', 'Collections', 'Editorial', 'Journal'].map(g => <button key={g} className={group === g ? 'active' : ''} onClick={() => setGroup(g)}>{g}<span>{g === 'All images' ? mediaSlots.length : mediaSlots.filter(s => s.group === g).length}</span></button>)}</div>
        <div className="admin-workspace"><div className="admin-slot-list">{mediaSlots.filter(s => group === 'All images' || s.group === group).map(s => <button className={selected === s.id ? 'selected' : ''} onClick={() => setSelected(s.id)} key={s.id} aria-pressed={selected === s.id}><img src={draft[s.id].src} alt="" /><span><small>{s.group}</small><strong>{s.label}</strong></span>{changed[s.id] && <i title="Unsaved change" />}<ArrowUpRight size={16} /></button>)}</div>
          <section className="admin-editor" aria-label="Image editor"><div className="admin-editor-heading"><div><p className="eyebrow">{slot.group}</p><h2>{slot.label}</h2></div><button className="text-link" onClick={() => edit(defaultMedia.images[selected])} disabled={busy}><RotateCcw size={13} /> Reset image</button></div><p className="admin-hint">{slot.hint}</p>
            <div className={`admin-image-preview ${selected === 'hero.mobile' ? 'portrait' : ''}`}><img src={value.src} alt={value.alt || 'Decorative image preview'} style={{ objectPosition: value.position }} />{selected.startsWith('hero.') && <div className="admin-preview-copy">More than<br />a fragrance.<em>A feeling.</em></div>}</div>
            <fieldset disabled={busy} className="admin-fields"><div className="admin-upload-row"><label className="button"><ImagePlus size={17} /> Replace image<input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload image" onChange={e => upload(e.target.files?.[0])} /></label><span>PNG, JPEG or WebP<br />Up to 8 MB</span></div><label className="field">Image description<input aria-label="Image description" value={value.alt} maxLength={250} onChange={e => edit({ alt: e.target.value })} /><small>Describe what the image shows. Leave blank only for decoration.</small></label><div className="admin-crop"><label>Horizontal crop <span className="crop-value" aria-hidden="true">{value.position.split(' ')[0]}</span><input aria-label="Horizontal crop" type="range" min="0" max="100" value={parseInt(value.position)} onChange={e => edit({ position: `${e.target.value}% ${value.position.split(' ')[1]}` })} /></label><label>Vertical crop <span className="crop-value" aria-hidden="true">{value.position.split(' ')[1]}</span><input aria-label="Vertical crop" type="range" min="0" max="100" value={parseInt(value.position.split(' ')[1])} onChange={e => edit({ position: `${value.position.split(' ')[0]} ${e.target.value}%` })} /></label></div>
            <div className="admin-library"><p className="eyebrow">OR CHOOSE FROM YOUR LIBRARY</p><div>{[...builtInImages, ...uploads.map(u => u.src)].map((src, i) => <button key={src} onClick={() => edit({ src })} aria-label={`Use library image ${i + 1}`} aria-pressed={value.src === src} className={value.src === src ? 'selected' : ''}><img src={src} alt={`Library image ${i + 1}`} loading="lazy" />{value.src === src && <CheckCircle2 size={18} />}</button>)}</div></div></fieldset>
          </section></div>
        <div className="admin-save-bar"><p>{dirty ? `${dirty} image placement${dirty === 1 ? '' : 's'} with unsaved changes` : 'All changes saved'}<small>Updates appear across the local site after saving.</small></p><button className="text-link" disabled={!dirty || busy} onClick={() => { setDraft(saved.images); setNotice('Draft changes discarded.'); }}>Discard changes</button><button className="button" onClick={save} disabled={!dirty || busy}><Save size={16} /> Save changes</button></div>
      </>}
  </div>;
}
