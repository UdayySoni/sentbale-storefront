import { test, expect } from '@playwright/test';
import { signInAdmin } from './admin-session';
const headers = { Origin: 'http://127.0.0.1:3000' };

test('admin creates a product with its own sizes, prices and stock, and the store sells exactly those', async ({ page, request, browser }) => {
  await signInAdmin(page.request, request);
  const name = `Test Mist ${crypto.randomUUID().slice(0, 6)}`;
  await page.goto('/admin/products');
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add product' }).click();
  await page.getByLabel('Product name', { exact: true }).fill(name);
  await page.getByLabel('Fragrance family').fill('Aquatic');
  await page.getByLabel('Status').selectOption('Active');
  await page.getByLabel('Size in ml').first().fill('30');
  await page.getByLabel('Price in rupees').first().fill('1500');
  await page.getByLabel('Stock').first().fill('5');
  await page.getByLabel('Low-stock alert level').first().fill('1');
  await page.getByRole('button', { name: 'Add size' }).click();
  await page.getByLabel('Size in ml').nth(1).fill('75');
  await page.getByLabel('Price in rupees').nth(1).fill('2900');
  await page.getByLabel('Tagline').fill('Sea air.');
  await page.getByLabel('Description').fill('A test fragrance.');
  await page.getByLabel('Top notes').fill('Sea salt, Bergamot');
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('30 · 75 ml');

  const catalog = await (await request.get('/api/catalog')).json();
  const product = catalog.products.find((p: { name: string }) => p.name === name);
  try {
    expect(product.prices).toEqual({ 30: 1500, 75: 2900 });
    expect(product.price).toBe(1500);
    const shopper = await browser.newPage();
    try {
      await shopper.goto(`http://127.0.0.1:3000/product/${product.id}`);
      await expect(shopper.locator('.size-selector button')).toHaveText(['30 ml', '75 ml']);
      await shopper.getByRole('button', { name: '75 ml', exact: true }).click();
      await expect(shopper.locator('.detail-price')).toContainText('2,900');
      await shopper.goto('http://127.0.0.1:3000/collections/aquatic');
      await expect(shopper.locator('.product-card h3')).toContainText([name]);
    } finally { await shopper.close(); }
    const quote = await request.post('/api/checkout/quote', { headers, data: { items: [{ id: product.id, size: 30, quantity: 6 }], delivery: 'standard' } });
    expect((await quote.json()).problems).toContain(`Only 5 of ${name} 30 ml left.`);
  } finally {
    await page.getByRole('button', { name: `Delete ${name}` }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
  }
});

test('product editor validates sizes and fits mobile', async ({ request, page }) => {
  await signInAdmin(page.request, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/products');
  await page.getByRole('button', { name: 'Edit Legacy' }).click();
  await page.getByRole('button', { name: 'Add size' }).click();
  await page.getByLabel('Size in ml').last().fill('50');
  await page.getByLabel('Price in rupees').last().fill('100');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toHaveText('Each size can be listed only once.');
  await page.getByLabel('Size in ml').last().fill('0');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('whole number of ml');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Cancel' }).click();
});
