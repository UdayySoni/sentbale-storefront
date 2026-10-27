'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Box, FileText, IndianRupee, LayoutGrid, Package, ShoppingBag, Tag, Users, type LucideIcon } from 'lucide-react';
import { useMediaImage } from '@/components/media-provider';
import { money } from '@/lib/catalog';
import { useDb } from '@/lib/admin/store';
import { isLowStock, type Db, type Order } from '@/lib/admin/types';
import { Badge, formatDate, Loading } from './ui';

const DAY = 86400000;
const counted = (order: Order) => order.status !== 'Cancelled' && order.status !== 'Refunded';
const compact = (value: number) => value >= 100000 ? `${+(value / 100000).toFixed(1)}L` : value >= 1000 ? `${+(value / 1000).toFixed(1)}K` : String(value);
const periods = { year: 'This Year', months: 'Last 12 Months', month: 'Last 30 Days', week: 'Last 7 Days' } as const;
type Period = keyof typeof periods;

/** Change between the last 30 days and the 30 before, plus eight weekly totals for the sparkline. */
function trend(times: number[], weights: number[], now: number) {
  let recent = 0, previous = 0;
  const weeks = Array<number>(8).fill(0);
  times.forEach((time, i) => {
    const age = (now - time) / DAY;
    if (age < 30) recent += weights[i]; else if (age < 60) previous += weights[i];
    if (age >= 0 && age < 56) weeks[7 - Math.floor(age / 7)] += weights[i];
  });
  return { change: previous ? Math.round(((recent - previous) / previous) * 100) : null, weeks };
}

function salesSeries(orders: Order[], period: Period, now: number) {
  const today = new Date(now);
  const buckets: { label: string; full: string; from: number; to: number }[] = [];
  if (period === 'year' || period === 'months') {
    for (let i = 0; i < 12; i++) {
      const start = period === 'year' ? new Date(today.getFullYear(), i, 1) : new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
      buckets.push({ label: start.toLocaleDateString('en-GB', { month: 'short' }), full: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), from: start.getTime(), to: new Date(start.getFullYear(), start.getMonth() + 1, 1).getTime() });
    }
  } else {
    const days = period === 'month' ? 30 : 7;
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const label = period === 'week' ? start.toLocaleDateString('en-GB', { weekday: 'short' }) : (days - 1 - i) % 5 === 0 ? start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
      buckets.push({ label, full: start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), from: start.getTime(), to: start.getTime() + DAY });
    }
  }
  return buckets.map(bucket => {
    const inside = orders.filter(o => { const time = new Date(o.date).getTime(); return counted(o) && time >= bucket.from && time < bucket.to; });
    return { ...bucket, value: inside.reduce((sum, o) => sum + o.amount, 0), orders: inside.length };
  });
}
function niceMax(max: number) {
  if (max <= 0) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const size = [1, 2, 2.5, 5, 10].map(m => m * step).find(s => s * 4 >= max)!;
  return size * 4;
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const points = values.map((value, i) => `${(i / (values.length - 1)) * 96 + 2},${30 - (value / max) * 26}`).join(' ');
  return <svg className="adm-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg>;
}
function Stat({ icon: Icon, label, value, change, weeks, note, href }: { icon: LucideIcon; label: string; value: string; change?: number | null; weeks?: number[]; note?: string; href: string }) {
  return <Link href={href} className="adm-card adm-stat">
    <span className="adm-stat-icon"><Icon size={22} strokeWidth={1.5} /></span>
    <div><p>{label}</p><strong>{value}</strong>
      {change !== undefined && change !== null ? <span className={change < 0 ? 'down' : 'up'}>{change < 0 ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />}{change > 0 ? '+' : ''}{change}%</span> : null}
      <small>{note || (change === null ? 'No activity yet' : 'vs prior 30 days')}</small>
    </div>
    {weeks && <Sparkline values={weeks} />}
  </Link>;
}

