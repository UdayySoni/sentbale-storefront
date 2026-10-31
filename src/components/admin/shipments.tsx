'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, FileText, RefreshCw, Search, Send, Truck } from 'lucide-react';
import { money } from '@/lib/catalog';
import { refreshDb, useDb } from '@/lib/admin/store';
import type { Order } from '@/lib/admin/types';
import { Badge, Confirm, Drawer, formatDate, formatDateTime, Loading, PageHeader, useToast } from './ui';

type Account = { enabled: boolean; connected: boolean; webhook: boolean; pickup?: { name: string; pincode: string }; wallet?: number; error?: string };
type Stage = 'send' | 'book' | 'moving' | 'delivered' | 'problem';
const STAGES: { key: Stage; label: string }[] = [
  { key: 'send', label: 'To send' }, { key: 'book', label: 'To book courier' }, { key: 'moving', label: 'On the way' }, { key: 'delivered', label: 'Delivered' }, { key: 'problem', label: 'Need attention' },
];
const stageOf = (o: Order): Stage => {
  if (o.status === 'Delivered') return 'delivered';
  if (o.ship?.error && !o.ship.ref) return 'problem';
  if (!o.ship?.ref) return 'send';
  return o.ship.awb ? 'moving' : 'book';
};
/** Orders that ship: everything but test orders, unpaid checkouts and orders closed before reaching Shiprocket. */
const ships = (o: Order) => o.payment !== 'Test payment' && !!o.address && o.status !== 'Pending payment' && (!!o.ship?.ref || (o.status !== 'Cancelled' && o.status !== 'Refunded'));
const shiprocketLink = (ref: string) => `https://app.shiprocket.in/seller/orders/details/${encodeURIComponent(ref)}`;
const cash = (o: Order) => /cash/i.test(o.payment);

