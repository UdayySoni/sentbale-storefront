import { test, expect } from '@playwright/test';

test('saved addresses can be created, edited and removed', async ({ page }) => {
  const registered = await page.request.post('/api/account', {headers:{Origin:'http://127.0.0.1:3000'},data:{action:'register',name:'Sample Buyer',email:'test-'+crypto.randomUUID()+'@example.com',password:'Local-test-password-123'}});
  expect(registered.ok()).toBeTruthy();
  await page.goto('/account/addresses');
  await page.getByRole('button', { name: 'Add address', exact: true }).click();
  await page.getByLabel('Address label').fill('Home');
  await page.getByLabel('Full name').fill('Sample Buyer');
  await page.getByLabel('Phone number').fill('9999999999');
  await page.getByLabel('Pincode').fill('110016');
  await page.getByLabel('Street address').fill('Sample Street 12');
  await page.getByLabel('City', { exact: true }).fill('New Delhi');
  await page.getByLabel('State', { exact: true }).fill('Delhi');
  await page.getByRole('button', { name: 'Save address' }).click();
  await expect(page.locator('.address-card')).toContainText('Sample Street 12');
  await page.reload();
  await expect(page.locator('.address-card')).toContainText('Default');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Street address').fill('Sample Street 24');
  await page.getByRole('button', { name: 'Save address' }).click();
  await expect(page.locator('.address-card')).toContainText('Sample Street 24');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.address-card')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A place for your next discovery.' })).toBeVisible();
});

test('fragrance FAQ searches and collection pages have their own stories', async ({ page }) => {
  await page.goto('/faq');
  await page.getByLabel('Search questions').fill('base notes');
  await expect(page.locator('.faq-list details')).toHaveCount(1);
  await page.locator('.faq-list summary').click();
  await expect(page.locator('.faq-list details>p')).toBeVisible();
  await page.getByLabel('Search questions').fill('doesnotexist');
  await expect(page.getByRole('heading', { name: 'No matching questions.' })).toBeVisible();
  await page.goto('/collections/oud');
  await expect(page.getByRole('heading', { name: 'Depth that draws you closer.' })).toBeVisible();
  await expect(page.locator('.product-card h3')).toHaveText('Legacy');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/faq', '/account/addresses', '/collections/oud', '/account/orders/DEMO-MISSING']) {
    await page.goto(route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  await page.goto('/faq');
  await page.screenshot({ path: '.preview/faq-mobile.png', fullPage: true });
});
