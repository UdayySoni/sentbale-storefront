'use client';
import { useProducts } from '@/components/catalog-provider';

import Link from 'next/link';
import Account, { useAccount } from './account';
import { Photo, HeroPhoto } from './media-image';
import { AddressBook, OrderDetail, FAQPage, CollectionIntro } from './customer-pages';
import { defaultMedia } from '@/lib/media';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, ArrowLeft, Search, UserRound, ShoppingBag, Menu, X, Heart, Plus, Minus, Check, Leaf, Sparkles, Gift, ChevronDown, SlidersHorizontal, Trash2, Package, MapPin, Mail, LockKeyhole, CheckCircle2, LogOut } from 'lucide-react';
import { families, articles, sizes, priceFor, money, type Product, type Size } from '@/lib/catalog';
import { useStore, type DemoOrder } from '@/lib/store';
import { useContent } from './content-provider';
import ProductReviews from './product-reviews';
import { ResetPassword } from './password-reset';
import type { SiteContent } from '@/lib/content';

type Store = ReturnType<typeof useStore>;
const nav = [['Home', '/'], ['Shop', '/shop'], ['Collections', '/collections'], ['Our Story', '/our-story'], ['Journal', '/journal']];

function Eyebrow({ children }: { children: ReactNode }) { return <p className="eyebrow">{children}</p>; }
function ButtonLink({ href, children, light = false }: { href: string; children: ReactNode; light?: boolean }) {
  return <Link className={`button ${light ? 'button-light' : ''}`} href={href}>{children}<ArrowRight size={17} /></Link>;
}
function Modal({ open, close, title, children, side = false }: { open: boolean; close: () => void; title: string; children: ReactNode; side?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal(); else ref.current?.close();
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, [open]);
  return <dialog ref={ref} aria-label={title} className={side ? 'modal drawer' : 'modal'} onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="modal-inner"><div className="modal-heading"><h2>{title}</h2><button aria-label={`Close ${title}`} className="icon-button" onClick={close}><X /></button></div>{children}</div>
  </dialog>;
}

export default function Storefront() {
  const products = useProducts();
  const content = useContent();
  const path = usePathname();
  const store = useStore();
  const [overlay, setOverlay] = useState<'cart' | 'search' | 'menu' | 'quiz' | null>(null);
  const [toast, setToast] = useState('');
  const [quick, setQuick] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const home = path === '/';
  useEffect(() => { setOverlay(null); setQuick(null); }, [path]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  function notify(message: string) { setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3500); }
  function add(id: string, size: Size = 50, quantity = 1) { store.add(id, size, quantity); setQuick(null); setOverlay('cart'); }
  function wish(id: string) { const wasSaved = store.wishlist.includes(id); store.toggleWish(id); notify(wasSaved ? 'Removed from your favourites' : 'Saved to your favourites'); }
  const card = (p: Product) => <ProductCard key={p.id} product={p} saved={store.wishlist.includes(p.id)} wish={() => wish(p.id)} quick={() => setQuick(p)} />;

  let page: ReactNode;
  if (home) page = <Home card={card} quiz={() => setOverlay('quiz')} />;
  else if (path === '/shop' || path.startsWith('/collections/')) page = <Shop path={path} card={card} />;
  else if (path === '/collections') page = <Collections />;
  else if (path.startsWith('/product/')) {
    const product = products.find(p => p.id === path.split('/')[2]);
    page = product ? <ProductPage key={product.id} product={product} add={add} saved={store.wishlist.includes(product.id)} wish={() => wish(product.id)} card={card} /> : <NotFound />;
  } else if (path === '/cart') page = <CartPage store={store} />;
  else if (path === '/checkout') page = <Checkout store={store} />;
  else if (path === '/account/addresses') page = <AddressBook />;
  else if (path === '/account/reset') page = <ResetPassword />;
  else if (path.startsWith('/account/orders/')) page = <OrderDetail id={path.split('/')[3]} />;
  else if (path === '/faq') page = <FAQPage />;
  else if (path.startsWith('/account')) page = <Account store={store} path={path} card={card} />;
  else if (path === '/our-story') page = <Story />;
  else if (path === '/journal') page = <Journal />;
  else if (path.startsWith('/journal/')) page = <Article slug={path.split('/')[2]} />;
  else if (path === '/contact') page = <Contact />;
  else if (path === '/shipping' || path === '/returns' || path === '/privacy') page = <Policy path={path} />;
  else if (path === '/terms') page = <Terms />;
  else page = <NotFound />;

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className={`site-top ${home ? 'over-hero' : ''}`} data-ready={store.ready}>
      <div className="announcement"><span>{content.homepage.announcementOn && content.homepage.announcement.trim() ? content.homepage.announcement : 'A world of fragrance. A story of your own.'}</span><button onClick={() => setOverlay('quiz')}>Find your signature <ArrowUpRight size={12} /></button></div>
      <header className="header">
        <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setOverlay('menu')}><Menu size={23} /></button>
        <Link href="/" className="wordmark" aria-label="SENTBALE home">SENTBALE<span>PARFUMS</span></Link>
        <nav aria-label="Main navigation">{nav.map(([label, href]) => <Link href={href} key={href} className={(href === '/' ? home : path.startsWith(href)) ? 'active' : ''}>{label}</Link>)}</nav>
        <div className="header-actions"><button className="icon-button" aria-label="Search fragrances" onClick={() => setOverlay('search')}><Search size={21} /></button><Link className="icon-button account-icon" aria-label="My account" href="/account"><UserRound size={21} /></Link><button className="icon-button bag-button" aria-label={`Open bag, ${store.count} items`} onClick={() => setOverlay('cart')}><ShoppingBag size={21} /><span>{store.count}</span></button></div>
      </header>
    </div>
    <main id="main">{page}</main>
    <Footer notify={notify} />
    {content.preview && <div className="preview-ribbon">TEST MODE <span>•</span> Checkout takes no payment. <Link href="/admin">Admin dashboard ↗</Link></div>}
    {store.storageError && <p className="storage-note" role="status">Browser storage is unavailable. Your bag will last for this visit only.</p>}
    <div className={`toast ${toast ? 'visible' : ''}`} role="status">{toast && <><CheckCircle2 size={17} />{toast}</>}</div>
    <Modal open={overlay === 'cart'} close={() => setOverlay(null)} title={`Your bag (${store.count})`} side>
      {store.cart.length ? <><CartLines store={store} /><div className="drawer-summary"><div><span>Subtotal</span><strong>{money(store.total)}</strong></div><p>Delivery calculated at checkout. Demo prices include taxes.</p><Link href="/checkout" onClick={() => setOverlay(null)} className="button">Continue to checkout <ArrowRight size={17} /></Link><Link className="text-link centered" href="/cart" onClick={() => setOverlay(null)}>View your bag</Link></div></> : <Empty title="A story waiting to begin" text="Find the fragrance that feels like you." action={() => setOverlay(null)} />}
    </Modal>
    <Modal open={overlay === 'search'} close={() => setOverlay(null)} title="Discover your next scent">
      <label className="search-input"><Search size={20} /><input autoComplete="off" autoFocus={overlay === 'search'} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a fragrance, note or collection" aria-label="Search" /></label>
      <Eyebrow>{query ? 'YOUR DISCOVERIES' : 'EXPLORE THE COLLECTION'}</Eyebrow>
      <div className="search-results">{products.filter(p => `${p.name} ${p.family} ${p.notes.flat().join(' ')}`.toLowerCase().includes(query.toLowerCase().trim())).map(p => <Link href={`/product/${p.id}`} key={p.id} onClick={() => setOverlay(null)}><div className="search-image"><Photo src={p.image} alt={p.name} sizes="80px" /></div><div><h3>{p.name}</h3><p>{p.family} · Eau de Parfum</p></div><ArrowUpRight size={20} /></Link>)}</div>
      {products.every(p => !`${p.name} ${p.family} ${p.notes.flat().join(' ')}`.toLowerCase().includes(query.toLowerCase().trim())) && <p className="muted">No fragrances found. Try “oud”, “jasmine”, or “citrus”.</p>}
    </Modal>
    <Modal open={overlay === 'menu'} close={() => setOverlay(null)} title="SENTBALE" side><nav className="mobile-nav">{[...nav, ['My account', '/account'], ['Contact', '/contact']].map(([label, href]) => <Link href={href} key={href} onClick={() => setOverlay(null)}>{label}<ArrowUpRight size={23} /></Link>)}</nav></Modal>
    <Modal open={overlay === 'quiz'} close={() => setOverlay(null)} title="Find your signature"><ScentFinder close={() => setOverlay(null)} /></Modal>
    <Modal open={!!quick} close={() => setQuick(null)} title={quick?.name || 'Quick view'}>{quick && <QuickView key={quick.id} product={products.find(p => p.id === quick.id) || quick} add={add} />}</Modal>
  </>;
}

