import { test, expect } from '@playwright/test';
import { signInAdmin } from './admin-session';
const headers = { Origin: 'http://127.0.0.1:3000' };

test('admin pages and write routes require a signed-in admin', async ({ page, request }) => {
  await page.goto('/admin/orders');
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Forders$/);
  expect((await request.put('/api/catalog', { headers, data: {} })).status()).toBe(401);
  expect((await request.put('/api/media', { headers, data: {} })).status()).toBe(401);
  expect((await request.post('/api/admin/session', { headers: { Origin: 'https://example.com' }, data: { action: 'login' } })).status()).toBe(403);
  expect((await request.post('/api/admin/session', { headers, data: { action: 'login', email: 'nobody@example.com', password: 'not-the-password-1' } })).status()).toBe(401);
});

test('dashboard, quick actions and section tables work', async ({ page }) => {
  await signInAdmin(page.request);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sales Overview' })).toBeVisible();
  await expect(page.locator('.adm-stat')).toHaveCount(4);
  await expect(page.locator('.adm-bar-slot')).toHaveCount(12);
  await page.getByLabel('Sales period').selectOption('week');
  await expect(page.locator('.adm-bar-slot')).toHaveCount(7);
  await page.getByRole('link', { name: 'Create Coupon' }).click();
  await page.getByLabel('Coupon code').fill('playwright5');
  await page.getByRole('button', { name: 'Create coupon' }).click();
  await expect(page.getByRole('status')).toContainText('Coupon created');
  await page.getByRole('button', { name: 'Delete PLAYWRIGHT5' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('PLAYWRIGHT5')).toHaveCount(0);
  for (const section of ['products', 'collections', 'orders', 'customers', 'inventory', 'reviews', 'journal', 'homepage', 'shipping', 'payments', 'settings', 'roles', 'audit']) {
    await page.goto(`/admin/${section}`);
    await expect(page.locator('.adm-page-head h1')).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Quick Actions' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
