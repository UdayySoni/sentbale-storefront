import { test, expect } from '@playwright/test';
import { signInAdmin } from './admin-session';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

test('admin uploads, saves and shares a product image across browser sessions', async ({ page, browser, request }) => {
  await signInAdmin(page.request, request);
  const original = await (await request.get('/api/media')).json();
  let uploaded = '';
  try {
    await page.goto('/admin/images');
    await expect(page.getByRole('heading', { name: 'Image studio.' })).toBeVisible();
    await expect(page.locator('.admin-slot-list button')).toHaveCount(18);
    await page.locator('.admin-slot-list button').filter({ hasText: 'Legacy' }).click();
    await page.getByLabel('Upload images').setInputFiles('public/images/citrus.png');
    await expect(page.locator('.admin-message[role=status]')).toContainText('Image uploaded');
    uploaded = await page.locator('.admin-image-preview>img').getAttribute('src') || '';
    expect(uploaded).toMatch(/^\/api\/media\/files\/[a-f0-9-]+\.png$/);
    await page.getByLabel('Image description').fill('Legacy image edited in the local studio');
    await page.getByRole('slider', { name: 'Horizontal crop' }).focus();
    await page.getByRole('slider', { name: 'Horizontal crop' }).press('End');
    await page.getByRole('button', { name: 'Save changes (1)', exact: true }).click();
    await expect(page.locator('.admin-message[role=status]')).toContainText('Images saved');
    await page.reload();
    await page.locator('.admin-slot-list button').filter({ hasText: 'Legacy' }).click();
    await expect(page.getByLabel('Image description')).toHaveValue('Legacy image edited in the local studio');
    const fresh = await browser.newPage();
    await fresh.goto('http://127.0.0.1:3000/product/legacy');
    await expect(fresh.locator('.detail-photo img')).toHaveAttribute('src', uploaded);
    await expect(fresh.locator('.detail-photo img')).toHaveAttribute('alt', 'Legacy image edited in the local studio');
    await expect(fresh.locator('.detail-photo img')).toHaveCSS('object-position', '100% 50%');
    const imageResponse = await request.get(uploaded);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()['content-type']).toBe('image/png');
    await fresh.close();
    const stale = await request.put('/api/media', { headers: { Origin: 'http://127.0.0.1:3000' }, data: { revision: original.revision, images: {} } });
    expect(stale.status()).toBe(409);
  } finally {
    const current = await (await request.get('/api/media')).json();
    const restored = await request.put('/api/media', { headers: { Origin: 'http://127.0.0.1:3000' }, data: { revision: current.revision, images: original.images } });
    expect(restored.status()).toBe(200);
    if (uploaded) await unlink(path.join(process.env.MEDIA_DIR || path.join(process.cwd(), 'data', 'media'), path.basename(uploaded)));
  }
});

test('local admin rejects cross-site writes and unsupported uploads', async ({ request }) => {
  await signInAdmin(request);
  const denied = await request.put('/api/media', { headers: { Origin: 'https://example.com' }, data: { revision: '0', images: {} } });
  expect(denied.status()).toBe(403);
  const invalid = await request.post('/api/media/upload', { headers: { Origin: 'http://127.0.0.1:3000' }, multipart: { file: { name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') } } });
  expect(invalid.status()).toBe(415);
});

test('image studio works on mobile and desktop', async ({ page }) => {
  await signInAdmin(page.request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin/images');
  await expect(page.locator('.admin-slot-list button')).toHaveCount(18);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '.preview/admin-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.preview/admin-mobile.png', fullPage: true });
});