function Home({ card, quiz }: { card: (p: Product) => ReactNode; quiz: () => void }) {
  const products = useProducts();
  const { homepage } = useContent();
  const shown = useFamilies();
  return <>
    <section className="hero">
      <HeroPhoto />
      <div className="hero-shade" />
      <HeroCopy />
      <div className="hero-foot"><div className="hero-index"><span>01</span><i /><span>THE LEGACY COLLECTION</span></div><Link href="/product/legacy" className="hero-product"><span>MEET LEGACY<small>Oud · Saffron · Amber</small></span><span className="circle-arrow"><ArrowUpRight size={22} /></span></Link></div>
      <span className="hero-side">A JOURNEY IN EVERY SCENT</span>
    </section>
    <section className="promise-strip" aria-label="The SENTBALE philosophy"><div><Leaf /><span>Inspired by nature</span></div><div><Sparkles /><span>Made for your signature</span></div><div><Gift /><span>A beautiful gifting ritual</span></div><Link href="/our-story">The SENTBALE philosophy <ArrowUpRight size={15} /></Link></section>
    <section className="section collections-section"><div className="section-heading"><div><Eyebrow>THE SCENT WARDROBE</Eyebrow><h2>Find your <em>signature.</em></h2></div><Link href="/collections" className="text-link">Explore all collections <ArrowUpRight size={17} /></Link></div><div className="collection-grid">{shown.map(f => <CollectionCard key={f.name} family={f} />)}</div></section>
    <section className="section featured-section"><div className="section-heading"><div><Eyebrow>THE SENTBALE EDIT</Eyebrow><h2>Extraordinary scents.<br className="mobile-only" /> <em>Entirely you.</em></h2></div><Link href="/shop" className="text-link">Shop all fragrances <ArrowUpRight size={17} /></Link></div><div className="product-grid">{featuredProducts(products, homepage.featured).map(card)}</div></section>
    <section className="story-split"><div className="story-visual"><Photo slot="home.story" src="/images/hero.png" alt="Amber light falling across a rocky fragrance landscape" /><span className="image-caption">MEMORIES, MADE TANGIBLE.</span></div><div className="story-copy"><Eyebrow>THE WORLD OF SENTBALE</Eyebrow><h2>A fragrance<br />for every <em>story.</em></h2><p>Some moments stay with us. A place, a person, the feeling of being completely yourself.</p><p>SENTBALE is an exploration of those moments through scent. A meeting of natural inspiration and modern expression, made to become part of your story.</p><Link href="/our-story" className="text-link">Discover our world <ArrowUpRight size={18} /></Link><span className="story-signature">Scents that stay.</span></div></section>
    {homepage.showFinder && <section className="scent-banner"><div className="scent-emblem"><Sparkles size={42} strokeWidth={1} /></div><div><Eyebrow>A LITTLE DISCOVERY. A LASTING CONNECTION.</Eyebrow><h2>Your signature is <em>waiting.</em><span>Follow your senses. We’ll help you find the one.</span></h2></div><button className="button" onClick={quiz}>Find my scent <ArrowRight size={17} /></button></section>}
    {homepage.showJournal && <section className="section journal-section"><div className="section-heading"><div><Eyebrow>NOTES FROM OUR JOURNAL</Eyebrow><h2>Stories in <em>every scent.</em></h2></div><Link href="/journal" className="text-link">Read the journal <ArrowUpRight size={17} /></Link></div><JournalCards limit={3} /></section>}
  </>;
}

/** The fragrance families the admin has left visible, in the admin's order and wording. */
function useFamilies() {
  const { collections } = useContent();
  return visibleFamilies(collections);
}
function visibleFamilies(collections: SiteContent['collections']) {
  return collections.flatMap(c => { const f = families.find(f => f.name.toLowerCase() === c.id); return f ? [{ ...f, description: c.description || f.description }] : []; });
}
/** Products in the homepage's "featured" order (names separated by commas); all of them when none are named. */
function featuredProducts(products: Product[], featured: string) {
  const names = featured.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
  const chosen = names.flatMap(name => products.filter(p => p.name.toLowerCase() === name));
  return chosen.length ? chosen : products;
}
function HeroCopy() {
  const { homepage: h } = useContent();
  const standard = h.headline.trim() === 'More than a fragrance. A feeling.';
  const standardCta = h.cta === 'Explore fragrances' && h.ctaHref === '/shop';
  return <div className="hero-copy"><Eyebrow><span className="tiny-line" /> {h.eyebrow.trim() || 'SCENTS THAT STAY'}</Eyebrow>{standard ? <h1>More than<br />a fragrance.<span>A feeling.</span></h1> : <h1>{h.headline}</h1>}{h.subheadline.trim() ? <p>{h.subheadline}</p> : <p>For the moments that become memories.<br />Discover a scent that tells your story.</p>}<ButtonLink href={h.ctaHref || '/shop'} light>{standardCta ? 'Explore the collection' : h.cta}</ButtonLink></div>;
}

