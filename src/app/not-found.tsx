import Link from 'next/link';
export default function NotFound() {
  return <main className="section empty-state" style={{ minHeight: '100svh' }}><Link className="wordmark" href="/">SENTBALE</Link><p className="eyebrow">A SMALL DETOUR / 404</p><h1>This story is still unwritten.</h1><p>We couldn’t find that page. Discover something else in the collection.</p><Link className="button" href="/shop">Explore fragrances →</Link></main>;
}
