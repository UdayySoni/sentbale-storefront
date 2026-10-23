import 'server-only';
import { headers } from 'next/headers';
import { config } from './config';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Accepts a write only from this site's own pages: the browser's Origin must be one of SITE_URL's
 * origins, or a local address matching the Host header (development). Cross-site requests are refused.
 */
export function writeAllowed(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || request.headers.get('sec-fetch-site') === 'cross-site') return false;
  try {
    const source = new URL(origin);
    if (config.siteOrigins.includes(source.origin)) return true;
    // Next may normalize request.url to localhost when the browser uses 127.0.0.1.
    // Match against the actual Host header, never a forwarded host.
    return LOCAL_HOSTS.includes(source.hostname)
      && source.host === request.headers.get('host')
      && source.protocol === new URL(request.url).protocol;
  } catch { return false; }
}

/** Cookies are marked Secure whenever the site is reached over HTTPS (directly or behind a proxy). */
export async function secureCookies() {
  return (await headers()).get('x-forwarded-proto') === 'https' || config.siteUrl.startsWith('https://');
}