export default function Shipments() {
  const db = useDb();
  const toast = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [stage, setStage] = useState<Stage | ''>('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [booking, setBooking] = useState<Order | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => { void (async () => { try { const response = await fetch('/api/admin/shipments', { cache: 'no-store' }); if (response.ok) setAccount(await response.json()); } catch { /* The account strip simply stays empty. */ } })(); }, []);
  if (!db) return <Loading />;

  const all = db.orders.filter(ships);
  const term = query.trim().toLowerCase();
  const rows = all.filter(o => (!stage || stageOf(o) === stage) && (!term || `${o.number} ${o.customer} ${o.email} ${o.phone} ${o.address} ${o.ship?.awb}`.toLowerCase().includes(term)));
  const detail = all.find(o => o.id === open);

  async function act(action: 'send' | 'book' | 'label', order: Order) {
    setBusy(`${action}-${order.id}`);
    try {
      const response = await fetch('/api/admin/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, orderId: order.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (action === 'label') window.open(data.url, '_blank', 'noopener');
      else {
        await refreshDb();
        toast(action === 'send' ? `Order #${order.number} sent. Check its status below.` : `${data.courier} booked, AWB ${data.awb}.${data.scheduled ? ' Pickup requested.' : ' Request the pickup from Shiprocket.'}`);
      }
    } catch (e) { toast(e instanceof Error && e.message ? e.message : 'Shiprocket could not be reached.', true); }
    finally { setBusy(''); }
  }
  async function refresh() {
    setBusy('refresh');
    try {
      const ids = all.filter(o => o.ship?.ref && o.status !== 'Delivered' && o.status !== 'Cancelled' && o.status !== 'Refunded').map(o => o.id);
      const response = await fetch('/api/admin/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh', orderIds: ids }) });
      if (!response.ok) throw new Error((await response.json()).error);
      await refreshDb();
      toast('Tracking updated from Shiprocket.');
    } catch (e) { toast(e instanceof Error && e.message ? e.message : 'Shiprocket could not be reached.', true); }
    finally { setBusy(''); }
  }
  const actions = (o: Order) => <>
    {o.canShip && <button type="button" className="adm-chip" disabled={!!busy} onClick={() => act('send', o)}><Send size={12} /> {busy === `send-${o.id}` ? 'Sending…' : 'Send'}</button>}
    {stageOf(o) === 'book' && o.status === 'Processing' && <button type="button" className="adm-chip" disabled={!!busy} onClick={() => setBooking(o)}><Truck size={12} /> {busy === `book-${o.id}` ? 'Booking…' : 'Book courier'}</button>}
    {o.ship?.awb && <button type="button" className="adm-chip" disabled={!!busy} onClick={() => act('label', o)}><FileText size={12} /> {busy === `label-${o.id}` ? 'Opening…' : 'Label'}</button>}
    <button type="button" className="adm-chip" onClick={() => setOpen(o.id)}>Details</button>
  </>;

  return <>
    <PageHeader title="Shiprocket" description="Every shipment and who it is going to, linked to your Shiprocket account.">
      <button type="button" className="adm-btn ghost" disabled={!!busy} onClick={refresh}><RefreshCw size={16} /> {busy === 'refresh' ? 'Updating…' : 'Update tracking'}</button>
      <a className="adm-btn ghost" href="https://app.shiprocket.in/" target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open Shiprocket</a>
    </PageHeader>
    <section className="adm-card adm-ship-account" aria-label="Shiprocket account">
      {!account ? <span>Checking your Shiprocket account…</span> : <>
        <span><i className={`adm-ship-dot ${account.connected ? 'on' : ''}`} /><b>{account.connected ? 'Connected' : account.enabled ? 'Not connected' : 'Not set up'}</b>{account.error ? ` · ${account.error}` : ''}</span>
        {account.pickup && <span>Pickup: <b>{account.pickup.name}</b>, {account.pickup.pincode}</span>}
        {account.wallet !== undefined && <span>Wallet: <b>{money(account.wallet)}</b></span>}
        <span>Live tracking: <b>{account.webhook ? 'On' : 'Off'}</b></span>
      </>}
    </section>
    <div className="adm-stats adm-ship-stats">{STAGES.map(s => <button type="button" key={s.key} className={`adm-card ${stage === s.key ? 'active' : ''}`} aria-pressed={stage === s.key} onClick={() => setStage(stage === s.key ? '' : s.key)}><strong>{all.filter(o => stageOf(o) === s.key).length}</strong><span>{s.label}</span></button>)}</div>
    <section className="adm-card adm-resource">
      <div className="adm-toolbar">
        <label className="adm-inline-search"><Search size={16} /><input type="search" aria-label="Search shipments" placeholder="Name, phone, order or AWB…" value={query} maxLength={80} onChange={event => setQuery(event.target.value)} /></label>
        <span className="adm-count">{rows.length} {rows.length === 1 ? 'shipment' : 'shipments'}</span>
      </div>
      <div className="adm-table-wrap"><table className="adm-table adm-ship-table">
        <thead><tr><th>Order</th><th>Customer</th><th>Deliver to</th><th>Items</th><th className="right">Amount</th><th>Courier</th><th className="right">Actions</th></tr></thead>
        <tbody>{rows.map(o => <tr key={o.id}>
          <td><b>#{o.number}</b><br /><small>{formatDate(o.date)}</small></td>
          <td><span className="adm-cell-main"><b>{o.customer}</b>{o.phone && <small><a href={`tel:${o.phone}`}>{o.phone}</a></small>}{o.email && <small><a href={`mailto:${o.email}`}>{o.email}</a></small>}</span></td>
          <td><span className="adm-cell-main"><small>{o.address}</small></span></td>
          <td><span className="adm-cell-main"><small>{o.items?.join(', ')}</small>{o.gift && <small>🎁 Gift</small>}</span></td>
          <td className="right">{money(o.amount)}<br /><small>{cash(o) ? 'Cash on delivery' : 'Prepaid'}</small></td>
          <td>{o.ship?.error && !o.ship.ref ? <span className="adm-ship-error">{o.ship.error}</span> : <span className="adm-cell-main">{o.ship?.status ? <Badge>{o.ship.status}</Badge> : <Badge>Not sent</Badge>}{o.ship?.awb ? <small>{o.ship.courier} · <a href={o.ship.trackingUrl} target="_blank" rel="noopener noreferrer">{o.ship.awb}</a></small> : o.ship?.choice && <small>{o.ship.choice}</small>}</span>}</td>
          <td className="right"><div className="adm-row-actions">{actions(o)}</div></td>
        </tr>)}</tbody>
      </table></div>
      {!rows.length && <p className="adm-empty">{all.length ? 'No shipments match.' : 'Paid and cash-on-delivery orders appear here.'}</p>}
    </section>

    <Drawer open={!!detail} eyebrow={detail ? `ORDER #${detail.number}` : ''} title={detail?.customer || ''} onClose={() => setOpen(null)}>
      {detail && <div className="adm-ship-detail">
        <div><h3>Customer</h3><p>{detail.customer}<br />{detail.phone && <><a href={`tel:${detail.phone}`}>{detail.phone}</a><br /></>}{detail.email && <a href={`mailto:${detail.email}`}>{detail.email}</a>}</p></div>
        <div><h3>Deliver to</h3><p>{detail.address}</p></div>
        <div><h3>Items</h3><ul>{detail.items?.map(item => <li key={item}>{item}</li>)}</ul>{detail.gift && <p>🎁 {detail.gift}</p>}</div>
        <div><h3>Payment</h3><p>{money(detail.amount)} · {detail.payment} · {detail.paid}{detail.coupon ? ` · ${detail.coupon}` : ''}</p></div>
        <div><h3>Shiprocket</h3>
          <p>Status: {detail.ship?.status || 'Not sent'}{detail.ship?.syncedAt ? ` (checked ${formatDateTime(detail.ship.syncedAt)})` : ''}</p>
          {detail.ship?.choice && <p>Customer chose: {detail.ship.choice}</p>}
          {detail.ship?.awb && <p>{detail.ship.courier} · AWB <a href={detail.ship.trackingUrl} target="_blank" rel="noopener noreferrer">{detail.ship.awb}</a></p>}
          {detail.ship?.error && <p className="adm-ship-error">{detail.ship.error}</p>}
          {detail.ship?.ref && <p><a href={shiprocketLink(detail.ship.ref)} target="_blank" rel="noopener noreferrer">Open this order on Shiprocket</a> (#{detail.ship.ref})</p>}
        </div>
        <div className="adm-row-actions">{actions(detail)}</div>
      </div>}
    </Drawer>
    <Confirm open={!!booking} title="Book a courier?" body={booking ? `${booking.ship?.choice || 'Shiprocket will pick the courier'} for order #${booking.number}. Shiprocket charges your wallet for this and schedules a pickup.` : ''} action="Book courier"
      onCancel={() => setBooking(null)} onConfirm={() => { if (booking) void act('book', booking); setBooking(null); }} />
  </>;
}
