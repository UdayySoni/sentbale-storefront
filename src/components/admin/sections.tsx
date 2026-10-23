'use client';
import { useSearchParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { permissionSections } from '@/lib/admin/nav';
import { patchDb, useDb } from '@/lib/admin/store';
import { stockLevel, type Access, type Db, type Order, type Row } from '@/lib/admin/types';
import Products from './products';
import ResourcePage, { type Resource } from './resource';
import { HomepageContent, BusinessSettings } from './settings';
import { Loading, PageHeader, Tabs, useToast } from './ui';

const today = () => new Date().toISOString();
const level = (row: Row) => stockLevel(row as never);
const skuLabel = (sku: { product: string; size: number }) => `${sku.product} · ${sku.size}ml`;
const ordersOf = (db: Db, email: string) => db.orders.filter(order => order.email === email);
const earned = (order: Order) => order.status !== 'Cancelled' && order.status !== 'Refunded';
const stars = (row: Row) => <span className="adm-stars" aria-label={`${row.rating} out of 5`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} size={13} className={n <= row.rating ? 'on' : ''} />)}</span>;
const strong = (key: string, sub?: string) => (row: Row) => <span className="adm-cell-main"><b>{row[key]}</b>{sub && <small>{row[sub]}</small>}</span>;

const resources: Record<string, Resource> = {
  collections: {
    list: 'collections', title: 'Collections', noun: 'collection', description: 'Group fragrances into the worlds customers browse.', name: row => row.name, sort: ['position', 'asc'],
    cols: [{ key: 'name', label: 'Collection', render: strong('name', 'description') }, { key: 'position', label: 'Order', right: true }, { key: 'featured', label: 'Featured', kind: 'bool' }, { key: 'status', label: 'Status', kind: 'badge' }],
    filter: { key: 'status', label: 'Status', options: ['Visible', 'Hidden'] },
    fields: [{ name: 'name', label: 'Collection name', required: true, maxLength: 60 }, { name: 'description', label: 'Description', type: 'textarea', maxLength: 300 }, { name: 'position', label: 'Display order', type: 'number', min: 1, max: 99, half: true }, { name: 'status', label: 'Status', type: 'select', options: ['Visible', 'Hidden'], half: true }, { name: 'featured', label: 'Feature on the homepage', type: 'toggle' }],
    blank: db => ({ position: db.collections.length + 1, status: 'Visible', featured: false }),
    actions: row => [{ label: row.status === 'Visible' ? 'Hide' : 'Show', patch: { status: row.status === 'Visible' ? 'Hidden' : 'Visible' } }],
  },
  orders: {
    list: 'orders', title: 'Orders', noun: 'order', description: 'Track every order from payment to doorstep.', name: row => `#${row.number}`, sort: ['number', 'desc'], remove: false,
    note: 'Storefront orders appear here as they are placed. Orders you add are saved as real orders and take stock. Orders are never deleted: cancel or refund them, and their stock returns to Inventory.',
    cols: [{ key: 'number', label: 'Order', get: row => row.number, render: row => <b>#{row.number}</b> }, { key: 'customer', label: 'Customer', render: strong('customer', 'email') }, { key: 'item', label: 'Item', get: row => `${row.item} × ${row.qty}` }, { key: 'amount', label: 'Amount', kind: 'money', right: true }, { key: 'payment', label: 'Payment' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'date', label: 'Date', kind: 'date' }],
    filter: { key: 'status', label: 'Status', options: ['Pending payment', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'] },
    fields: [{ name: 'customer', label: 'Customer name', required: true, maxLength: 100 }, { name: 'email', label: 'Customer email', type: 'email', required: true }, { name: 'item', label: 'Item', type: 'select', options: db => db.skus.map(skuLabel) }, { name: 'qty', label: 'Quantity', type: 'number', min: 1, max: 10, half: true }, { name: 'payment', label: 'Payment method', type: 'select', options: db => db.methods.length ? db.methods.map(method => method.name) : ['UPI', 'Card', 'Net Banking', 'COD'], half: true }, { name: 'status', label: 'Order status', type: 'select', options: ['Pending payment', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'], half: true }, { name: 'paid', label: 'Payment status', type: 'select', options: ['Paid', 'Pending', 'Failed', 'Refunded'], half: true }],
    blank: db => ({ number: Math.max(1000, ...db.orders.map(order => order.number)) + 1, item: db.skus[0] ? skuLabel(db.skus[0]) : '', qty: 1, payment: db.methods[0]?.name || 'UPI', status: 'Processing', paid: 'Paid', date: today() }),
    // Placed orders keep their items (the server only changes status, payment and contact details).
    clean: (row, db) => { const placed = db.orders.find(order => order.id === row.id); if (placed) return { ...row, item: placed.item, skuId: placed.skuId, qty: placed.qty, amount: placed.amount, email: String(row.email).toLowerCase() }; const sku = db.skus.find(s => skuLabel(s) === row.item); if (!sku) return 'Choose an item from the list.'; return { ...row, skuId: sku.id, amount: sku.price * row.qty, email: String(row.email).toLowerCase() }; },
    actions: row => row.status === 'Processing' ? [{ label: 'Mark shipped', patch: { status: 'Shipped' } }] : row.status === 'Shipped' ? [{ label: 'Mark delivered', patch: { status: 'Delivered', paid: 'Paid' } }] : [],
  },
  customers: {
    list: 'customers', title: 'Customers', noun: 'customer', description: 'The people behind every order.', name: row => row.name, sort: ['spent', 'desc'],
    cols: [{ key: 'name', label: 'Customer', render: row => <b>{row.name}</b> }, { key: 'email', label: 'Email' }, { key: 'city', label: 'City' }, { key: 'orders', label: 'Orders', right: true, get: (row, db) => ordersOf(db, row.email).length }, { key: 'spent', label: 'Spent', right: true, kind: 'money', get: (row, db) => ordersOf(db, row.email).filter(earned).reduce((sum, order) => sum + order.amount, 0) }, { key: 'tag', label: 'Segment', kind: 'badge' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'joined', label: 'Joined', kind: 'date' }],
    filter: { key: 'tag', label: 'Segment', options: ['VIP', 'Regular', 'New'] },
    fields: [{ name: 'name', label: 'Full name', required: true, maxLength: 100 }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'phone', label: 'Phone', maxLength: 20, half: true }, { name: 'city', label: 'City', maxLength: 60, half: true }, { name: 'tag', label: 'Segment', type: 'select', options: ['VIP', 'Regular', 'New'], half: true }, { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Blocked'], half: true }],
    blank: () => ({ tag: 'New', status: 'Active', joined: today() }),
    clean: (row, db) => { const email = String(row.email).toLowerCase(); return db.customers.some(c => c.email === email && c.id !== row.id) ? 'Another customer already uses this email.' : { ...row, email }; },
    actions: row => [{ label: row.status === 'Active' ? 'Block' : 'Unblock', patch: { status: row.status === 'Active' ? 'Blocked' : 'Active' } }],
  },
  inventory: {
    list: 'skus', title: 'Inventory', noun: 'stock item', description: 'Stock for every size of every fragrance.', name: row => skuLabel(row as never), sort: ['stock', 'asc'], create: false, remove: false,
    note: 'Sizes are created with their product. Enter stock and an alert level to start tracking a size.',
    cols: [{ key: 'product', label: 'Product', render: row => <span className="adm-cell-main"><b>{row.product}</b><small>Eau de Parfum · {row.size}ml</small></span> }, { key: 'sku', label: 'SKU' }, { key: 'price', label: 'Price', kind: 'money', right: true }, { key: 'stock', label: 'In stock', right: true }, { key: 'threshold', label: 'Alert at', right: true }, { key: 'level', label: 'Level', kind: 'badge', get: level }],
    filter: { key: 'level', label: 'Level', options: ['In stock', 'Low stock', 'Out of stock', 'Not tracked'], get: level },
    fields: [{ name: 'stock', label: 'Units in stock', type: 'number', min: 0, max: 100000, half: true }, { name: 'threshold', label: 'Low stock alert at', type: 'number', min: 0, max: 1000, half: true, hint: '0 means stock is not tracked.' }, { name: 'price', label: 'Price (₹)', type: 'number', min: 1, max: 1000000 }, { name: 'sku', label: 'SKU code', required: true, maxLength: 30 }],
    clean: row => Number.isInteger(row.stock) && Number.isInteger(row.threshold) && Number.isInteger(row.price) ? row : 'Stock, alert level and price must be whole numbers.',
    actions: row => [{ label: 'Restock +25', patch: { stock: row.stock + 25 } }],
  },
  coupons: {
    list: 'coupons', title: 'Coupons', noun: 'coupon', description: 'Offers and codes for launches, festivals and loyal customers.', name: row => row.code, sort: ['used', 'desc'],
    cols: [{ key: 'code', label: 'Code', render: row => <code className="adm-code">{row.code}</code> }, { key: 'offer', label: 'Offer', get: row => row.type === 'Percent' ? `${row.value}% off` : row.type === 'Flat' ? `₹${row.value} off` : 'Free shipping' }, { key: 'minOrder', label: 'Min. order', kind: 'money', right: true }, { key: 'used', label: 'Used', right: true, get: row => row.used, render: row => `${row.used}${row.limit ? ` / ${row.limit}` : ''}` }, { key: 'expires', label: 'Expires', kind: 'date' }, { key: 'status', label: 'Status', kind: 'badge' }],
    filter: { key: 'status', label: 'Status', options: ['Active', 'Paused', 'Expired'] },
    fields: [{ name: 'code', label: 'Coupon code', required: true, maxLength: 20, hint: 'Letters and numbers only, 3–20 characters.' }, { name: 'type', label: 'Offer type', type: 'select', options: ['Percent', 'Flat', 'Free shipping'], half: true }, { name: 'value', label: 'Value (% or ₹)', type: 'number', min: 0, max: 100000, half: true }, { name: 'minOrder', label: 'Minimum order (₹)', type: 'number', min: 0, max: 1000000, half: true }, { name: 'limit', label: 'Usage limit', type: 'number', min: 0, max: 1000000, half: true, hint: '0 means unlimited.' }, { name: 'expires', label: 'Expires on', type: 'date', required: true, half: true }, { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Paused', 'Expired'], half: true }],
    blank: () => ({ type: 'Percent', value: 10, minOrder: 0, limit: 0, used: 0, status: 'Active', expires: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }),
    clean: (row, db) => {
      const code = String(row.code).toUpperCase();
      if (!/^[A-Z0-9]{3,20}$/.test(code)) return 'Use 3–20 letters and numbers for the code.';
      if (db.coupons.some(c => c.code === code && c.id !== row.id)) return 'This code already exists.';
      if (row.type === 'Percent' && (row.value < 1 || row.value > 90)) return 'A percentage offer must be between 1 and 90.';
      if (row.type === 'Flat' && row.value < 1) return 'Enter the rupee amount for this offer.';
      return { ...row, code, value: row.type === 'Free shipping' ? 0 : row.value };
    },
    actions: row => row.status === 'Expired' ? [] : [{ label: row.status === 'Active' ? 'Pause' : 'Activate', patch: { status: row.status === 'Active' ? 'Paused' : 'Active' } }],
  },
  reviews: {
    list: 'reviews', title: 'Reviews', noun: 'review', description: 'Approve, publish and respond to what customers say.', name: row => `${row.product} review by ${row.customer}`, sort: ['date', 'desc'],
    cols: [{ key: 'product', label: 'Product', render: strong('product', 'customer') }, { key: 'rating', label: 'Rating', get: row => row.rating, render: stars }, { key: 'title', label: 'Review', render: strong('title', 'body') }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'date', label: 'Date', kind: 'date' }],
    filter: { key: 'status', label: 'Status', options: ['Pending', 'Published', 'Hidden'] },
    fields: [{ name: 'product', label: 'Product', type: 'select', options: db => [...new Set(db.skus.map(sku => sku.product))] }, { name: 'customer', label: 'Customer name', required: true, maxLength: 100, half: true }, { name: 'rating', label: 'Rating (1–5)', type: 'number', min: 1, max: 5, step: 1, half: true }, { name: 'title', label: 'Headline', required: true, maxLength: 120 }, { name: 'body', label: 'Review', type: 'textarea', maxLength: 1500 }, { name: 'status', label: 'Status', type: 'select', options: ['Pending', 'Published', 'Hidden'] }],
    blank: db => ({ product: db.skus[0]?.product, rating: 5, status: 'Pending', date: today() }),
    clean: row => Number.isInteger(row.rating) ? row : 'Rating must be a whole number from 1 to 5.',
    actions: row => row.status === 'Published' ? [{ label: 'Hide', patch: { status: 'Hidden' } }] : [{ label: 'Publish', patch: { status: 'Published' } }],
  },
  journal: {
    list: 'posts', title: 'Journal', noun: 'post', description: 'Stories, guides and ingredient notes for the brand journal.', name: row => row.title, sort: ['date', 'desc'],
    cols: [{ key: 'title', label: 'Post', render: strong('title', 'excerpt') }, { key: 'category', label: 'Category' }, { key: 'author', label: 'Author' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'date', label: 'Updated', kind: 'date' }],
    filter: { key: 'status', label: 'Status', options: ['Published', 'Draft'] },
    fields: [{ name: 'title', label: 'Title', required: true, maxLength: 120 }, { name: 'category', label: 'Category', type: 'select', options: ['INGREDIENT STORIES', 'THE FRAGRANCE GUIDE', 'LIFE, SCENTED', 'BRAND NEWS'], half: true }, { name: 'status', label: 'Status', type: 'select', options: ['Draft', 'Published'], half: true }, { name: 'excerpt', label: 'Summary', type: 'textarea', maxLength: 240, required: true }, { name: 'body', label: 'Article', type: 'textarea', maxLength: 20000, required: true, hint: 'Leave a blank line between paragraphs.' }, { name: 'author', label: 'Author', maxLength: 80 }],
    blank: () => ({ category: 'THE FRAGRANCE GUIDE', status: 'Draft', author: 'SENTBALE Studio', date: today() }),
    clean: row => ({ ...row, date: today() }),
    actions: row => [{ label: row.status === 'Published' ? 'Unpublish' : 'Publish', patch: { status: row.status === 'Published' ? 'Draft' : 'Published', date: today() } }],
    note: 'Published posts appear in the storefront journal straight away, newest first; drafts stay hidden.',
  },
  zones: {
    list: 'zones', title: 'Shipping', noun: 'shipping zone', description: 'Where you deliver, how fast, and what it costs.', name: row => row.name,
    cols: [{ key: 'name', label: 'Zone', render: strong('name', 'regions') }, { key: 'standard', label: 'Standard', kind: 'money', right: true }, { key: 'express', label: 'Express', kind: 'money', right: true }, { key: 'freeAbove', label: 'Free above', right: true, get: row => row.freeAbove, render: row => row.freeAbove ? `₹${row.freeAbove.toLocaleString('en-IN')}` : '—' }, { key: 'eta', label: 'Delivery time' }, { key: 'status', label: 'Status', kind: 'badge' }],
    fields: [{ name: 'name', label: 'Zone name', required: true, maxLength: 60 }, { name: 'regions', label: 'Regions covered', type: 'textarea', required: true, maxLength: 500 }, { name: 'standard', label: 'Standard rate (₹)', type: 'number', min: 0, max: 100000, half: true }, { name: 'express', label: 'Express rate (₹)', type: 'number', min: 0, max: 100000, half: true }, { name: 'freeAbove', label: 'Free shipping above (₹)', type: 'number', min: 0, max: 1000000, half: true, hint: '0 turns this off.' }, { name: 'eta', label: 'Delivery time', required: true, maxLength: 40, half: true }, { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Paused'] }],
    blank: () => ({ standard: 99, express: 249, freeAbove: 0, eta: '4–6 days', status: 'Active' }),
    actions: row => [{ label: row.status === 'Active' ? 'Pause' : 'Activate', patch: { status: row.status === 'Active' ? 'Paused' : 'Active' } }],
  },
  partners: {
    list: 'partners', title: 'Shipping', noun: 'delivery partner', description: 'Where you deliver, how fast, and what it costs.', name: row => row.name,
    cols: [{ key: 'name', label: 'Partner', render: strong('name', 'service') }, { key: 'cod', label: 'Cash on delivery', kind: 'bool' }, { key: 'tracking', label: 'Tracking page' }, { key: 'status', label: 'Status', kind: 'badge' }],
    fields: [{ name: 'name', label: 'Partner name', required: true, maxLength: 60 }, { name: 'service', label: 'Service', maxLength: 80 }, { name: 'tracking', label: 'Tracking page', type: 'url', maxLength: 200, hint: 'Must start with https://' }, { name: 'cod', label: 'Supports cash on delivery', type: 'toggle' }, { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Paused'] }],
    blank: () => ({ cod: false, status: 'Active' }),
    actions: row => [{ label: row.status === 'Active' ? 'Pause' : 'Activate', patch: { status: row.status === 'Active' ? 'Paused' : 'Active' } }],
  },
  transactions: {
    list: 'orders', title: 'Payments', noun: 'payment', description: 'Money in, money out, and how customers can pay.', name: row => `payment for #${row.number}`, sort: ['date', 'desc'], create: false, remove: false,
    note: 'Marking an order Refunded returns its stock to Inventory. Send the money back from your Razorpay dashboard; refunds are not issued from here.',
    cols: [{ key: 'number', label: 'Order', get: row => row.number, render: row => <b>#{row.number}</b> }, { key: 'customer', label: 'Customer' }, { key: 'payment', label: 'Method' }, { key: 'amount', label: 'Amount', kind: 'money', right: true }, { key: 'paid', label: 'Payment', kind: 'badge' }, { key: 'date', label: 'Date', kind: 'datetime' }],
    filter: { key: 'paid', label: 'Payment', options: ['Paid', 'Pending', 'Refunded'] },
    fields: [{ name: 'paid', label: 'Payment status', type: 'select', options: ['Paid', 'Pending', 'Failed', 'Refunded'] }],
    actions: row => row.paid === 'Paid' ? [{ label: 'Refund', patch: { paid: 'Refunded', status: 'Refunded' } }] : row.paid === 'Pending' ? [{ label: 'Mark paid', patch: { paid: 'Paid' } }] : [],
  },
  methods: {
    list: 'methods', title: 'Payments', noun: 'payment method', description: 'Money in, money out, and how customers can pay.', name: row => row.name,
    cols: [{ key: 'name', label: 'Method' }, { key: 'provider', label: 'Provider' }, { key: 'fee', label: 'Gateway fee', right: true, get: row => row.fee, render: row => `${row.fee}%` }, { key: 'status', label: 'Status', kind: 'badge' }],
    blank: () => ({ fee: 0, status: 'Enabled' }),
    fields: [{ name: 'name', label: 'Method name', required: true, maxLength: 40, hint: 'For example UPI, Card or COD.' }, { name: 'provider', label: 'Provider', required: true, maxLength: 60 }, { name: 'fee', label: 'Gateway fee (%)', type: 'number', min: 0, max: 20, step: 0.1 }, { name: 'status', label: 'Status', type: 'select', options: ['Enabled', 'Disabled'] }],
    actions: row => [{ label: row.status === 'Enabled' ? 'Disable' : 'Enable', patch: { status: row.status === 'Enabled' ? 'Disabled' : 'Enabled' } }],
  },
  team: {
    list: 'team', title: 'Roles & Permissions', noun: 'team member', description: 'Who can sign in, and what each role may do.', name: row => row.name,
    cols: [{ key: 'name', label: 'Member', render: strong('name', 'email') }, { key: 'role', label: 'Role' }, { key: 'status', label: 'Status', kind: 'badge' }, { key: 'lastActive', label: 'Last active', kind: 'datetime' }],
    filter: { key: 'status', label: 'Status', options: ['Active', 'Invited', 'Suspended'] },
    fields: [{ name: 'name', label: 'Full name', required: true, maxLength: 100 }, { name: 'email', label: 'Work email', type: 'email', required: true }, { name: 'role', label: 'Role', type: 'select', options: db => db.roles.map(role => role.name), half: true }, { name: 'status', label: 'Status', type: 'select', options: ['Invited', 'Active', 'Suspended'], half: true }],
    blank: db => ({ role: db.roles[1]?.name || db.roles[0].name, status: 'Invited', lastActive: '' }),
    clean: (row, db) => { const email = String(row.email).toLowerCase(); return db.team.some(member => member.email === email && member.id !== row.id) ? 'This email is already on the team.' : { ...row, email }; },
    note: 'Adding a member creates their sign-in and gives you a one-time invitation link to send them (also emailed when email is set up). They choose their own password.',
    actions: row => row.status === 'Invited' ? [{ label: 'New invite link', patch: { reinvite: true } }] : row.status === 'Suspended' ? [{ label: 'Reinstate', patch: { status: 'Active' } }] : [{ label: 'Suspend', patch: { status: 'Suspended' } }],
  },
  messages: {
    list: 'enquiries', title: 'Customers', noun: 'message', description: 'The people behind every order.', name: row => `message from ${row.email}`, sort: ['date', 'desc'], create: false,
    note: 'Contact form messages and newsletter sign-ups from the storefront. Mark a message handled once you have replied.',
    cols: [{ key: 'date', label: 'Received', kind: 'datetime' }, { key: 'kind', label: 'Type', get: row => row.kind === 'newsletter' ? 'Newsletter' : 'Contact' }, { key: 'name', label: 'From', render: strong('name', 'email') }, { key: 'subject', label: 'Message', render: strong('subject', 'message') }, { key: 'handled', label: 'Handled', kind: 'bool' }],
    filter: { key: 'kind', label: 'Type', options: ['contact', 'newsletter'] },
    fields: [{ name: 'handled', label: 'Handled', type: 'toggle' }],
    actions: row => row.kind === 'contact' ? [{ label: row.handled ? 'Reopen' : 'Mark handled', patch: { handled: !row.handled } }] : [],
  },
  audit: {
    list: 'audit', title: 'Audit Logs', noun: 'entry', description: 'A record of every change made in this admin panel.', name: row => row.action, sort: ['at', 'desc'], create: false, edit: false, remove: false, fields: [],
    cols: [{ key: 'at', label: 'When', kind: 'datetime' }, { key: 'actor', label: 'Who' }, { key: 'action', label: 'Action' }, { key: 'target', label: 'Item' }],
  },
};

function RoleMatrix() {
  const db = useDb();
  const toast = useToast();
  if (!db) return <Loading />;
  function set(roleId: string, section: string, access: Access) {
    const role = db!.roles.find(r => r.id === roleId)!;
    patchDb({ roles: db!.roles.map(r => r.id === roleId ? { ...r, access: { ...r.access, [section]: access } } : r) }, 'Updated role', `${role.name}: ${section} → ${access}`);
    toast(`${role.name} permissions updated.`);
  }
  return <section className="adm-card adm-resource">
    <div className="adm-table-wrap"><table className="adm-table adm-matrix">
      <thead><tr><th>Section</th>{db.roles.map(role => <th key={role.id} title={role.description}>{role.name}</th>)}</tr></thead>
      <tbody>{permissionSections.map(section => <tr key={section.key}><td><b>{section.label}</b></td>
        {db.roles.map(role => <td key={role.id}><select aria-label={`${role.name} access to ${section.label}`} value={role.access[section.key] || 'none'} disabled={role.id === 'owner'} onChange={event => set(role.id, section.key, event.target.value as Access)}><option value="none">No access</option><option value="view">View</option><option value="manage">Manage</option></select></td>)}
      </tr>)}</tbody>
    </table></div>
  </section>;
}

const tabbed: Record<string, { key: string; label: string }[]> = {
  shipping: [{ key: 'zones', label: 'Zones & rates' }, { key: 'partners', label: 'Delivery partners' }],
  customers: [{ key: 'customers', label: 'Customers' }, { key: 'messages', label: 'Messages' }],
  payments: [{ key: 'transactions', label: 'Transactions' }, { key: 'methods', label: 'Payment methods' }],
  roles: [{ key: 'team', label: 'Team members' }, { key: 'roles', label: 'Roles' }],
};

export default function Section({ section }: { section: string }) {
  const params = useSearchParams();
  if (section === 'products') return <Products />;
  if (section === 'homepage') return <HomepageContent />;
  if (section === 'settings') return <BusinessSettings />;
  const tabs = tabbed[section];
  const tab = tabs?.find(t => t.key === params.get('tab'))?.key || tabs?.[0].key;
  const bar = tabs && <Tabs base={`/admin/${section}`} current={tab!} tabs={tabs} />;
  if (section === 'roles' && tab === 'roles') return <><PageHeader title="Roles & Permissions" description="Who can sign in, and what each role may do." />{bar}<p className="adm-note">Choose what each role can see and change. The Owner role always has full access.</p><RoleMatrix /></>;
  const config = resources[tab || section];
  return <ResourcePage key={tab || section} config={config} tabs={bar} />;
}