function CollectionCard({ family: f }: { family: typeof families[number] }) {
  return <Link href={`/collections/${f.name.toLowerCase()}`} className={`collection-card collection-${f.name.toLowerCase()}`}><Photo slot={`collection.${f.name.toLowerCase()}`} src={f.image} alt={`${f.name} fragrance collection`} sizes="(max-width: 700px) 50vw, 25vw" /><div className="collection-scrim" /><span className="collection-number">{f.number} /</span><div className="collection-caption"><h3>{f.name}</h3><p>{f.description}</p></div><ArrowUpRight className="collection-arrow" size={21} /></Link>;
}
function ProductCard({ product: p, saved, wish, quick }: { product: Product; saved: boolean; wish: () => void; quick: () => void }) {
  return <article className="product-card"><div className="product-image"><Link href={`/product/${p.id}`} aria-label={`Discover ${p.name}`}><Photo src={p.image} alt={`${p.name} eau de parfum bottle`} sizes="(max-width: 700px) 50vw, 25vw" /></Link>{p.badge && <span className="product-badge">{p.badge}</span>}<button className={`wish-button ${saved ? 'saved' : ''}`} aria-label={`${saved ? 'Remove' : 'Save'} ${p.name} ${saved ? 'from' : 'to'} favourites`} aria-pressed={saved} onClick={wish}><Heart size={19} fill={saved ? 'currentColor' : 'none'} /></button><button className="quick-add" onClick={quick}>Discover fragrance <Plus size={16} /></button></div><div className="product-meta"><div><p className="product-family">{p.family.toUpperCase()} · EAU DE PARFUM</p><Link href={`/product/${p.id}`}><h3>{p.name}</h3></Link><p className="product-mood">{p.mood}</p></div><span className="product-price">{money(p.price)}<small>50 ml</small></span></div></article>;
}

function Shop({ path, card }: { path: string; card: (p: Product) => ReactNode }) {
  const products = useProducts();
  const slug = path.startsWith('/collections/') ? path.split('/')[2] : '';
  const shownFamilies = useFamilies();
  const initial = shownFamilies.find(f => f.name.toLowerCase() === slug)?.name || 'All';
  const [filter, setFilter] = useState<string>(initial);
  const [sort, setSort] = useState('featured');
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => { setFilter(initial); }, [initial]);
  if (slug && initial === 'All') return <NotFound />;
  const shown = products.filter(p => filter === 'All' || p.family === filter).sort((a, b) => sort === 'low' ? a.price - b.price : sort === 'high' ? b.price - a.price : sort === 'name' ? a.name.localeCompare(b.name) : 0);
  return <><PageHero imageSlot={slug ? `collection.${slug}` : "page.hero"} eyebrow="DISCOVER YOUR WORLD" title={initial === 'All' ? 'The fragrance collection.' : `The ${initial.toLowerCase()} collection.`} text="A mood. A memory. A moment made yours. Find a fragrance that feels like you." />{slug && <CollectionIntro family={initial} />}<section className="section shop-section"><div className="shop-toolbar"><button className="filter-toggle text-link" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal size={17} /> Fragrance family</button><div className={`filter-tabs ${showFilters ? 'show' : ''}`}>{['All', ...shownFamilies.map(f => f.name)].map(f => <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f === 'All' ? 'All fragrances' : f}</button>)}</div><label className="sort-select"><span className="sr-only">Sort fragrances</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="name">Name: A–Z</option></select><ChevronDown size={15} /></label></div><p className="result-count">{shown.length} {shown.length === 1 ? 'fragrance' : 'fragrances'} <span>Find something that stays.</span></p><div className="product-grid">{shown.map(card)}</div><div className="catalogue-note"><Sparkles size={21} /><p>Every fragrance has a story. Which one will become yours?</p></div></section></>;
}
function PageHero({ eyebrow, title, text, imageSlot = 'page.hero' }: { eyebrow: string; title: string; text: string; imageSlot?: string }) {
  return <section className="page-hero"><Photo slot={imageSlot} src={defaultMedia.images[imageSlot]?.src || "/images/hero.png"} alt="" priority sizes="100vw" /><div className="page-hero-shade" /><div><Eyebrow>{eyebrow}</Eyebrow><h1>{title}</h1><p>{text}</p></div></section>;
}
function Collections() {
  const shown = useFamilies();
  return <><PageHero eyebrow="FOUR WORLDS. ENDLESS POSSIBILITIES." title="Follow your senses." text="Explore the notes, textures, and feelings that make a fragrance your own." /><section className="section"><div className="section-heading"><div><Eyebrow>OUR COLLECTIONS</Eyebrow><h2>A different kind of <em>escape.</em></h2></div></div><div className="collection-grid collection-large">{shown.map(f => <CollectionCard key={f.name} family={f} />)}</div></section></>;
}
function Quantity({ value, change, label = 'Quantity' }: { value: number; change: (v: number) => void; label?: string }) {
  return <div className="quantity"><button aria-label={`Decrease ${label}`} onClick={() => change(value - 1)} disabled={value <= 1}><Minus size={15} /></button><span aria-live="polite">{value}</span><button aria-label={`Increase ${label}`} onClick={() => change(value + 1)} disabled={value >= 10}><Plus size={15} /></button></div>;
}
function SizeSelector({ value, change, soldOut = [] }: { value: Size; change: (s: Size) => void; soldOut?: Size[] }) {
  return <div className="size-selector" role="group" aria-label="Bottle size">{sizes.map(s => <button key={s} className={`${value === s ? 'selected' : ''} ${soldOut.includes(s) ? 'sold-out' : ''}`} onClick={() => change(s)} aria-pressed={value === s} aria-label={soldOut.includes(s) ? `${s} ml, sold out` : undefined}>{s} ml</button>)}</div>;
}
function QuickView({ product: p, add }: { product: Product; add: (id: string, size: Size, q?: number) => void }) {
  const [size, setSize] = useState<Size>(50);
  return <div className="quick-view"><div className="quick-image"><Photo src={p.image} alt={p.name} /></div><div><Eyebrow>{p.family} · EAU DE PARFUM</Eyebrow><h3>{p.mood}</h3><p className="muted">{p.description}</p><SizeSelector value={size} change={setSize} soldOut={p.soldOut} />{p.soldOut?.includes(size) ? <button className="button" disabled>Sold out</button> : <button className="button" onClick={() => add(p.id, size)}>Add to bag — {money(priceFor(p, size))}<Plus size={17} /></button>}<Link className="text-link" href={`/product/${p.id}`}>Explore the full story <ArrowUpRight size={17} /></Link></div></div>;
}
function ProductPage({ product: p, add, saved, wish, card }: { product: Product; add: (id: string, size: Size, q: number) => void; saved: boolean; wish: () => void; card: (p: Product) => ReactNode }) {
  const products = useProducts();
  const [size, setSize] = useState<Size>(50);
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState('The fragrance');
  return <div className="product-page"><div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/shop">Fragrances</Link><span>/</span>{p.name}</div><section className="product-detail"><div className="detail-photo"><Photo src={p.image} alt={`${p.name} perfume bottle with ingredients`} priority /><span>THE SENTBALE COLLECTION / {p.family.toUpperCase()}</span></div><div className="detail-copy"><Eyebrow>{p.family} · EAU DE PARFUM</Eyebrow><h1>{p.name}</h1><p className="detail-tagline">{p.mood}</p><p className="detail-description">{p.description}</p><div className="detail-price">{money(priceFor(p, size))}<span>Inclusive of taxes · Demo pricing</span></div><div className="size-heading"><span>Choose your size</span><span>Eau de Parfum</span></div><SizeSelector value={size} change={setSize} soldOut={p.soldOut} /><div className="detail-buy"><Quantity value={quantity} change={setQuantity} />{p.soldOut?.includes(size) ? <button className="button" disabled>Sold out</button> : <button className="button" onClick={() => add(p.id, size, quantity)}>Add to bag <Plus size={18} /></button>}<button className={`icon-button detail-wish ${saved ? 'saved' : ''}`} onClick={wish} aria-label={`${saved ? 'Remove from' : 'Save to'} favourites`} aria-pressed={saved}><Heart fill={saved ? 'currentColor' : 'none'} /></button></div><div className="detail-promises"><span><Gift size={20} /> A thoughtful gift</span><span><Leaf size={20} /> Inspired by nature</span></div><div className="detail-tabs" role="tablist" aria-label="Fragrance information">{['The fragrance', 'The notes', 'The ritual'].map(t => <button role="tab" aria-selected={tab === t} aria-controls="fragrance-panel" id={`tab-${t.replaceAll(' ', '-')}`} key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div><div className="tab-content" role="tabpanel" id="fragrance-panel" aria-labelledby={`tab-${tab.replaceAll(' ', '-')}`}>{tab === 'The fragrance' ? <p>{p.name} explores the {p.family.toLowerCase()} fragrance family. Discover its opening notes, let the heart unfold, and make room for a new signature. Product composition and availability will be confirmed before launch.</p> : tab === 'The notes' ? <div className="notes-mini">{['Top', 'Heart', 'Base'].map((n, i) => <div key={n}><strong>{n}</strong><span>{p.notes[i].join(' · ')}</span></div>)}</div> : <p>Apply to pulse points and let the fragrance settle naturally. Avoid rubbing your wrists together. Store away from direct sunlight and heat. Follow the final product label for usage and ingredient information.</p>}</div></div></section>{p.notes.some(n => n.length > 0) && <section className="notes-section"><Eyebrow>THE ANATOMY OF A SCENT</Eyebrow><h2>A story that <em>unfolds.</em></h2><div className="notes-grid">{['The first impression', 'The heart of the story', 'What stays with you'].map((n, i) => <div key={n}><span className="note-number">0{i + 1}</span><Eyebrow>{['TOP NOTES', 'HEART NOTES', 'BASE NOTES'][i]}</Eyebrow><h3>{p.notes[i].join(' & ')}</h3><p>{n}</p></div>)}</div></section>}<ProductReviews product={p} /><section className="section"><div className="section-heading"><div><Eyebrow>CONTINUE YOUR DISCOVERY</Eyebrow><h2>You may also <em>love.</em></h2></div></div><div className="product-grid three">{products.filter(other => other.id !== p.id).map(card)}</div></section></div>;
}

