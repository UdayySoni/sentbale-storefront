'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Gift, Minus, Plus } from 'lucide-react';
import { useProducts } from '@/components/catalog-provider';
import { firstSize, money, priceFor, sizesOf, type Size } from '@/lib/catalog';
import type { CartLine, GiftDraft, useStore } from '@/lib/store';
import { useContent } from './content-provider';
import { Photo } from './media-image';

/** Card designs; the server accepts the same names (GIFT_CARDS). */
const CARDS = ['Classic', 'Floral', 'Noir'];
const STEPS = ['Perfumes', 'Basket', 'Card'];

/** The homepage gift section: pick perfumes, a basket that adds to the price, and write a card. */
export function GiftBuilder({ store, done }: { store: ReturnType<typeof useStore>; done: () => void }) {
  const products = useProducts();
  const { baskets } = useContent();
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<CartLine[]>([]);
  const [chosen, setChosen] = useState<Record<string, Size>>({});
  const [basketId, setBasketId] = useState('');
  const [card, setCard] = useState(CARDS[0]);
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // A gift already in the bag opens here for editing.
  useEffect(() => {
    if (!store.gift) return;
    setItems(store.gift.items); setBasketId(store.gift.basket.id); setCard(store.gift.card);
    setTo(store.gift.to); setFrom(store.gift.from); setMessage(store.gift.message);
  }, [store.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const basket = baskets.find(b => b.id === basketId) ?? baskets[0];
  const perfumes = items.reduce((sum, l) => { const p = products.find(x => x.id === l.id); return sum + (p ? priceFor(p, l.size) * l.quantity : 0); }, 0);

  function change(id: string, size: Size, by: number) {
    setError('');
    setItems(lines => {
      const line = lines.find(l => l.id === id && l.size === size);
      if (!line) return by > 0 ? [...lines, { id, size, quantity: by }] : lines;
      const quantity = Math.min(10, line.quantity + by);
      return quantity <= 0 ? lines.filter(l => l !== line) : lines.map(l => l === line ? { ...l, quantity } : l);
    });
  }
  function next() {
    if (step === 0 && !items.length) return setError('Choose at least one perfume.');
    setError(''); setStep(step + 1);
  }
  function finish() {
    if (!items.length) { setStep(0); return setError('Choose at least one perfume.'); }
    if (!to.trim() || !from.trim()) return setError('Add who the gift is to and from.');
    const gift: GiftDraft = { basket: { id: basket.id, name: basket.name, price: basket.price }, card, to: to.trim(), from: from.trim(), message: message.trim(), items };
    store.setGift(gift);
    setError('');
    done();
  }

  return <section className="section gift-section" id="gift">
    <div className="section-heading"><div><h2>Build a <em>gift.</em></h2></div></div>
    <ol className="gift-steps">{STEPS.map((label, i) => <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''}><button type="button" disabled={i > step} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}><span>{i < step ? <Check size={14} /> : i + 1}</span>{label}</button></li>)}</ol>
    <div className="gift-layout">
      <div className="gift-panel">
        {step === 0 && <div className="gift-products">{products.map(p => {
          const size = chosen[p.id] ?? firstSize(p);
          const line = items.find(l => l.id === p.id && l.size === size);
          const soldOut = p.soldOut?.includes(size);
          return <div className="gift-product" key={p.id}>
            <div className="gift-thumb"><Photo src={p.image} alt={p.name} sizes="72px" /></div>
            <div className="gift-product-copy"><h3>{p.name}</h3><label><span className="sr-only">{p.name} size</span><select value={size} onChange={e => setChosen({ ...chosen, [p.id]: Number(e.target.value) })}>{sizesOf(p).map(s => <option key={s} value={s}>{s} ml · {money(priceFor(p, s))}</option>)}</select></label></div>
            {line ? <div className="quantity"><button type="button" aria-label={`Remove one ${p.name} ${size} ml`} onClick={() => change(p.id, size, -1)}><Minus size={15} /></button><span aria-live="polite">{line.quantity}</span><button type="button" aria-label={`Add one more ${p.name} ${size} ml`} disabled={line.quantity >= 10} onClick={() => change(p.id, size, 1)}><Plus size={15} /></button></div>
              : <button type="button" className="gift-add" disabled={soldOut} onClick={() => change(p.id, size, 1)}>{soldOut ? 'Sold out' : <>Add <Plus size={14} /></>}</button>}
          </div>;
        })}</div>}
        {step === 1 && <div className="gift-baskets" role="radiogroup" aria-label="Basket">{baskets.map(b => <label key={b.id} className={b.id === basket.id ? 'selected' : ''}><input type="radio" name="gift-basket" checked={b.id === basket.id} onChange={() => setBasketId(b.id)} />{b.image ? <span className="gift-basket-photo"><Photo src={b.image} alt="" sizes="220px" /></span> : <Gift size={24} strokeWidth={1.2} />}<strong>{b.name}</strong>{b.description && <small>{b.description}</small>}<span className="gift-basket-price">{b.price ? `+ ${money(b.price)}` : 'Included'}</span></label>)}</div>}
        {step === 2 && <div className="gift-card-form">
          <div className="gift-card-designs" role="radiogroup" aria-label="Card design">{CARDS.map(c => <label key={c} className={`gift-card-${c.toLowerCase()} ${c === card ? 'selected' : ''}`}><input type="radio" name="gift-card" checked={c === card} onChange={() => setCard(c)} />{c}</label>)}</div>
          <div className="form-grid"><label className="field">To<input value={to} maxLength={60} onChange={e => { setTo(e.target.value); setError(''); }} /></label><label className="field">From<input value={from} maxLength={60} onChange={e => { setFrom(e.target.value); setError(''); }} /></label></div>
          <label className="field">Message<textarea rows={3} maxLength={300} value={message} onChange={e => setMessage(e.target.value)} /></label>
        </div>}
        {error && <p className="form-message" role="alert">{error}</p>}
        <div className="gift-actions">
          {step > 0 && <button type="button" className="text-link" onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Back</button>}
          {step < 2 ? <button type="button" className="button" onClick={next}>Next <ArrowRight size={17} /></button>
            : <button type="button" className="button" onClick={finish}>{store.gift ? 'Update gift in bag' : 'Add gift to bag'} <ArrowRight size={17} /></button>}
        </div>
      </div>
      <aside className="gift-preview">
        <div className={`gift-card gift-card-${card.toLowerCase()}`}>
          <small>To</small><strong>{to.trim() || '—'}</strong>
          <p>{message.trim() || 'Your message appears here.'}</p>
          <small>From</small><strong>{from.trim() || '—'}</strong>
        </div>
        <div className="summary-row"><span>Perfumes ({items.reduce((n, l) => n + l.quantity, 0)})</span><span>{money(perfumes)}</span></div>
        {step > 0 && <div className="summary-row"><span>{basket.name}</span><span>{money(basket.price)}</span></div>}
        <div className="summary-row total"><span>Gift total</span><strong>{money(perfumes + (step > 0 ? basket.price : 0))}</strong></div>
      </aside>
    </div>
  </section>;
}
