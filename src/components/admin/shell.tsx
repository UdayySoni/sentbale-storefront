'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Archive, Bell, Box, ChevronDown, ChevronRight, Clock, CreditCard, ExternalLink, FileText, House, LayoutGrid, LayoutTemplate, LogOut, Menu, Package, Search, Settings, ShieldCheck, ShoppingBag, Star, Tag, Truck, Users, type LucideIcon } from 'lucide-react';
import { nav } from '@/lib/admin/nav';
import { onStoreError, onStoreNotice, patchDb, setActor, useDb } from '@/lib/admin/store';
import { isLowStock } from '@/lib/admin/types';
import { Drawer, ToastProvider, usePopover, useToast } from './ui';

/**
 * Shows failed workspace saves as toasts (the store has already rolled the change back), and notices that
 * must not vanish, such as a new team member's invitation link, in a dialog with a copy button.
 */
function StoreMessages() {
  const toast = useToast();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => onStoreError(message => toast(message, true)), [toast]);
  useEffect(() => onStoreNotice(setNotice), []);
  const link = notice?.match(/https?:\/\/\S+/)?.[0];
  async function copy() {
    try { await navigator.clipboard.writeText(link || notice || ''); toast('Copied.'); } catch { toast('Select the link and copy it.', true); }
  }
  return <Drawer open={!!notice} title="Share this link" onClose={() => setNotice(null)} center>
    <p className="adm-muted">{notice?.replace(link || '', '').trim()}</p>
    {link && <input className="adm-copy-field" readOnly value={link} aria-label="Invitation link" onFocus={event => event.currentTarget.select()} />}
    <p className="adm-muted">The link works once, for 7 days. It has also been emailed if email is configured.</p>
    <div className="adm-form-actions"><button type="button" className="adm-btn ghost" onClick={() => setNotice(null)}>Close</button><button type="button" className="adm-btn" onClick={() => void copy()}>Copy link</button></div>
  </Drawer>;
}

const icons: Record<string, LucideIcon> = { dashboard: House, products: Package, collections: LayoutGrid, orders: ShoppingBag, customers: Users, inventory: Archive, coupons: Tag, reviews: Star, journal: FileText, homepage: LayoutTemplate, shipping: Truck, payments: CreditCard, settings: Settings, roles: ShieldCheck, audit: Clock };
const IDLE_LIMIT = 30 * 60 * 1000;
type AdminUser = { name: string; email: string; role: string };

async function signOut() {
  try { await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); } catch { /* The redirect below still leaves the panel. */ }
  window.location.assign('/admin/login');
}

export default function AdminShell({ admin, children }: { admin: AdminUser; children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const current = pathname + (search ? `?${search}` : '');
  const db = useDb();
  const activeKey = pathname === '/admin' ? 'dashboard' : pathname.startsWith('/admin/images') ? (expanded === 'homepage' ? 'homepage' : 'products') : pathname.split('/')[2];

  useEffect(() => { setActor(admin.name); }, [admin.name]);
  useEffect(() => { try { setCollapsed(localStorage.getItem('sentbale.admin.rail') === '1'); } catch { /* Default to the full sidebar. */ } }, []);
  useEffect(() => { setMobileOpen(false); }, [current]);

  // Leave the panel when the session ends elsewhere, and after a period without activity.
  useEffect(() => {
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    async function verify() {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - last > IDLE_LIMIT) return void signOut();
      try { const response = await fetch('/api/admin/session', { cache: 'no-store' }); if (response.ok && !(await response.json()).admin) window.location.assign('/admin/login'); } catch { /* Offline: try again on the next check. */ }
    }
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach(name => window.addEventListener(name, touch, { passive: true }));
    window.addEventListener('focus', verify);
    const timer = setInterval(verify, 60000);
    return () => { events.forEach(name => window.removeEventListener(name, touch)); window.removeEventListener('focus', verify); clearInterval(timer); };
  }, []);

  function toggleMenu() {
    if (window.matchMedia('(max-width: 900px)').matches) return setMobileOpen(open => !open);
    setCollapsed(value => { try { localStorage.setItem('sentbale.admin.rail', value ? '0' : '1'); } catch { /* Preference only. */ } return !value; });
  }

  return <ToastProvider>
    <StoreMessages />
    <div className={`adm ${collapsed ? 'rail' : ''} ${mobileOpen ? 'menu-open' : ''}`}>
      <aside className="adm-sidebar" aria-label="Admin">
        <Link href="/admin" className="adm-brand"><strong>SENTBALE</strong><span>Admin Panel</span></Link>
        <nav className="adm-nav" aria-label="Admin sections">
          {nav.filter(item => item.key === 'dashboard' || !db?.access || db.access[item.key] !== 'none').map(item => {
            const Icon = icons[item.key];
            const active = item.key === activeKey;
            const open = !!item.children && (expanded === item.key || (expanded === null && active));
            return <div key={item.key} className={`adm-nav-item ${active ? 'active' : ''}`}>
              <div className="adm-nav-row">
                <Link href={item.href} title={item.label} aria-current={active ? 'page' : undefined} onClick={() => setExpanded(item.children ? item.key : null)}><Icon size={20} strokeWidth={1.6} /><span>{item.label}</span></Link>
                {item.children && <button type="button" aria-label={`${open ? 'Collapse' : 'Expand'} ${item.label}`} aria-expanded={open} onClick={() => setExpanded(open ? '' : item.key)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>}
              </div>
              {open && <div className="adm-subnav">{item.children!.map(child => <Link key={child.href} href={child.href} className={child.href === current ? 'active' : ''} onClick={() => setExpanded(item.key)}>{child.label}</Link>)}</div>}
            </div>;
          })}
        </nav>
        <a className="adm-view-site" href="/" target="_blank" rel="noopener" title="View website"><Box size={18} strokeWidth={1.6} /><span>View Website</span><ExternalLink size={15} /></a>
      </aside>
      <button type="button" className="adm-backdrop" aria-label="Close menu" tabIndex={mobileOpen ? 0 : -1} onClick={() => setMobileOpen(false)} />
      <div className="adm-main">
        <header className="adm-header">
          <button type="button" className="adm-icon-btn" aria-label="Toggle navigation menu" onClick={toggleMenu}><Menu size={20} /></button>
          <GlobalSearch />
          <Notifications />
          <AccountMenu admin={admin} />
        </header>
        <main className="adm-content">{children}</main>
      </div>
    </div>
  </ToastProvider>;
}

function GlobalSearch() {
  const db = useDb();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen, ref] = usePopover<HTMLDivElement>();
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!db || term.length < 2) return [];
    const has = (...values: (string | number)[]) => values.some(value => String(value).toLowerCase().includes(term));
    return [
      ...db.products.filter(p => has(p.name, p.family)).slice(0, 4).map(p => ({ group: 'Products', label: p.name, detail: `${p.family} · Eau de Parfum`, href: `/admin/products?q=${encodeURIComponent(p.name)}` })),
      ...db.orders.filter(o => has(`#${o.number}`, o.customer, o.email)).sort((a, b) => b.number - a.number).slice(0, 4).map(o => ({ group: 'Orders', label: `#${o.number} · ${o.customer}`, detail: `${o.item} · ${o.status}`, href: `/admin/orders?q=${o.number}` })),
      ...db.customers.filter(c => has(c.name, c.email, c.phone)).slice(0, 4).map(c => ({ group: 'Customers', label: c.name, detail: c.email, href: `/admin/customers?q=${encodeURIComponent(c.email)}` })),
      ...nav.filter(item => has(item.label)).slice(0, 3).map(item => ({ group: 'Go to', label: item.label, detail: 'Admin section', href: item.href })),
    ];
  }, [db, query]);
  function go(href: string) { setOpen(false); setQuery(''); router.push(href); }
  return <div className="adm-search" ref={ref}>
    <form role="search" onSubmit={event => { event.preventDefault(); if (results[0]) go(results[0].href); }}>
      <Search size={18} />
      <input type="search" aria-label="Search products, orders, customers" placeholder="Search products, orders, customers…" value={query} maxLength={80} onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
    </form>
    {open && query.trim().length >= 2 && <div className="adm-pop adm-search-results">
      {results.length ? results.map((result, i) => <button type="button" key={result.href + i} onClick={() => go(result.href)}>
        {(i === 0 || results[i - 1].group !== result.group) && <small>{result.group}</small>}<b>{result.label}</b><span>{result.detail}</span>
      </button>) : <p className="adm-pop-empty">No matches for “{query.trim()}”.</p>}
    </div>}
  </div>;
}

