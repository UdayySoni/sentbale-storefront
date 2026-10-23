# Deploying SENTBALE

SENTBALE is one Next.js server: the storefront, the admin panel and the API run together. It needs:

- **PostgreSQL 15 or newer.** Tables are created and upgraded automatically on the first connection; there is no separate migration step.
- **A persistent disk for uploaded images** (`data/media`, or the folder in `MEDIA_DIR`).
- **HTTPS.** Sign-in cookies are marked secure behind HTTPS, and `SITE_URL` must use `https://`.

The server refuses to start in production when a required setting is missing or inconsistent: it prints which settings are wrong and exits, so check the host's logs if a deploy never becomes healthy.

## Settings

All settings are environment variables; `.env.example` describes each one.

| Setting | Needed | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Always | PostgreSQL connection string |
| `SITE_URL` | Production | Public address(es), comma-separated. Forms, checkout and admin saves are accepted only from these. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | For online payments | Turns on "Pay online" at checkout |
| `RESEND_API_KEY`, `MAIL_FROM` | For email | Order confirmations, store alerts, team invitations, password resets |
| `ADMIN_SETUP_CODE` | Production, first start | Secret the owner set-up form asks for |
| `SITE_INDEXABLE=true` | At launch | Lets search engines index the store and serves `/robots.txt` and `/sitemap.xml` for them (until then, `robots.txt` blocks all crawlers) |
| `PAYMENTS_ALLOW_TEST=true` | Staging only | Keeps the no-money test checkout available alongside Razorpay |

## Option A — Docker (one server)

1. Copy `.env.example` to `.env` and set at least `POSTGRES_PASSWORD`, `SITE_URL` and `ADMIN_SETUP_CODE`.
2. `docker compose up -d --build`
3. Put HTTPS in front of port 3000 (Caddy, nginx, or your provider's load balancer) and point your domain at it.
4. Open `https://YOUR-DOMAIN/admin` and create the owner account. The form asks for `ADMIN_SETUP_CODE`, so set it first; nobody without it can claim the store.

Images are kept in the `media` volume and the database in `pgdata`. Back up both.

## Option B — a Node.js host (Render, Railway, a VPS)

- Node.js 22. Build command `npm ci && npm run build`; start command `npx next start --hostname 0.0.0.0` (the host's `PORT` is used).
- Create a managed PostgreSQL database and set `DATABASE_URL`. Most providers need `?sslmode=require` at the end.
- Attach a persistent disk and set `MEDIA_DIR` to its path. Hosts whose disks are wiped on each deploy (Vercel and similar serverless platforms) are not suitable for uploaded images.
- Health check path: `/api/health`.

## Payments with Razorpay

1. Razorpay Dashboard → Account & Settings → API keys: create **test** keys first (`rzp_test_…`). Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. Razorpay Dashboard → Webhooks → add `https://YOUR-DOMAIN/api/payments/razorpay/webhook` with the events **payment.captured** and **order.paid**, choose a secret, and set it as `RAZORPAY_WEBHOOK_SECRET`.
3. Place a test order with Razorpay's test card or UPI ID and check it appears as Paid under Admin → Orders.
4. Switch to live keys (and the live webhook) when Razorpay activates your account.

How it works: placing an order holds its stock and creates a Razorpay order. The payment is confirmed by the signed checkout callback or the webhook, whichever arrives first. An unpaid order releases its stock after `ORDER_HOLD_MINUTES` (default 30). Refunds are made from the Razorpay dashboard; marking the order *Refunded* in the admin returns its stock.

Cash on delivery: add a payment method named **COD** (Admin → Payments → Payment methods) and set it to Enabled.

## Email with Resend

Create a Resend account, verify your domain, then set `RESEND_API_KEY` and `MAIL_FROM` (for example `SENTBALE <orders@sentbale.com>`). Store alerts go to the email in Admin → Business Settings. Every email, sent or not, is recorded in the `outbox` table along with its delivery result.

## Moving the local store's data

The local database runs on `localhost:5433` (start it with `start-local.ps1`). Copy it to the new database with the bundled tools:

```powershell
$env:PGPASSWORD = '<password from .env.local>'
.tools\postgresql-18.6\bin\pg_dump.exe -h localhost -p 5433 -U sentbale -Fc -f sentbale.dump sentbale
.tools\postgresql-18.6\bin\pg_restore.exe --no-owner -d "<production DATABASE_URL>" sentbale.dump
```

Then copy `data/media/` to the production image folder. Do this before anyone uses the new store; restoring replaces what is there.

The local database also contains test accounts and test orders created while building the store. Start from an empty database instead if you would rather not carry them over.

## Before launch

- [ ] `SITE_URL` set to the https:// domain; the site loads only over HTTPS
- [ ] Owner account created; team invited with the right roles (Admin → Roles & Permissions)
- [ ] Business Settings: store email, phone, address, GSTIN, GST rate and whether prices include GST
- [ ] Shipping zones and rates; payment methods (COD if offered)
- [ ] Inventory: stock and alert levels for every size you sell (sizes with alert level 0 are not stock-limited)
- [ ] Razorpay live keys and webhook tested with a real low-value order
- [ ] Email working: place an order and receive the confirmation
- [ ] Shipping, returns and privacy pages reviewed against your actual policies
- [ ] `SITE_INDEXABLE=true`
- [ ] Database and media backups scheduled
