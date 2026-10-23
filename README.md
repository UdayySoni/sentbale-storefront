# SENTBALE — fragrance store

A complete online store for SENTBALE: storefront, customer accounts, checkout with Razorpay or cash on delivery, and an admin panel, as one Next.js 16 / TypeScript application on PostgreSQL. To put it online, see **[DEPLOY.md](DEPLOY.md)**.

## Run it locally (Windows)

Double-click `start-local.cmd`, keep the terminal open, and visit http://127.0.0.1:3000 (admin: http://127.0.0.1:3000/admin).

The launcher (`start-local.ps1`) starts the portable PostgreSQL 18 in `.tools/postgresql-18.6` on `localhost:5433` (data in `data/postgres/`) and then the site with the portable Node.js. The database password is in `.env.local`, which is not committed. PostgreSQL keeps running after you close the site; stop it with `stop-db.ps1`.

On another machine with Node.js 22: `npm ci`, set `DATABASE_URL` in `.env.local` (see `.env.example`), then `npm run dev`.

Locally there are no payment keys, so checkout runs in **test mode** (no money taken) and emails are recorded in the `outbox` table instead of being sent. Password reset links are printed in the dev server's terminal.

## What the store does

**Shopping**
- Shop, collections, product pages with 50/100/200 ml sizes, search, quick view, scent finder, favourites, bag.
- Prices, stock and sold-out sizes come from the database. A size is stock-limited once it has a low-stock alert level; checkout never sells more than is on hand.
- Checkout prices everything on the server: per-size prices, coupon codes, shipping zones by state (with free-delivery thresholds), and GST (included in prices or added, as set in Business Settings).
- Payment: **Razorpay** (UPI, cards, net banking; configured with keys), **cash on delivery** (when a payment method named COD is enabled), or the **test checkout** while Razorpay is not set up. An unpaid online order holds its stock for 30 minutes.
- Accounts: sign-up, sign-in, password reset by email, profile, address book, order history with status and totals.
- Product reviews (signed-in customers; shown once approved), contact form and newsletter sign-up.
- Homepage wording, announcement bar, featured products, collections and journal posts all come from the admin.

**Admin** (`/admin`)
- **Dashboard** — revenue, orders, customers, sales chart, top sellers, low stock.
- **Products** — edit the storefront fragrances; add new ones (status *Active* puts them on sale, *Draft* keeps them hidden). **Image studio** for photos and banners.
- **Inventory** — SKU, price, stock and alert level for every size.
- **Orders** — every storefront order, plus orders you enter by hand (phone, in person). Change status and payment; cancelling or refunding returns the stock. Orders are never deleted.
- **Customers** — accounts, segments, blocking. **Messages** tab for contact messages and newsletter sign-ups.
- **Collections, Coupons, Reviews, Journal, Homepage Content, Shipping, Payments, Business Settings.**
- **Roles & Permissions** — invite team members (one-time link, emailed when email is set up), choose each role's access per section. Enforced on the server; roles that may only see the dashboard never receive customer details.
- **Audit Logs** — every change, written by the server under the signed-in admin's name.

**Emails** (with Resend): order confirmation to the customer; new-order, low-stock, review and contact-message alerts to the store email; team invitations; password resets.

## How it is built

| Part | Where |
| --- | --- |
| Database schema (Drizzle ORM) and migrations | `src/db/schema.ts`, `src/db/migrations/` (applied automatically on first connection) |
| Checkout pricing, stock, coupons, order lifecycle | `src/lib/commerce-server.ts` |
| Razorpay | `src/lib/razorpay-server.ts`, `src/app/api/payments/razorpay/` |
| Customer accounts and sessions | `src/lib/accounts-server.ts`, `src/app/api/account/` |
| Admin sign-in, invitations, roles | `src/lib/admin-auth.ts`, `src/lib/admin/access-server.ts` |
| Admin data (one API for every section) | `src/lib/admin/workspace-server.ts`, `src/app/api/admin/workspace/`; the panel uses it through `src/lib/admin/store.ts` |
| Storefront content from the admin | `src/lib/content-server.ts`, `/api/content` |
| Email | `src/lib/mail-server.ts` |
| Settings and start-up checks | `src/lib/config.ts`, `src/instrumentation.ts`, `.env.example` |

After changing `src/db/schema.ts`, run `npm run db:generate` and restart the server.

When the site first started on PostgreSQL it imported the earlier `data/customers.sqlite`, `data/catalog.json` and `data/media.json` once (`src/db/legacy.ts`); those files are no longer read. Admin records once kept in a browser's local storage are imported on that browser's first admin visit, if the server workspace has not been used yet.

## Security

- Passwords are hashed with scrypt; sessions use random tokens stored only as hashes, in `HttpOnly`, `SameSite=Lax` cookies (Secure over HTTPS). Admin sessions last 8 hours and end after 30 minutes idle.
- Sign-in is locked for 15 minutes after repeated failures (5 for admins, 10 for customers); password reset requests are limited too and never reveal whether an email has an account.
- Every write must come from the site's own origin (`SITE_URL`, or localhost in development). Admin writes also need a session and a role that may manage that section.
- Payment confirmations are verified with Razorpay's HMAC signatures (checkout callback and webhook).
- On a production server, creating the owner account requires `ADMIN_SETUP_CODE`.
- Security headers: HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, and `no-store` on admin pages. CSV exports neutralise spreadsheet formulas.

## Data and backups

Everything lives in PostgreSQL, apart from uploaded images (`data/media/`). Back up both: `pg_dump` for the database (see DEPLOY.md), and a copy of the images folder.

## Content and assets

`src/lib/catalog.ts` holds the four starting fragrances; once edited in the admin, the `products` table is what counts. Confirm names, notes, prices, ingredient claims and policies with the brand before launch. `public/images/` contains generated concept imagery, not photographs of the final products. Fonts are Cormorant Garamond and Manrope, self-hosted under the SIL Open Font License (`public/fonts/`).

## Checks

- `npm run typecheck`
- `npm run build`
- With the dev server running and `SENTBALE_ADMIN_EMAIL` / `SENTBALE_ADMIN_PASSWORD` set to an owner account: `npm run test:e2e`. The browser tests use Google Chrome at its standard Windows path (see `playwright.config.ts`). They create test accounts and orders, so run them against a separate database.