function CartLines({ store }: { store: Store }) {
  const products = useProducts();
  return <div className="cart-lines">{store.cart.map(line => {
    const p = products.find(p => p.id === line.id)!;
    return <div className="cart-line" key={`${line.id}-${line.size}`}><Link href={`/product/${p.id}`} className="cart-thumb"><Photo src={p.image} alt={p.name} sizes="120px" /></Link><div className="cart-line-copy"><Link href={`/product/${p.id}`}><h3>{p.name}</h3></Link><p>Eau de Parfum · {line.size} ml</p><button className="save-later" onClick={() => { if (!store.wishlist.includes(p.id)) store.toggleWish(p.id); store.quantity(line.id, line.size, 0); }}><Heart size={12} /> Save for later</button><Quantity value={line.quantity} change={q => store.quantity(line.id, line.size, q)} label={`${p.name} ${line.size} ml quantity`} /></div><div className="cart-line-price"><strong>{money(priceFor(p, line.size) * line.quantity)}</strong><button className="icon-button" onClick={() => store.quantity(line.id, line.size, 0)} aria-label={`Remove ${p.name} ${line.size} ml`}><Trash2 size={17} /></button></div></div>;
  })}</div>;
}
function Empty({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return <div className="empty-state"><ShoppingBag size={40} strokeWidth={1} /><h2>{title}</h2><p>{text}</p><Link className="button" href="/shop" onClick={action}>Explore fragrances <ArrowRight size={17} /></Link></div>;
}
function CartPage({ store }: { store: Store }) {
  const products = useProducts();
  return <section className="section cart-page"><Eyebrow>YOUR SCENT WARDROBE</Eyebrow><div className="section-heading"><h1>Your bag<span className="heading-count">({store.count})</span></h1><Link href="/shop" className="text-link">Continue discovering <ArrowRight size={17} /></Link></div>{store.cart.length ? <div className="cart-layout"><CartLines store={store} /><aside className="order-summary"><h2>A little closer to yours.</h2><div className="summary-row"><span>Subtotal</span><span>{money(store.total)}</span></div><div className="summary-row"><span>Delivery</span><span>At checkout</span></div><div className="summary-row total"><span>Total</span><strong>{money(store.total)}</strong></div><ButtonLink href="/checkout">Continue to checkout</ButtonLink><p className="checkout-note"><LockKeyhole size={14} /> Local demo — no payment will be taken</p></aside></div> : <Empty title="Your next signature awaits" text="Your bag is empty. Let your senses lead the way." />}{store.cart.length > 0 && <div className="cart-recommendations"><Eyebrow>COMPLETE YOUR SCENT WARDROBE</Eyebrow><h2>A different mood. <em>Still you.</em></h2><div className="bag-pairings">{products.filter(p => !store.cart.some(l => l.id === p.id)).slice(0,3).map(p => <div className="bag-pairing" key={p.id}><Link className="cart-thumb" href={`/product/${p.id}`}><Photo src={p.image} alt={p.name} sizes="80px" /></Link><div><h3>{p.name}</h3><p>{p.family} � {money(p.price)}</p><button className="text-link" onClick={() => store.add(p.id,50,1)}>Add 50 ml <Plus size={14}/></button></div></div>)}</div></div>}</section>;
}

type CheckoutQuote = {
  lines: { id: string; size: Size; quantity: number; name: string; image: string; unitPrice: number }[];
  subtotal: number; discount: number; shipping: number; tax: number; taxRate: number; taxIncluded: boolean; total: number;
  coupon: { code: string; applied: boolean; message: string } | null;
  delivery: { id: 'standard' | 'express'; label: string; eta: string; price: number }[];
  deliverable: boolean; problems: string[];
};
type RazorpayResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayCheckout = new (options: Record<string, unknown>) => { open: () => void };

/** Loads Razorpay Checkout once, on demand. */
function razorpayScript(): Promise<RazorpayCheckout> {
  const existing = (window as unknown as { Razorpay?: RazorpayCheckout }).Razorpay;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve((window as unknown as { Razorpay: RazorpayCheckout }).Razorpay);
    script.onerror = () => reject(new Error('Online payment could not be loaded. Check your connection and try again.'));
    document.head.appendChild(script);
  });
}

