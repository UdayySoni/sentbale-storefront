'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Star } from 'lucide-react';
import type { Product } from '@/lib/catalog';
import { useAccount } from './account';
import { useContent } from './content-provider';

function Stars({ value }: { value: number }) {
  return <span className="review-stars" aria-label={`${value} out of 5`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} fill={n <= value ? 'currentColor' : 'none'} />)}</span>;
}

/** Published reviews for a product, and a form for signed-in customers. New reviews wait for approval. */
export default function ProductReviews({ product }: { product: Product }) {
  const reviews = useContent().reviews.filter(r => r.product === product.name);
  const account = useAccount();
  const [rating, setRating] = useState(5);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id, rating, title: fields.get('title'), body: fields.get('body') }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSent(true);
    } catch (e) { setError(e instanceof Error && e.message ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="section reviews-section" aria-labelledby="reviews-heading">
    <p className="eyebrow">IN THEIR WORDS</p>
    <h2 id="reviews-heading">What people <em>say.</em></h2>
    {reviews.length ? <>
      <div className="reviews-summary"><strong>{average.toFixed(1)}</strong><Stars value={Math.round(average)} /><span>{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</span></div>
      <div className="review-list">{reviews.map(r => <article className="review-card" key={r.id}><Stars value={r.rating} /><h3>{r.title}</h3>{r.body && <p>{r.body}</p>}<small>{r.customer} · {new Date(r.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</small></article>)}</div>
    </> : <p className="muted reviews-summary">No reviews yet. Be the first to share yours.</p>}
    {sent ? <p className="contact-success" role="status">Thank you. Your review will appear once our team has read it.</p>
      : account.user ? <form className="review-form" onSubmit={submit}>
        <div><p className="field">Your rating</p><div className="rating-pick" role="group" aria-label="Your rating">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} className={rating === n ? 'selected' : ''} aria-pressed={rating === n} onClick={() => setRating(n)}>{n}</button>)}</div></div>
        <label className="field">Headline<input name="title" maxLength={120} required /></label>
        <label className="field">Your review<textarea name="body" rows={4} maxLength={1500} /></label>
        {error && <p className="form-message" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Submit review'}</button>
      </form>
      : account.loaded && <p className="muted"><Link className="text-link" href="/account">Sign in</Link> to write a review.</p>}
  </section>;
}
