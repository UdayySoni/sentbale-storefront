export type NavItem = { key: string; label: string; href: string; children?: { label: string; href: string }[] };

export const nav: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin' },
  { key: 'products', label: 'Products', href: '/admin/products', children: [
    { label: 'All products', href: '/admin/products' },
    { label: 'Add product', href: '/admin/products?new=1' },
    { label: 'Image studio', href: '/admin/images' },
  ] },
  { key: 'collections', label: 'Collections', href: '/admin/collections' },
  { key: 'orders', label: 'Orders', href: '/admin/orders', children: [
    { label: 'All orders', href: '/admin/orders' },
    { label: 'Awaiting payment', href: '/admin/orders?status=Pending%20payment' },
    { label: 'Processing', href: '/admin/orders?status=Processing' },
    { label: 'Shipped', href: '/admin/orders?status=Shipped' },
    { label: 'Cancelled', href: '/admin/orders?status=Cancelled' },
  ] },
  { key: 'customers', label: 'Customers', href: '/admin/customers', children: [
    { label: 'All customers', href: '/admin/customers' },
    { label: 'VIP', href: '/admin/customers?tag=VIP' },
    { label: 'New', href: '/admin/customers?tag=New' },
    { label: 'Messages', href: '/admin/customers?tab=messages' },
  ] },
  { key: 'inventory', label: 'Inventory', href: '/admin/inventory', children: [
    { label: 'Stock levels', href: '/admin/inventory' },
    { label: 'Low stock', href: '/admin/inventory?level=Low+stock' },
    { label: 'Out of stock', href: '/admin/inventory?level=Out+of+stock' },
  ] },
  { key: 'coupons', label: 'Coupons', href: '/admin/coupons' },
  { key: 'reviews', label: 'Reviews', href: '/admin/reviews' },
  { key: 'journal', label: 'Journal', href: '/admin/journal', children: [
    { label: 'All posts', href: '/admin/journal' },
    { label: 'Write a post', href: '/admin/journal?new=1' },
    { label: 'Drafts', href: '/admin/journal?status=Draft' },
  ] },
  { key: 'homepage', label: 'Homepage Content', href: '/admin/homepage', children: [
    { label: 'Hero & announcement', href: '/admin/homepage' },
    { label: 'Homepage images', href: '/admin/images' },
  ] },
  { key: 'shipping', label: 'Shipping', href: '/admin/shipping', children: [
    { label: 'Zones & rates', href: '/admin/shipping' },
    { label: 'Delivery partners', href: '/admin/shipping?tab=partners' },
  ] },
  { key: 'payments', label: 'Payments', href: '/admin/payments', children: [
    { label: 'Transactions', href: '/admin/payments' },
    { label: 'Payment methods', href: '/admin/payments?tab=methods' },
  ] },
  { key: 'settings', label: 'Business Settings', href: '/admin/settings', children: [
    { label: 'Store profile', href: '/admin/settings' },
    { label: 'Tax & notifications', href: '/admin/settings?tab=preferences' },
    { label: 'Account & security', href: '/admin/settings?tab=security' },
  ] },
  { key: 'roles', label: 'Roles & Permissions', href: '/admin/roles', children: [
    { label: 'Team members', href: '/admin/roles' },
    { label: 'Roles', href: '/admin/roles?tab=roles' },
  ] },
  { key: 'audit', label: 'Audit Logs', href: '/admin/audit' },
];

export const sectionTitles: Record<string, string> = Object.fromEntries(nav.filter(item => item.key !== 'dashboard').map(item => [item.key, item.label]));
/** Sections a role can be granted access to. */
export const permissionSections = nav.map(item => ({ key: item.key, label: item.label }));