function Checkout({ store }: { store: Store }) {
  const products = useProducts();
  const account = useAccount();
  const content = useContent();
  const requestId = useRef(crypto.randomUUID());
  const choices = [content.payments.online && 'razorpay', content.payments.cod && 'cod', content.payments.test && 'test'].filter(Boolean) as ('razorpay' | 'cod' | 'test')[];
  const [complete, setComplete] = useState<DemoOrder | null>(null);
  const [delivery, setDelivery] = useState<'standard' | 'express'>('standard');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [payment, setPayment] = useState(choices[0] ?? 'test');
  const [scenario, setScenario] = useState('success');
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const locked = useRef(false);

  // Totals always come from the server, so what is shown is what is charged.
  useEffect(() => {
    if (!store.ready || !store.cart.length) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/checkout/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: store.cart, delivery, state, pincode, coupon }) });
        const data = await response.json();
        if (active && response.ok) setQuote(data);
      } catch { /* Keep the last totals; the order itself is priced on the server. */ }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [store.cart, store.ready, delivery, state, pincode, coupon]);

  async function payOnline(data: { order: DemoOrder; razorpay: { keyId: string; orderId: string; amount: number; currency: string; name: string; email: string; phone: string } }) {
    const Razorpay = await razorpayScript();
    const result = await new Promise<RazorpayResult | null>(resolve => new Razorpay({
      key: data.razorpay.keyId, order_id: data.razorpay.orderId, amount: data.razorpay.amount, currency: data.razorpay.currency,
      name: content.store.name, description: `Order ${data.order.id}`,
      prefill: { name: data.razorpay.name, email: data.razorpay.email, contact: data.razorpay.phone }, theme: { color: '#93602e' },
      handler: (response: RazorpayResult) => resolve(response), modal: { ondismiss: () => resolve(null) },
    }).open());
    if (!result) throw new Error('Payment was not completed. Your bag is unchanged, so you can try again.');
    const verified = await fetch('/api/payments/razorpay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: data.order.id, razorpayOrderId: result.razorpay_order_id, paymentId: result.razorpay_payment_id, signature: result.razorpay_signature }) });
    const body = await verified.json();
    if (!verified.ok) throw new Error(body.error);
    return body.order as DemoOrder;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked.current) return;
    if (payment === 'test' && scenario !== 'success') { setMessage(scenario === 'failed' ? 'Demo payment declined. Your bag is unchanged. Select success to try again.' : 'Demo payment is pending. No order has been confirmed. Select success to continue.'); return; }
    const fields = new FormData(e.currentTarget);
    locked.current = true; setProcessing(true); setMessage('');
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: requestId.current, items: store.cart, delivery, payment, coupon: quote?.coupon?.applied ? coupon : '', name: fields.get('name'), phone: fields.get('phone'), address: { line: fields.get('address'), city: fields.get('city'), state: fields.get('state'), pincode: fields.get('pincode') } }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const order = data.razorpay ? await payOnline(data) : data.order;
      setComplete(order); store.clear();
    } catch(error) { setMessage(error instanceof Error && error.message ? error.message : 'Unable to save your order. Please try again.'); locked.current = false; setProcessing(false); }
  }
  if (complete) {
    const test = complete.paymentMethod === 'Test payment' || complete.id.startsWith('DEMO-');
    return <section className="section confirmation"><CheckCircle2 size={56} strokeWidth={1} /><Eyebrow>{test ? 'A LITTLE PREVIEW OF WHAT’S TO COME' : 'YOUR ORDER IS CONFIRMED'}</Eyebrow><h1>Thank you, {complete.name.split(' ')[0]}.</h1>
      {test ? <><p>Your test order <strong>{complete.id}</strong> has been saved to your account.</p><p>No payment was taken, and no shipment will be created.</p></>
        : <><p>Your order <strong>{complete.id}</strong> is confirmed{complete.paymentStatus === 'Paid' ? ' and paid' : ''}.</p><p>{complete.paymentStatus === 'Paid' ? 'A confirmation is on its way to your inbox.' : `Please keep ${money(complete.total)} ready for the courier.`}</p></>}
      <div className="confirmation-actions"><ButtonLink href="/account/orders">{test ? 'View demo orders' : 'View your orders'}</ButtonLink><Link href="/shop" className="text-link">Keep exploring <ArrowRight size={17} /></Link></div></section>;
  }
  if (!account.loaded) return <section className="section"><p>Preparing your checkout…</p></section>;
  if (!account.user) return <section className="section empty-state"><LockKeyhole size={38} strokeWidth={1}/><Eyebrow>YOUR PERSONAL CHECKOUT</Eyebrow><h1>A little closer to yours.</h1><p>Sign in or create an account to keep your orders together. Your bag will be waiting.</p><ButtonLink href="/account?next=checkout">Continue to your account</ButtonLink></section>;
  if (!store.cart.length) return <section className="section"><Empty title="Your bag is waiting" text="Add a fragrance before continuing to checkout." /></section>;
  const options = quote?.delivery ?? [{ id: 'standard' as const, label: 'Standard delivery', eta: '3–5 business days', price: 0 }, { id: 'express' as const, label: 'Express delivery', eta: '1–2 business days', price: 199 }];
  const total = quote?.total ?? store.total + (options.find(o => o.id === delivery)?.price ?? 0);
  const blocked = !!quote && (quote.problems.length > 0 || !quote.deliverable);
  const label = payment === 'test' ? 'Place test order' : payment === 'cod' ? 'Place order' : `Pay ${money(total)}`;
  return <section className="section checkout-page"><Eyebrow>THE FINAL TOUCH</Eyebrow><h1>Make it <em>yours.</em></h1>
    {payment === 'test' && <div className="demo-notice"><LockKeyhole size={17} /><span>Test checkout. Use sample details. No payment is taken and no shipment is created.</span></div>}
    <form className="checkout-layout" onSubmit={submit}><div>
      <h2><span className="step-number">01</span> Your details</h2>
      <div className="form-grid"><Field label="Full name" name="name" autoComplete="name" defaultValue={account.user.name} required /><Field label="Email address" name="email" type="email" autoComplete="email" defaultValue={account.user.email} readOnly required /><Field label="Phone number" name="phone" type="tel" pattern="[0-9+ ()-]{10,16}" autoComplete="tel" required /><Field label="Pincode" name="pincode" inputMode="numeric" pattern="[1-9][0-9]{5}" autoComplete="postal-code" required onBlur={e => { const value = e.currentTarget.value.trim(); setPincode(/^[1-9][0-9]{5}$/.test(value) ? value : ''); }} /><div className="full"><Field label="Delivery address" name="address" autoComplete="street-address" required /></div><Field label="City" name="city" autoComplete="address-level2" required /><Field label="State" name="state" autoComplete="address-level1" required onBlur={e => setState(e.currentTarget.value.trim())} /></div>
      <h2><span className="step-number">02</span> Delivery</h2>
      <div className="shipping-options">{options.map(o => <label key={o.id} className={delivery === o.id ? 'selected' : ''}><input type="radio" name="delivery" value={o.id} checked={delivery === o.id} onChange={() => setDelivery(o.id)} /><span><strong>{o.label}</strong><small>{o.eta}</small></span><span>{o.price ? money(o.price) : 'Complimentary'}</span></label>)}</div>
      {quote && !quote.deliverable && <p className="form-message" role="alert">We don’t deliver to {state} yet.</p>}
      <h2><span className="step-number">03</span> Payment</h2>
      {choices.length > 1 && <div className="shipping-options">{choices.map(choice => <label key={choice} className={payment === choice ? 'selected' : ''}><input type="radio" name="payment" value={choice} checked={payment === choice} onChange={() => { setPayment(choice); setMessage(''); }} /><span><strong>{choice === 'razorpay' ? 'Pay online' : choice === 'cod' ? 'Cash on delivery' : 'Test payment'}</strong><small>{choice === 'razorpay' ? (content.payments.methods.filter(m => !/^(cod|cash on delivery)$/i.test(m)).join(' · ') || 'UPI · Cards · Net banking') : choice === 'cod' ? 'Pay the courier when your order arrives' : 'No money is taken'}</small></span></label>)}</div>}
      {payment === 'test' ? <label className="field">Preview a checkout outcome<select value={scenario} onChange={e => { setScenario(e.target.value); setMessage(''); }}><option value="success">Success — create a test order</option><option value="failed">Payment declined</option><option value="pending">Payment pending</option></select></label>
        : payment === 'razorpay' ? <p className="muted">You’ll complete payment securely with Razorpay.</p> : <p className="muted">Pay in cash or UPI when your order is delivered.</p>}
      {message && <p className="form-message" role="alert">{message}</p>}</div>
      <aside className="order-summary"><h2>Your selection</h2>{store.cart.map(l => { const p = products.find(p => p.id === l.id)!; return <div className="checkout-item" key={`${l.id}-${l.size}`}><div className="cart-thumb"><Photo src={p.image} alt={p.name} sizes="70px" /></div><div><h3>{p.name}</h3><p>{l.size} ml · Qty {l.quantity}</p></div><strong>{money(priceFor(p, l.size) * l.quantity)}</strong></div>; })}
        <div className="coupon-row"><label className="field">Gift or promo code<input value={couponInput} maxLength={20} onChange={e => setCouponInput(e.target.value.toUpperCase())} /></label><button type="button" className="text-link" onClick={() => setCoupon(couponInput.trim())} disabled={!couponInput.trim()}>Apply</button></div>
        {quote?.coupon && <p className={`coupon-message ${quote.coupon.applied ? 'ok' : ''}`} role="status">{quote.coupon.message}</p>}
        {quote?.problems.map(problem => <p key={problem} className="form-message" role="alert">{problem}</p>)}
        <div className="summary-row"><span>Subtotal</span><span>{money(quote?.subtotal ?? store.total)}</span></div>
        {!!quote?.discount && <div className="summary-row"><span>Discount ({quote.coupon?.code})</span><span>−{money(quote.discount)}</span></div>}
        <div className="summary-row"><span>Delivery</span><span>{(quote?.shipping ?? options.find(o => o.id === delivery)?.price) ? money(quote?.shipping ?? options.find(o => o.id === delivery)!.price) : 'Complimentary'}</span></div>
        {!!quote?.tax && <div className="summary-row"><span>{quote.taxIncluded ? `Includes GST (${quote.taxRate}%)` : `GST (${quote.taxRate}%)`}</span><span>{money(quote.tax)}</span></div>}
        <div className="summary-row total"><span>Total</span><strong>{money(total)}</strong></div>
        <button className="button" type="submit" disabled={processing || blocked || !choices.length}>{processing ? 'Saving…' : label}<ArrowRight size={17} /></button>
        <p className="checkout-note">{payment === 'test' ? 'No payment details required.' : payment === 'cod' ? 'No payment needed now.' : 'Secure payment by Razorpay.'}</p>
        <Link href="/cart" className="text-link centered">Edit your bag</Link></aside></form></section>;
}
function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <label className="field">{label}{props.required && <span className="required" aria-hidden="true"> *</span>}<input aria-label={label} {...props} /></label>; }

