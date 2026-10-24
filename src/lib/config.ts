import 'server-only';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

/**
 * Every environment setting the server reads, in one place. See `.env.example` for descriptions.
 * Invalid combinations fail at startup (via instrumentation.ts) rather than at the first request.
 */
const env = (name: string) => process.env[name]?.trim() || '';

function origins() {
  return env('SITE_URL').split(',').map(value => value.trim()).filter(Boolean).flatMap(value => {
    try { return [new URL(value).origin]; } catch { return []; }
  });
}

export const config = {
  production: process.env.NODE_ENV === 'production',
  /** Public origins the site is served from, e.g. https://sentbale.com. Writes are accepted only from these (and localhost). */
  siteOrigins: origins(),
  /** First configured origin, used for links in emails. */
  siteUrl: origins()[0] || 'http://127.0.0.1:3000',
  indexable: env('SITE_INDEXABLE') === 'true',
  // The image folder is chosen at runtime; it holds uploads, not code, so the build must not trace it.
  mediaDir: env('MEDIA_DIR') ? path.resolve(/*turbopackIgnore: true*/ env('MEDIA_DIR')) : path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'media'),
  payments: {
    razorpayKeyId: env('RAZORPAY_KEY_ID'),
    razorpayKeySecret: env('RAZORPAY_KEY_SECRET'),
    razorpayWebhookSecret: env('RAZORPAY_WEBHOOK_SECRET'),
    /** Test checkout (no money taken). Allowed only while Razorpay is not configured, unless explicitly enabled. */
    allowTest: env('PAYMENTS_ALLOW_TEST') === 'true',
  },
  mail: {
    resendApiKey: env('RESEND_API_KEY'),
    from: env('MAIL_FROM'),
  },
  /** Minutes an unpaid online order holds its stock. */
  holdMinutes: Number(env('ORDER_HOLD_MINUTES') || 30),
};

export const razorpayEnabled = () => !!(config.payments.razorpayKeyId && config.payments.razorpayKeySecret);
/**
 * The test checkout (orders marked Paid, no money taken). Locally it is on while Razorpay is not set up;
 * in production only when PAYMENTS_ALLOW_TEST=true, so a live store without Razorpay keys never gives orders away.
 */
export const testPaymentsEnabled = () => config.payments.allowTest || (!config.production && !razorpayEnabled());
export const mailEnabled = () => !!(config.mail.resendApiKey && config.mail.from);

/** Problems that make a production deployment unsafe or broken. */
export function configProblems() {
  const problems: string[] = [];
  if (!env('DATABASE_URL')) problems.push('DATABASE_URL is not set.');
  if (config.production) {
    if (!config.siteOrigins.length) problems.push('SITE_URL is not set, so the store would refuse every form and admin save.');
    if (config.siteOrigins.some(origin => origin.startsWith('http://') && !/\/\/(localhost|127\.0\.0\.1)/.test(origin))) problems.push('SITE_URL must use https:// in production.');
    if (razorpayEnabled() && !config.payments.razorpayWebhookSecret) problems.push('RAZORPAY_WEBHOOK_SECRET is required when Razorpay is configured.');
    if (!!config.payments.razorpayKeyId !== !!config.payments.razorpayKeySecret) problems.push('Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or neither.');
    if (!!config.mail.resendApiKey !== !!config.mail.from) problems.push('Set both RESEND_API_KEY and MAIL_FROM, or neither.');
    if (env('ADMIN_SETUP_CODE') && env('ADMIN_SETUP_CODE').length < 12) problems.push('ADMIN_SETUP_CODE must be at least 12 characters.');
  }
  if (!Number.isInteger(config.holdMinutes) || config.holdMinutes < 5 || config.holdMinutes > 1440) problems.push('ORDER_HOLD_MINUTES must be a whole number from 5 to 1440.');
  return problems;
}

/**
 * Start-up check. A production server with configuration problems would misbehave for customers, so it
 * exits (Next.js only logs a throwing instrumentation hook and serves anyway). Locally it just warns.
 */
export function checkConfigOrExit() {
  if (config.production && !razorpayEnabled()) console.warn(config.payments.allowTest
    ? 'SENTBALE: PAYMENTS_ALLOW_TEST is on — anyone can place orders that are marked Paid without paying. Use this only on a staging site.'
    : 'SENTBALE: Razorpay is not configured, so customers can only order with cash on delivery (if it is enabled in Admin → Payments).');
  const problems = configProblems();
  if (!problems.length) return;
  const message = `SENTBALE configuration:\n- ${problems.join('\n- ')}`;
  if (!config.production) return console.warn(message);
  console.error(`${message}\nThe server will not start until these settings are fixed (see .env.example).`);
  process.exit(1);
}

/**
 * Creating the first (owner) account on a production server requires ADMIN_SETUP_CODE, so a stranger
 * who finds a fresh deployment first cannot claim it. Locally no code is needed.
 */
export const setupCodeRequired = () => config.production;
export function setupCodeMatches(code: unknown) {
  if (!setupCodeRequired()) return true;
  const expected = env('ADMIN_SETUP_CODE');
  if (expected.length < 12 || typeof code !== 'string') return false;
  const given = Buffer.from(code), wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
