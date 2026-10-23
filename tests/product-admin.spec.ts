import { test, expect } from '@playwright/test';
import { signInAdmin } from './admin-session';
const headers = { Origin: 'http://127.0.0.1:3000' };

test('admin saves product details and prices across reload, bag, and server orders', async ({ page, request, browser }) => {
  await signInAdmin(page.request, request);
  const original = await (await request.get('/api/catalog')).json();
  try {
    await page.goto('/admin/products');
    await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Legacy' }).click();
    await page.getByLabel('Product name', { exact: true }).fill('Legacy Reserve');
    await page.getByLabel('Price for 50 ml').fill('5299');
    await page.getByRole('button', { name: 'Save changes' }).last().click();
    await expect(page.getByRole('status')).toContainText('Product catalogue saved');
    await page.reload();
    await page.getByRole('button', { name: 'Edit Legacy Reserve' }).click();
    await expect(page.getByLabel('Product name', { exact: true })).toHaveValue('Legacy Reserve');
    await expect(page.getByLabel('Price for 50 ml')).toHaveValue('5299');
    const fresh = await browser.newPage();
    try {
      await fresh.goto('http://127.0.0.1:3000/product/legacy');
      await expect(fresh.getByRole('heading', { name: 'Legacy Reserve', exact: true })).toBeVisible();
      await expect(fresh.locator('.detail-price')).toContainText('5,299');
      await fresh.getByRole('button', { name: 'Add to bag', exact: true }).click();
      await expect(fresh.locator('.cart-line-price')).toContainText('5,299');
      const signup = await fresh.request.post('/api/account', { headers, data: { action: 'register', name: 'Admin Test', email: `catalog-${crypto.randomUUID()}@example.com`, password: 'Sample-password-123' } });
      expect(signup.ok()).toBeTruthy();
      const response = await fresh.request.post('/api/orders', { headers, data: { requestId: crypto.randomUUID(), items: [{ id: 'legacy', size: 100, quantity: 2 }], total: 1, name: 'Admin Test', delivery: 'standard', address: { line: 'Test Street', city: 'Delhi', state: 'Delhi', pincode: '110016' } } });
      expect(response.ok()).toBeTruthy();
      const { order } = await response.json();
      expect(order.total).toBe(14598);
      expect(order.snapshot[0].name).toBe('Legacy Reserve');
    } finally { await fresh.close(); }
    const stale = await request.put('/api/catalog', { headers, data: original });
    expect(stale.status()).toBe(409);
    await page.getByRole('link', { name: 'Change image' }).click();
    await expect(page.locator('.admin-slot-list button.selected')).toContainText('Legacy');
  } finally {
    const current = await (await request.get('/api/catalog')).json();
    expect((await request.put('/api/catalog', { headers, data: { ...original, revision: current.revision } })).status()).toBe(200);
  }
});

test('product editor validates writes, supports discard and fits mobile', async ({ request, page }) => {
  await signInAdmin(page.request, request);
  const original = await (await request.get('/api/catalog')).json();
  expect((await request.put('/api/catalog', { headers: { Origin: 'https://example.com' }, data: original })).status()).toBe(403);
  for (const price of [-1, 1.5, '500', 1000001]) {
    const products = original.products.map((p: { id: string }) => p.id === 'legacy' ? { ...p, price } : p);
    expect((await request.put('/api/catalog', { headers, data: { ...original, products } })).status()).toBe(400);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/products');
  await page.getByRole('button', { name: 'Edit Legacy' }).click();
  await expect(page.getByLabel('Product name', { exact: true })).toBeVisible();
  await page.getByLabel('Product name', { exact: true }).fill('Unsaved name');
  await page.getByRole('button', { name: 'Discard product changes' }).click();
  await expect(page.getByLabel('Product name', { exact: true })).toHaveValue(original.products[0].name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.preview/products-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.preview/products-desktop.png', fullPage: true });
});