function Story() {
  return <><PageHero eyebrow="THE WORLD OF SENTBALE" title="A fragrance for every story." text="For the places, people, and moments that stay with us." /><section className="story-intro section"><Eyebrow>OUR PHILOSOPHY</Eyebrow><h2>We remember how<br />a moment <em>made us feel.</em></h2><p>A scent can take you somewhere. Into the warmth of an evening, the stillness of a garden, or a memory you thought you had forgotten. SENTBALE begins with that connection.</p><p>Our world is built around expressive fragrance families, natural textures, and the idea that a signature scent is something deeply personal. An invitation to discover. A small part of your story.</p></section><div className="story-split"><div className="story-visual"><Photo slot="story.detail" src="/images/aurora.png" alt="Aurora perfume with delicate magnolia petals" /></div><div className="story-copy"><Eyebrow>NATURE, REIMAGINED</Eyebrow><h2>From a feeling<br />to a <em>fragrance.</em></h2><p>The depth of oud. The quiet elegance of florals. The brightness of citrus. The grounding warmth of woods.</p><p>Each collection explores a different world. Find the one that speaks to you, and make it your own.</p><ButtonLink href="/collections">Explore the collections</ButtonLink></div></div><section className="story-quote section"><span>“</span><h2>Some things are felt<br />long after they are gone.</h2><Eyebrow>SCENTS THAT STAY</Eyebrow></section></>;
}
function JournalCards({ limit }: { limit?: number }) { const posts = useContent().posts.slice(0, limit); return <div className="journal-grid">{posts.map(a => <Link href={`/journal/${a.slug}`} key={a.slug} className="journal-card"><div className="journal-image"><Photo slot={`journal.${a.slug}`} src={a.image} alt={a.title} sizes="(max-width: 700px) 100vw, 33vw" /><span className="circle-arrow"><ArrowUpRight size={21} /></span></div><Eyebrow>{a.category}</Eyebrow><h3>{a.title}</h3><p>{a.excerpt}</p></Link>)}</div>; }
function Journal() { return <><PageHero eyebrow="THE SENTBALE JOURNAL" title="Stories in every scent." text="A closer look at the notes, rituals, and little discoveries that shape our world." /><section className="section"><JournalCards /></section></>; }
function Article({ slug }: { slug: string }) { const a = useContent().posts.find(a => a.slug === slug); if (!a) return <NotFound />; return <article className="article-page section"><Link className="text-link" href="/journal"><ArrowLeft size={17} /> Back to the journal</Link><Eyebrow>{a.category}</Eyebrow><h1>{a.title}</h1><p className="article-deck">{a.excerpt}</p><div className="article-hero"><Photo slot={`journal.${a.slug}`} src={a.image} alt={a.title} priority /></div><div className="article-body">{a.body.map(p => <p key={p}>{p}</p>)}<ButtonLink href="/shop">Discover the collection</ButtonLink></div></article>; }
function Contact() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy) return; const fields=new FormData(event.currentTarget); setBusy(true);setError('');
    try { const response=await fetch('/api/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'contact',...Object.fromEntries(fields)})});const data=await response.json();if(!response.ok)throw new Error(data.error);setSent(true); }
    catch(error) {setError(error instanceof Error?error.message:'Unable to save. Please try again.');} finally {setBusy(false);}
  }
  return <><PageHero eyebrow="LET’S START A CONVERSATION" title="We’d love to hear from you." text="A question, a thought, or a scent story. There’s always room for a conversation." /><section className="section contact-layout"><div><Eyebrow>A NOTE TO SENTBALE</Eyebrow><h2>Get in <em>touch.</em></h2><p className="muted">Every message reaches our team, and we usually reply within two business days.</p>{sent ? <div className="contact-success" role="status"><CheckCircle2 size={35} /><h3>Your note has been saved.</h3><p>No message was sent. We’ll connect the contact service before launch.</p><button className="text-link" onClick={() => setSent(false)}>Write another message <ArrowRight size={17} /></button></div> : <form onSubmit={send}><div className="form-grid"><Field label="Full name" name="name" required /><Field label="Email address" name="email" type="email" required /></div><label className="field">What’s on your mind?<select name="subject"><option>Help choosing a fragrance</option><option>Order enquiry</option><option>Gifting</option><option>Something else</option></select></label><label className="field">Your message<textarea name="message" rows={5} maxLength={4999} required placeholder="Tell us a little more…" /></label>{error && <p role="alert" className="form-message">{error}</p>}<button className="button" type="submit" disabled={busy}>{busy ? 'Saving�' : 'Save message locally'} <ArrowRight size={17} /></button></form>}</div><aside><div className="contact-photo"><Photo slot="contact.image" src="/images/legacy.png" alt="Legacy fragrance in warm light" /></div><h3>A little help with your discovery.</h3><p>Explore the collection and fragrance notes, or visit our journal for inspiration.</p><Link href="/journal" className="text-link">Explore the journal <ArrowUpRight size={17} /></Link><div className="contact-details"><Mail size={18} /><span>Support details will be added before launch.</span></div></aside></section></>;
}
function Policy({ path }: { path: string }) {
  const { preview, store } = useContent();
  const title = path === '/shipping' ? 'Shipping & delivery' : path === '/returns' ? 'Returns & care' : 'Your privacy';
  const contact = store.email ? <> at <a className="text-link" href={`mailto:${store.email}`}>{store.email}</a></> : null;
  return <section className="section policy-page"><Eyebrow>THE DETAILS MATTER</Eyebrow><h1>{title}</h1>{preview && <div className="demo-notice">The store is in test mode. These pages describe how it works; the brand’s final policies are confirmed before launch.</div>}
    {path === '/privacy' ? <><h2>What we keep</h2><p>When you create an account we store your name, email address and a securely hashed password, along with the addresses you save, your orders and any reviews you write. Your bag and favourites stay in this browser.</p><p>Contact messages and newsletter sign-ups are stored so our team can reply. Online payments are handled by Razorpay; we never see or store your card details.</p><p>To see, correct or delete your data, contact us{contact}.</p></>
      : path === '/shipping' ? <><h2>Delivery</h2><p>Delivery options, charges and estimated times for your address are shown at checkout before you pay. Free delivery thresholds and offers are applied automatically.</p><p>You can follow every order under My Account → My Orders.</p></>
      : <><h2>Returns</h2><p>If something is not right with your order, contact us{contact} with your order number and we will help.</p><p>Fragrances must be unopened to be returned unless they arrived damaged.</p></>}
    <Link href="/contact" className="text-link">Get in touch <ArrowRight size={17} /></Link></section>;
}

