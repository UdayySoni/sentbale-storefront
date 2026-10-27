'use client';
import { useProducts } from '@/components/catalog-provider';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, MapPin, Plus, Check, Trash2, Pencil, Package, CheckCircle2, Search } from 'lucide-react';
import { money, priceFor } from '@/lib/catalog';
import type { DemoOrder } from '@/lib/store';
import { useAccount, accountAction } from './account';
import { Photo } from './media-image';

type Address = { id: string; label: string; name: string; phone: string; line: string; city: string; state: string; pincode: string; isDefault: boolean };

export function CollectionIntro({ family }: { family: string }) {
  const products = useProducts();
  // The family's best-known notes: the first top, heart and base note of its products.
  const own = products.filter(p => p.family.toLowerCase() === family.toLowerCase());
  const notes = [0, 1, 2].map(i => [...new Set(own.flatMap(p => p.notes[i].slice(0, 1)))].slice(0, 2).join(' · '));
  if (!own.length || notes.every(n => !n)) return null;
  return <section className="collection-intro"><div><p className="eyebrow">THE {family.toUpperCase()} FAMILY</p><h2>Signature notes</h2></div><div>{['Top', 'Heart', 'Base'].map((label, i) => notes[i] && <div className="collection-note" key={label}><span>0{i + 1}</span><strong>{label.toUpperCase()}</strong><p>{notes[i]}</p></div>)}</div></section>;
}
export function AddressBook() {
  const account = useAccount();
  const [saving, setSaving] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/account', {cache:'no-store'}).then(r => {if(!r.ok) throw new Error();return r.json();}).then(data => {if(active) setAddresses(data.addresses || []);}).catch(() => {if(active) setError('Unable to load addresses. Please refresh.');}).finally(() => {if(active) setLoaded(true);});
    return () => {active=false;};
  }, []);
  async function persist(next: Address[], text: string) {
    if(saving) return false; setSaving(true);
    try { await accountAction({action:'addresses',addresses:next}); setAddresses(next); setMessage(text); setError(''); return true; }
    catch(error) { setError(error instanceof Error ? error.message : 'Unable to save your address.'); return false; }
    finally {setSaving(false);}
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const address = { id: typeof editing === 'object' && editing ? editing.id : crypto.randomUUID(), label: String(data.get('label')), name: String(data.get('name')), phone: String(data.get('phone')), line: String(data.get('line')), city: String(data.get('city')), state: String(data.get('state')), pincode: String(data.get('pincode')), isDefault: data.get('default') === 'on' || addresses.length === 0 };
    let next = [...addresses.filter(a => a.id !== address.id), address];
    if (address.isDefault) next = next.map(a => ({ ...a, isDefault: a.id === address.id }));
    if (!next.some(a => a.isDefault)) next[0].isDefault = true;
    if (await persist(next, 'Address saved to your account.')) setEditing(null);
  }
  function remove(id: string) { const next = addresses.filter(a => a.id !== id); if (next.length && !next.some(a => a.isDefault)) next[0] = { ...next[0], isDefault: true }; persist(next, 'Address removed.'); }
  if(account.loaded && !account.user) return <section className="section empty-state"><h1>Your personal address book.</h1><p>Sign in to manage your delivery addresses.</p><Link className="button" href="/account">Sign in</Link></section>;
  const current = typeof editing === 'object' ? editing : null;
  return <section className="section address-page"><Link className="text-link" href="/account"><ArrowLeft size={15} /> My account</Link><div className="section-heading"><div><p className="eyebrow">THE PLACES YOU CALL YOURS</p><h1>Your address book.</h1></div><button className="button" onClick={() => { setEditing('new'); setMessage(''); }}><Plus size={16} /> Add address</button></div><p className="muted">Saved to your account for faster checkout. Addresses are saved to your account on this computer.</p>{error && <p className="form-message" role="alert">{error}</p>}{message && <p className="address-message" role="status"><CheckCircle2 size={17} />{message}</p>}
    {!loaded ? <p className="muted">Opening your address book…</p> : <div className="address-grid">{addresses.map(a => <article className="address-card" key={a.id}><div><MapPin size={21} /><h2>{a.label}</h2>{a.isDefault && <span className="status-pill">Default</span>}</div><strong>{a.name}</strong><p>{a.line}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p><div className="address-actions"><button onClick={() => setEditing(a)}><Pencil size={13} /> Edit</button><button onClick={() => remove(a.id)}><Trash2 size={13} /> Remove</button>{!a.isDefault && <button onClick={() => persist(addresses.map(other => ({ ...other, isDefault: other.id === a.id })), 'Default address updated.')}><Check size={13} /> Make default</button>}</div></article>)}{!addresses.length && !editing && <div className="address-empty"><MapPin size={38} strokeWidth={1} /><h2>A place for your next discovery.</h2><p>Add a sample address to explore the account experience.</p><button className="text-link" onClick={() => setEditing('new')}>Add your first address <Plus size={16} /></button></div>}</div>}
    {editing && <form className="address-form" key={current?.id || 'new'} onSubmit={save}><div className="section-heading"><h2>{current ? 'Edit address' : 'A new destination.'}</h2><button type="button" className="text-link" onClick={() => setEditing(null)}>Cancel</button></div><div className="form-grid">{[['label','Address label','Home'],['name','Full name',''],['phone','Phone number',''],['pincode','Pincode',''],['line','Street address',''],['city','City',''],['state','State','']].map(([name, label, placeholder]) => <label className={`field ${name === 'line' ? 'full' : ''}`} key={name}>{label}<input name={name} aria-label={label} defaultValue={current?.[name as keyof Address] as string || ''} placeholder={placeholder} required pattern={name === 'pincode' ? '[1-9][0-9]{5}' : name === 'phone' ? '[0-9+ ()-]{10,16}' : undefined} /></label>)}</div><label className="default-check"><input type="checkbox" name="default" defaultChecked={current?.isDefault || addresses.length === 0} /> Make this my default address</label><button type="submit" disabled={saving} className="button">{saving ? 'Saving�' : 'Save address'} <Check size={16} /></button></form>}
  </section>;
}

