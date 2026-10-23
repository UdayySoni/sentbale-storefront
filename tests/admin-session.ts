import { expect, type APIRequestContext } from '@playwright/test';

const headers = { Origin: 'http://127.0.0.1:3000' };
/**
 * Signs an API context into the admin panel. `page.request` shares cookies with the page; the `request`
 * fixture has its own jar, so tests that use both sign both in.
 * Set SENTBALE_ADMIN_EMAIL and SENTBALE_ADMIN_PASSWORD to the owner account before running.
 */
export async function signInAdmin(...contexts: APIRequestContext[]) {
  const email = process.env.SENTBALE_ADMIN_EMAIL, password = process.env.SENTBALE_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set SENTBALE_ADMIN_EMAIL and SENTBALE_ADMIN_PASSWORD to run the admin tests.');
  for (const context of contexts) {
    const state = await (await context.get('/api/admin/session')).json();
    if (state.admin) continue;
    // On a brand-new data folder the first sign-in creates the owner account.
    const response = await context.post('/api/admin/session', { headers, data: state.setupRequired ? { action: 'setup', name: 'Test Owner', email, password } : { action: 'login', email, password } });
    expect(response.ok(), 'admin sign-in').toBeTruthy();
  }
}