/** Standard terms of sale for an Indian online store; the seller's details come from Admin → Business Settings. */
function Terms() {
  const { store } = useContent();
  const name = store.name || 'SENTBALE';
  const reach = store.email ? <a className="text-link" href={`mailto:${store.email}`}>{store.email}</a> : <Link className="text-link" href="/contact">our contact page</Link>;
  return <section className="section policy-page"><Eyebrow>THE DETAILS MATTER</Eyebrow><h1>Terms &amp; conditions</h1>
    <p>Last updated 26 October 2026. These terms apply to every visit to this website and every order placed on it. By using the site or placing an order you agree to them, so please read them alongside our <Link className="text-link" href="/shipping">Shipping</Link>, <Link className="text-link" href="/returns">Returns</Link> and <Link className="text-link" href="/privacy">Privacy</Link> pages.</p>
    <h2>Who we are</h2><p>This website is operated by {name}{store.address ? <>, {store.address}</> : null}. You can reach us at {reach}{store.phone ? <> or on {store.phone}</> : null}.</p>
    <h2>Your account</h2><p>You must be 18 or older, or use the site with the involvement of a parent or guardian. Keep your password private; you are responsible for activity on your account. We may suspend accounts used for fraud, abuse or in breach of these terms.</p>
    <h2>Products and prices</h2><p>We describe and photograph our fragrances as accurately as we can, but colours, packaging and images on screen may vary slightly. Prices are in Indian rupees (₹). Whether GST is included, and any delivery charge, is shown at checkout before you pay. If a product is listed at an obviously wrong price, we may cancel the order and refund any amount paid in full.</p>
    <h2>Orders</h2><p>Your order is an offer to buy. The confirmation we show and email is an acknowledgement, and the contract is formed when we dispatch your order. We may decline or cancel an order, for example if an item is out of stock, the address cannot be served or the order appears fraudulent; you will then be refunded in full.</p>
    <h2>Payment</h2><p>Online payments are processed securely by Razorpay; we never see or store your card, UPI or bank details. Where cash on delivery is offered, please have the exact amount ready. We may withdraw cash on delivery for accounts with repeatedly refused deliveries.</p>
    <h2>Delivery</h2><p>Delivery options, charges and estimated times for your address are shown at checkout. Estimated times are not guaranteed. Responsibility for the order passes to you on delivery. See our <Link className="text-link" href="/shipping">Shipping</Link> page.</p>
    <h2>Cancellations, returns and refunds</h2><p>You can cancel an order free of charge before it is dispatched by contacting us at {reach} with your order number. Returns are accepted as described on our <Link className="text-link" href="/returns">Returns</Link> page; for hygiene reasons fragrances must be unopened unless they arrived damaged or incorrect. Approved refunds are made to the original payment method within 7 business days; your bank may take a few days more to show it. Cash on delivery orders are refunded by bank transfer or UPI.</p>
    <h2>Using our fragrances</h2><p>Our products are for external use only. Read the ingredients before use, do a patch test if you have sensitive skin, keep away from eyes, children and open flame, and stop use if irritation occurs.</p>
    <h2>Reviews and content</h2><p>Reviews you post must be honest and lawful. By posting one you allow us to show it on this site. We may decline or remove reviews that are abusive, misleading or unrelated to the product. All other content on this site, including text, images and the {name} name and logo, belongs to us and may not be copied without permission.</p>
    <h2>Our liability</h2><p>We are responsible for loss you suffer that is a foreseeable result of our breaking these terms. To the extent the law allows, our total liability for any order is limited to the amount you paid for it, and we are not liable for indirect losses. Nothing in these terms limits your rights under the Consumer Protection Act, 2019 or any other law.</p>
    <h2>Grievances</h2><p>If you have a complaint, contact our grievance officer at {reach}{store.phone ? <> or {store.phone}</> : null}. We acknowledge complaints within 48 hours and aim to resolve them within one month of receipt, as required by the Consumer Protection (E-Commerce) Rules, 2020.</p>
    <h2>Governing law and changes</h2><p>These terms are governed by the laws of India, and disputes are subject to the courts having jurisdiction where {name} is registered. We may update these terms from time to time; the version on this page when you place an order applies to that order.</p>
    <Link href="/contact" className="text-link">Get in touch <ArrowRight size={17} /></Link></section>;
}
function NotFound() { return <section className="section empty-state"><Eyebrow>A SMALL DETOUR</Eyebrow><h1>This story is still unwritten.</h1><p>We couldn’t find that page. Discover something else in the collection.</p><ButtonLink href="/shop">Explore fragrances</ButtonLink></section>; }