export function OrderDetail({ id }: { id: string }) {
  const products = useProducts();
  const [order, setOrder] = useState<DemoOrder | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { let active=true; fetch('/api/account',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(active)setOrder((data.orders||[]).find((o:DemoOrder)=>o.id===id)||null);}).catch(()=>{}).finally(()=>{if(active)setLoaded(true);}); return ()=>{active=false;}; },[id]);
  if (!loaded) return <section className="section"><p>Opening your order…</p></section>;
  if (!order) return <section className="section empty-state"><Package size={40} strokeWidth={1} /><h1>We couldn’t find this order.</h1><p>Sign in to the account that placed this order to view its details.</p><Link className="button" href="/account/orders">Back to my orders <ArrowLeft size={16} /></Link></section>;
  const test = order.paymentMethod === 'Test payment' || order.id.startsWith('DEMO-');
  // How far along the timeline the order is: Confirmed, Preparing, Shipped, Delivered.
  const reached = ({ 'Pending payment': -1, Processing: 1, Shipped: 2, Delivered: 3 } as Record<string, number>)[order.status || 'Processing'] ?? 0;
  const items = order.snapshot || order.items.flatMap(line => { const p = products.find(p => p.id === line.id); return p ? [{ ...line, name: p.name, image: p.image, unitPrice: priceFor(p, line.size) }] : []; });
  return <section className="section order-detail-page"><Link className="text-link" href="/account/orders"><ArrowLeft size={15} /> All orders</Link><div className="section-heading"><div><h1>Order details.</h1><p className="muted">{order.id} · {new Date(order.date).toLocaleDateString('en-IN', { dateStyle: 'long' })}</p></div><span className="status-pill">{test ? 'Demo confirmed' : order.status === 'Pending payment' ? 'Awaiting payment' : order.status || 'Processing'}</span></div>{test && <div className="demo-notice">Test order: no payment was taken.</div>}<div className="order-detail-layout"><div><div className="order-timeline">{['Confirmed', 'Preparing', 'Shipped', 'Delivered'].map((step, i) => <div key={step} className={i <= reached ? 'current' : ''}><span>{i <= reached ? <Check size={16} /> : i + 1}</span><strong>{step}</strong><small>{test && i === 0 ? 'Local test order' : i <= reached ? 'Done' : order.status === 'Cancelled' || order.status === 'Refunded' ? order.status : 'Not started'}</small></div>)}</div><h2>Your selection</h2>{items.map(item => <div className="order-detail-item" key={`${item.id}-${item.size}`}><Link className="cart-thumb" href={`/product/${item.id}`}><Photo slot={`product.${item.id}`} src={item.image} alt={item.name} sizes="100px" /></Link><div><Link href={`/product/${item.id}`}><h3>{item.name}</h3></Link><p>{item.size} ml · Quantity {item.quantity}</p><small>{money(item.unitPrice)} each</small></div><strong>{money(item.unitPrice * item.quantity)}</strong></div>)}</div><aside className="order-summary"><h2>The details</h2><p className="eyebrow">DELIVERY ADDRESS</p><strong className="recipient">{order.name}</strong>{order.address ? <p className="order-address">{order.address.line}<br />{order.address.city}, {order.address.state}<br />{order.address.pincode}</p> : <p className="order-address">This older test order did not save an address.</p>}<div className="summary-row"><span>Items</span><span>{money(order.subtotal ?? order.total - (order.shipping || 0))}</span></div><div className="summary-row"><span>Delivery</span><span>{order.shipping ? money(order.shipping) : 'Complimentary'}</span></div>{!!order.discount && <div className="summary-row"><span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span><span>−{money(order.discount)}</span></div>}{!!order.tax && <div className="summary-row"><span>{order.taxIncluded === false ? 'GST' : 'Includes GST'}</span><span>{money(order.tax)}</span></div>}<div className="summary-row total"><span>Order total</span><strong>{money(order.total)}</strong></div><p className="checkout-note">{test ? 'Simulated payment · No funds collected' : `${order.paymentMethod || 'Payment'} · ${order.paymentStatus === 'Paid' ? 'Paid' : order.paymentStatus === 'Pending' ? 'Due on delivery' : order.paymentStatus}`}</p>{order.tracking?.awb ? <><p className="eyebrow">TRACKING</p><p className="order-address">{order.tracking.courier ? `${order.tracking.courier} · ` : ''}{order.tracking.awb}{order.tracking.status ? <><br />{order.tracking.status.charAt(0) + order.tracking.status.slice(1).toLowerCase()}</> : null}</p>{order.tracking.url && <a className="text-link" href={order.tracking.url} target="_blank" rel="noopener noreferrer">Track your parcel <ArrowUpRight size={15} /></a>}</> : order.status === 'Processing' && !test ? <p className="checkout-note">Tracking appears here once your parcel ships.</p> : null}<Link href="/contact" className="text-link">Need help? <ArrowUpRight size={15} /></Link></aside></div><Link href="/shop" className="text-link">Keep shopping <ArrowRight size={16} /></Link></section>;
}