function SalesChart({ db, now }: { db: Db; now: number }) {
  const [period, setPeriod] = useState<Period>('year');
  const [table, setTable] = useState(false);
  const series = useMemo(() => salesSeries(db.orders, period, now), [db.orders, period, now]);
  const top = niceMax(Math.max(...series.map(point => point.value)));
  const total = series.reduce((sum, point) => sum + point.value, 0);
  return <section className="adm-card adm-sales">
    <header className="adm-card-head"><div><h2>Sales Overview</h2><p>{money(total)} from {series.reduce((sum, point) => sum + point.orders, 0)} orders</p></div>
      <div className="adm-card-tools"><button type="button" className="adm-link" aria-pressed={table} onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show table'}</button>
        <select aria-label="Sales period" value={period} onChange={event => setPeriod(event.target.value as Period)}>{Object.entries(periods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    </header>
    {table ? <div className="adm-table-wrap adm-chart-table"><table className="adm-table"><thead><tr><th>Period</th><th className="right">Orders</th><th className="right">Sales</th></tr></thead><tbody>{series.map(point => <tr key={point.from}><td>{point.full}</td><td className="right">{point.orders}</td><td className="right">{money(point.value)}</td></tr>)}</tbody></table></div>
      : <div className="adm-chart" role="group" aria-label={`Sales by ${period === 'year' || period === 'months' ? 'month' : 'day'}, ${periods[period]}`}>
        <div className="adm-chart-y" aria-hidden="true">{[4, 3, 2, 1, 0].map(step => <span key={step}>{compact((top / 4) * step)}</span>)}</div>
        <div className="adm-chart-plot">
          <div className="adm-chart-grid" aria-hidden="true">{[0, 1, 2, 3, 4].map(line => <i key={line} />)}</div>
          <div className={`adm-bars ${series.length > 12 ? 'dense' : ''}`}>{series.map((point, i) => <button type="button" key={point.from} className={`adm-bar-slot ${i > series.length * 0.6 ? 'end' : ''}`} aria-label={`${point.full}: ${money(point.value)} from ${point.orders} orders`}>
            <span className="adm-bar" style={{ height: `${(point.value / top) * 100}%` }} />
            <span className="adm-tip" aria-hidden="true"><b>{money(point.value)}</b>{point.full} · {point.orders} order{point.orders === 1 ? '' : 's'}</span>
          </button>)}</div>
          <div className={`adm-chart-x ${series.length > 12 ? 'dense' : ''}`} aria-hidden="true">{series.map(point => <span key={point.from}>{point.label}</span>)}</div>
        </div>
      </div>}
  </section>;
}

const quickActions: [string, string, LucideIcon][] = [
  ['Add Product', '/admin/products?new=1', Box], ['New Collection', '/admin/collections?new=1', LayoutGrid], ['Create Coupon', '/admin/coupons?new=1', Tag],
  ['Manage Orders', '/admin/orders', ShoppingBag], ['Manage Customers', '/admin/customers', Users], ['Write Journal', '/admin/journal?new=1', FileText],
];

export default function Dashboard({ name }: { name: string }) {
  const db = useDb();
  const hero = useMediaImage('hero.desktop', '/images/hero.png', '');
  // One clock reading per data change keeps every widget on the same "now".
  const now = useMemo(() => Date.now(), [db]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => {
    if (!db) return null;
    const sales = db.orders.filter(counted);
    const orderTimes = db.orders.map(o => new Date(o.date).getTime());
    const images = new Map(db.products.map(p => [p.id, p.image]));
    const sold = new Map<string, number>();
    for (const order of sales) sold.set(order.skuId, (sold.get(order.skuId) || 0) + order.qty);
    return {
      orders: trend(orderTimes, orderTimes.map(() => 1), now),
      customers: trend(db.customers.map(c => new Date(c.joined).getTime()), db.customers.map(() => 1), now),
      revenue: trend(sales.map(o => new Date(o.date).getTime()), sales.map(o => o.amount), now),
      revenueTotal: sales.reduce((sum, o) => sum + o.amount, 0),
      recent: [...db.orders].sort((a, b) => b.number - a.number).slice(0, 5),
      // One row per fragrance: units across all sizes, shown with its best-selling size.
      top: [...db.skus.reduce((byProduct, sku) => {
        const units = sold.get(sku.id) || 0, row = byProduct.get(sku.productId);
        if (!row) byProduct.set(sku.productId, { sku, best: units, sold: units, image: images.get(sku.productId) });
        else { row.sold += units; if (units > row.best) { row.best = units; row.sku = sku; } }
        return byProduct;
      }, new Map<string, { sku: Db['skus'][number]; best: number; sold: number; image?: string }>()).values()].filter(row => row.sold).sort((a, b) => b.sold - a.sold).slice(0, 5),
      low: db.skus.filter(isLowStock).sort((a, b) => a.stock - b.stock).slice(0, 5).map(sku => ({ sku, image: images.get(sku.productId) })),
    };
  }, [db, now]);
  if (!db || !stats) return <Loading />;

  return <div className="adm-dashboard">
    <section className="adm-hero">
      <Image src={hero.src} alt="" fill priority sizes="(max-width: 900px) 100vw, 85vw" unoptimized={hero.src.startsWith('/api/')} style={{ objectPosition: hero.position }} />
      <div><p>WELCOME BACK{name ? `, ${name.split(' ')[0].toUpperCase()}` : ''}</p><h1>SENTBALE Admin</h1><span>Manage your fragrances, customers, orders and grow your brand.</span></div>
    </section>

    <div className="adm-stats">
      <Stat icon={ShoppingBag} label="Total Orders" value={db.orders.length.toLocaleString('en-IN')} change={stats.orders.change} weeks={stats.orders.weeks} href="/admin/orders" />
      <Stat icon={Users} label="Total Customers" value={db.customers.length.toLocaleString('en-IN')} change={stats.customers.change} weeks={stats.customers.weeks} href="/admin/customers" />
      <Stat icon={IndianRupee} label="Total Revenue" value={money(stats.revenueTotal)} change={stats.revenue.change} weeks={stats.revenue.weeks} href="/admin/payments" />
      <Stat icon={Package} label="Total Products" value={String(db.skus.length)} note={`sizes across ${db.products.length} fragrance${db.products.length === 1 ? '' : 's'}`} href="/admin/inventory" />
    </div>

    <div className="adm-row two">
      <SalesChart db={db} now={now} />
      <section className="adm-card">
        <header className="adm-card-head"><h2>Recent Orders</h2><Link className="adm-link" href="/admin/orders">View All <ArrowRight size={15} /></Link></header>
        <div className="adm-table-wrap"><table className="adm-table compact"><thead><tr><th>#</th><th>Customer</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>{!stats.recent.length && <tr><td colSpan={5} className="adm-empty">No orders yet.</td></tr>}{stats.recent.map(order => <tr key={order.id}><td><Link href={`/admin/orders?q=${order.number}`}>#{order.number}</Link></td><td>{order.customer}</td><td>{money(order.amount)}</td><td><Badge>{order.status}</Badge></td><td>{formatDate(order.date)}</td></tr>)}</tbody></table></div>
      </section>
    </div>

    <div className="adm-row three">
      <section className="adm-card">
        <header className="adm-card-head"><h2>Top Selling Products</h2><Link className="adm-link" href="/admin/products">View All <ArrowRight size={15} /></Link></header>
        {!stats.top.length && <p className="adm-empty">Best sellers appear once orders come in.</p>}
        <ul className="adm-list">{stats.top.map(({ sku, sold, image }) => <li key={sku.id}><Thumb src={image} /><div><b>{sku.product}</b><small>Eau de Parfum · {sku.size}ml</small></div><span>{sold} sold</span><strong>{money(sku.price)}</strong></li>)}</ul>
      </section>
      <section className="adm-card">
        <header className="adm-card-head"><h2>Low Stock Products</h2><Link className="adm-link" href="/admin/inventory?level=Low+stock">View All <ArrowRight size={15} /></Link></header>
        {stats.low.length ? <ul className="adm-list">{stats.low.map(({ sku, image }) => <li key={sku.id}><Thumb src={image} /><div><b>{sku.product}</b><small>Eau de Parfum · {sku.size}ml</small></div><em className={sku.stock ? '' : 'out'}>{sku.stock ? `${sku.stock} left` : 'Sold out'}</em></li>)}</ul> : <p className="adm-empty">Nothing is running low.</p>}
      </section>
      <section className="adm-card">
        <header className="adm-card-head"><h2>Quick Actions</h2></header>
        <div className="adm-quick">{quickActions.map(([label, href, Icon]) => <Link key={label} href={href}><Icon size={24} strokeWidth={1.5} />{label}</Link>)}</div>
      </section>
    </div>
  </div>;
}

export function Thumb({ src }: { src?: string }) {
  return <span className="adm-thumb">{src && <Image src={src} alt="" fill sizes="56px" unoptimized={src.startsWith('/api/')} />}</span>;
}