function ScentFinder({ close }: { close: () => void }) {
  const products = useProducts();
  const [step, setStep] = useState(0);
  const [family, setFamily] = useState('Oud');
  const [mood, setMood] = useState('');
  const match = products.find(p => p.family === family)!;
  return <div className="scent-finder">{step < 2 ? <><Eyebrow>YOUR DISCOVERY / 0{step + 1}</Eyebrow><h3>{step === 0 ? 'Where do your senses take you?' : 'What kind of moment is yours?'}</h3><div className="quiz-options">{(step === 0 ? ['Oud', 'Floral', 'Citrus', 'Woody'] : ['A slow, everyday ritual', 'An evening to remember', 'A gift with a little meaning']).map(option => <button key={option} onClick={() => { if (step === 0) setFamily(option); else setMood(option); setStep(step + 1); }}>{option}<ArrowUpRight size={20} /></button>)}</div>{step > 0 && <button className="text-link" onClick={() => setStep(0)}><ArrowLeft size={16} /> Back</button>}</> : <><div className="quiz-result-image"><Photo src={match.image} alt={match.name} /></div><Eyebrow>YOUR FIRST DISCOVERY</Eyebrow><h3>{match.name}</h3><p>You’re drawn to {family.toLowerCase()} notes. {match.mood} Explore this fragrance for {mood.toLowerCase()}.</p><Link className="button" href={`/product/${match.id}`} onClick={close}>Meet {match.name}<ArrowRight size={17} /></Link><button className="text-link" onClick={() => setStep(0)}>Start again</button></>}</div>;
}
function Footer({ notify }: { notify: (s: string) => void }) {
  const [busy,setBusy]=useState(false);
  async function subscribe(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;const form=event.currentTarget;const email=new FormData(form).get('email');setBusy(true);
    try{const response=await fetch('/api/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'newsletter',email})});const data=await response.json();if(!response.ok)throw new Error(data.error);notify('Thank you. You are on the list.');form.reset();}catch(error){notify(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}
  }
  return <footer className="footer"><div className="footer-top"><div><Eyebrow>LET THE STORY CONTINUE</Eyebrow><h2>A little scent.<br /><em>A little inspiration.</em></h2><p>Notes from our world, new discoveries, and things we love.</p></div><form className="newsletter" onSubmit={subscribe}><label htmlFor="newsletter-email">Your email address</label><div><input id="newsletter-email" name="email" type="email" placeholder="Enter your email" required /><button aria-label="Save newsletter interest" disabled={busy} type="submit"><ArrowRight size={24} strokeWidth={1} /></button></div><small>Occasional notes only. Unsubscribe any time.</small></form></div><div className="footer-main"><div className="footer-brand"><Link href="/" className="wordmark">SENTBALE</Link><p>Scents that stay.<br />Stories that are entirely yours.</p></div><div><h3>DISCOVER</h3><Link href="/shop">All fragrances</Link><Link href="/collections">The collections</Link><Link href="/our-story">Our story</Link><Link href="/journal">The journal</Link></div><div><h3>WE’RE HERE TO HELP</h3><Link href="/contact">Contact us</Link><Link href="/faq">Fragrance FAQ</Link><Link href="/shipping">Shipping & delivery</Link><Link href="/returns">Returns & care</Link><Link href="/terms">Terms & conditions</Link><Link href="/account">My account</Link></div><div className="footer-note"><Sparkles size={27} strokeWidth={1} /><p>A journey in every scent.</p><span>DESIGNED TO BE REMEMBERED.</span></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} SENTBALE. All rights reserved.</span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><span>INDIA · INR ₹</span></div></footer>;
}