const faqs = [
  { category: 'Finding your scent', question: 'Where should I start?', answer: 'Pick a family you enjoy, or try the scent finder on the homepage.' },
  { category: 'Finding your scent', question: 'What are top, heart and base notes?', answer: 'Top notes are the first impression, heart notes the character, and base notes what stays on your skin longest.' },
  { category: 'Fragrance care', question: 'How should I store my perfume?', answer: 'Upright, tightly closed, and away from sunlight and heat.' },
  { category: 'Fragrance care', question: 'Where can I find the ingredients?', answer: 'On the label of every bottle.' },
  { category: 'Orders & delivery', question: 'Where can I see my order?', answer: 'Under My Account → My Orders, with tracking once it ships. We also email a confirmation.' },
  { category: 'Orders & delivery', question: 'How much is delivery?', answer: 'Delivery options and charges for your pincode are shown at checkout before you pay.' },
];
export function FAQPage() {
  const [category, setCategory] = useState('All questions');
  const [query, setQuery] = useState('');
  const shown = faqs.filter(f => (category === 'All questions' || f.category === category) && `${f.question} ${f.answer}`.toLowerCase().includes(query.toLowerCase()));
  return <><section className="faq-hero"><h1>FAQ</h1><label className="faq-search"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search questions" placeholder="What would you like to know?" /></label></section><section className="section faq-layout"><nav aria-label="Question categories">{['All questions', 'Finding your scent', 'Fragrance care', 'Orders & delivery'].map(c => <button className={category === c ? 'active' : ''} key={c} onClick={() => setCategory(c)}>{c}<ArrowUpRight size={15} /></button>)}</nav><div className="faq-list">{shown.map(f => <details key={f.question}><summary>{f.question}<Plus size={18} /></summary><p>{f.answer}</p></details>)}{!shown.length && <div className="empty-state"><h2>No matching questions.</h2><button className="text-link" onClick={() => { setQuery(''); setCategory('All questions'); }}>Show all questions <ArrowRight size={15} /></button></div>}<div className="faq-contact"><h2>Still have a question?</h2><Link className="button" href="/contact">Get in touch <ArrowRight size={16} /></Link></div></div></section></>;
}
