import { test, expect } from '@playwright/test';

test('catalogue, variants, bag persistence, payment outcomes and local orders', async ({ page }) => {
  const registered = await page.request.post('/api/account', {headers:{Origin:'http://127.0.0.1:3000'},data:{action:'register',name:'Sample Buyer',email:'test-'+crypto.randomUUID()+'@example.com',password:'Local-test-password-123'}});
  expect(registered.ok()).toBeTruthy();
  await page.goto('/shop');
  await expect(page.getByRole('heading', { name: 'The fragrance collection.' })).toBeVisible();
  await page.getByRole('button', { name: 'Citrus', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card h3')).toHaveText('Citrus Bloom');
  await page.getByRole('button', { name: 'All fragrances', exact: true }).click();
  await page.getByLabel('Sort fragrances').selectOption('low');
  await expect(page.locator('.product-card h3').first()).toHaveText('Citrus Bloom');
  await page.getByLabel('Save Legacy to favourites').click();
  await page.goto('/account/wishlist');
  await expect(page.locator('.product-card h3')).toHaveText('Legacy');
  await page.goto('/product/legacy');
  await page.getByRole('button', { name: '100 ml', exact: true }).click();
  await expect(page.locator('.detail-price')).toContainText('6,999');
  await page.getByLabel('Increase Quantity', { exact: true }).click();
  await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Your bag (2)' })).toBeVisible();
  await expect(page.locator('.drawer-summary strong')).toHaveText('₹13,998');
  await page.getByLabel('Close Your bag (2)').click();
  await page.reload();
  await page.getByLabel('Open bag, 2 items').click();
  await page.getByLabel('Decrease Legacy 100 ml quantity').click();
  await expect(page.locator('.drawer-summary strong')).toHaveText('₹6,999');
  await page.getByRole('dialog').getByRole('link', { name: 'Continue to checkout' }).click();
  await page.getByLabel('Full name').fill('Sample Buyer');

  await page.getByLabel('Phone number').fill('9999999999');
  await page.getByLabel('Pincode').fill('110016');
  await page.getByLabel('Delivery address').fill('Demo Address');
  await page.getByLabel('City', { exact: true }).fill('New Delhi');
  await page.getByLabel('State', { exact: true }).fill('Delhi');
  await page.getByLabel('Preview a checkout outcome').selectOption('failed');
  await page.getByRole('button', { name: 'Place test order' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('declined');
  await expect(page.getByLabel('Open bag, 1 items')).toBeVisible();
  await page.getByLabel('Preview a checkout outcome').selectOption('pending');
  await page.getByRole('button', { name: 'Place test order' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('pending');
  await page.getByLabel('Preview a checkout outcome').selectOption('success');
  await page.getByRole('button', { name: 'Place test order' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you, Sample.' })).toBeVisible();
  await expect(page.getByLabel('Open bag, 0 items')).toBeVisible();
  await page.getByRole('link', { name: 'View demo orders' }).click();
  await expect(page.locator('.order-list>div')).toHaveCount(1);
  await page.locator('.order-detail-link').click();
  await expect(page.getByRole('heading', { name: 'Order details.' })).toBeVisible();
  await expect(page.locator('.order-detail-item')).toContainText('Legacy');
  await expect(page.locator('.order-address')).toContainText('Demo Address');
  await expect(page.locator('.summary-row.total')).toContainText('6,999');
});

test('search and scent discovery navigate to the correct products', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search fragrances').click();
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('bergamot');
  await expect(page.locator('.search-results>a')).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('nothingmatches');
  await expect(page.getByText('No fragrances found.', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Find my scent' }).click();
  await page.getByRole('button', { name: 'Floral', exact: true }).click();
  await page.getByRole('button', { name: 'A slow, everyday ritual' }).click();
  await page.getByRole('link', { name: 'Meet Aurora' }).click();
  await expect(page).toHaveURL(/\/product\/aurora$/);
  await expect(page.getByRole('heading', { name: 'Aurora', exact: true })).toBeVisible();
});

test('mobile navigation, filtering and layout do not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Open navigation').click();
  await page.getByRole('dialog').getByRole('link', { name: 'Shop', exact: true }).click();
  await page.getByRole('button', { name: 'Fragrance family' }).click();
  await page.getByRole('button', { name: 'Woody', exact: true }).click();
  await expect(page.locator('.product-card h3')).toHaveText('Noir');
  for (const route of ['/', '/shop', '/collections', '/product/legacy', '/account', '/our-story', '/journal', '/contact', '/cart']) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} overflows horizontally`).toBe(true);
  }
});

test('desktop and mobile review screenshots', async ({ page }) => {
  async function readyForScreenshot() {
    await expect(page.locator('.site-top')).toHaveAttribute('data-ready', 'true');
    await page.evaluate(() => document.fonts.ready);
    await page.locator('main img').evaluateAll(async (images) => {
      await Promise.all(images.map(async image => {
        const img = image as HTMLImageElement;
        img.loading = 'eager';
        await img.decode();
      }));
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await readyForScreenshot();
  await page.screenshot({ path: '.preview/home-desktop.png', fullPage: true });
  await page.screenshot({ path: '.preview/home-desktop-viewport.png' });
  await page.goto('/product/legacy');
  await readyForScreenshot();
  await page.screenshot({ path: '.preview/product-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await readyForScreenshot();
  await page.screenshot({ path: '.preview/home-mobile.png', fullPage: true });
  await page.screenshot({ path: '.preview/home-mobile-viewport.png' });
});