function Notifications() {
  const db = useDb();
  const [open, setOpen, ref] = usePopover<HTMLDivElement>();
  const items = useMemo(() => {
    if (!db) return [];
    const low = db.skus.filter(isLowStock).length, processing = db.orders.filter(o => o.status === 'Processing').length, pending = db.reviews.filter(r => r.status === 'Pending').length;
    return [
      processing && { title: `${processing} order${processing === 1 ? '' : 's'} waiting to ship`, detail: 'Review and dispatch processing orders.', href: '/admin/orders?status=Processing' },
      low && { title: `${low} product${low === 1 ? '' : 's'} low on stock`, detail: 'Restock before they sell out.', href: '/admin/inventory?level=Low+stock' },
      pending && { title: `${pending} review${pending === 1 ? '' : 's'} awaiting approval`, detail: 'Publish or hide new customer reviews.', href: '/admin/reviews?status=Pending' },
    ].filter(Boolean) as { title: string; detail: string; href: string }[];
  }, [db]);
  const signature = items.map(item => item.title).join('|');
  const unread = db && signature !== db.seen ? items.length : 0;
  return <div className="adm-menu" ref={ref}>
    <button type="button" className="adm-icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}><Bell size={20} />{unread > 0 && <i>{unread}</i>}</button>
    {open && <div className="adm-pop adm-notifications">
      <header><b>Notifications</b>{unread > 0 && <button type="button" onClick={() => patchDb({ seen: signature })}>Mark all as read</button>}</header>
      {items.length ? items.map(item => <Link key={item.href} href={item.href} onClick={() => setOpen(false)}><b>{item.title}</b><span>{item.detail}</span></Link>) : <p className="adm-pop-empty">You’re all caught up.</p>}
    </div>}
  </div>;
}

function AccountMenu({ admin }: { admin: AdminUser }) {
  const [open, setOpen, ref] = usePopover<HTMLDivElement>();
  return <div className="adm-menu" ref={ref}>
    <button type="button" className="adm-account" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen(!open)}><span className="adm-avatar">{admin.name[0]?.toUpperCase() || 'A'}</span><b>{admin.name.split(' ')[0]}</b><ChevronDown size={15} /></button>
    {open && <div className="adm-pop adm-account-pop">
      <header><b>{admin.name}</b><span>{admin.email}</span><span>{admin.role}</span></header>
      <Link href="/admin/settings?tab=security" onClick={() => setOpen(false)}><ShieldCheck size={16} /> Account &amp; security</Link>
      <Link href="/admin/audit" onClick={() => setOpen(false)}><Clock size={16} /> Audit logs</Link>
      <button type="button" onClick={signOut}><LogOut size={16} /> Sign out</button>
    </div>}
  </div>;
}
