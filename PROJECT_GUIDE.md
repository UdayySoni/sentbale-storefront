# SENTBALE project guide

## What this project is

SENTBALE is an online fragrance store with an administration console. Customers browse, create accounts, and order with Razorpay, cash on delivery or (while payments are not configured) a test checkout. The store team manages products, stock, orders, customers, content, coupons, shipping, payments and the team from the admin panel. See the README for the features and DEPLOY.md for going live.

## Technology stack

| Area | Technology | Why it is used |
| --- | --- | --- |
| Application framework | Next.js 16, App Router | Serves pages and API routes from one TypeScript application. |
| User interface | React 19 | Builds the interactive storefront, product editor and image studio. |
| Programming language | TypeScript | Adds type checking for safer product, media and order handling. |
| Styling | CSS with Tailwind CSS PostCSS support | Uses custom responsive CSS; Tailwind is available for future utility styling. |
| Validation | Zod | Checks admin input on the server before it is saved. |
| Payments | Razorpay (REST API and Checkout) | Online payment in INR, verified by signature and webhook. |
| Email | Resend (HTTP API) | Order confirmations, alerts, invitations and password resets; every email is kept in the outbox table. |
| Deployment | Docker / any Node.js 22 host | `Dockerfile` and `docker-compose.yml`; see DEPLOY.md. |
| Icons | Lucide React | Provides the admin, storefront and action icons. |
| Database | PostgreSQL 18 + Drizzle ORM | Stores customers, addresses, sessions, admins, products, media settings, orders and enquiries. Portable server in `.tools/`, data in `data/postgres/`; schema in `src/db/schema.ts`. |
| File storage | Local files | Uploaded images in `data/media/`. |
| Tests | Playwright | Checks browser journeys including catalogue pricing, image uploads and mobile layout. |

## Main folders

| Location | Purpose |
| --- | --- |
| `src/app` | Next.js pages and API routes. |
| `src/components` | Storefront and image studio components; `src/components/admin` holds the admin panel. |
| `src/lib/admin` | Admin navigation, the empty starting workspace and the browser data store that the backend will replace. |
| `src/lib` | Catalogue, media, account and local data helpers. |
| `public/images` | Built-in campaign and product images. |
| `data` | Local runtime data. Keep this folder when moving the project to another computer. |
| `tests` | Playwright end-to-end tests. |

## Admin console

Open `http://127.0.0.1:3000/admin` after starting the project. The first visit creates the owner account; later visits require sign-in.

The Products page supports:

- Editing names, fragrance families, taglines, descriptions, badges and 50 ml prices.
- Calculating 100 ml and 200 ml prices from the 50 ml price (each size can then be priced separately in Inventory).
- Updating storefront, bag and checkout prices immediately after saving.
- Adding new fragrances, which go on sale when their status is Active.
- Opening the image studio for a specific product.

Open `http://127.0.0.1:3000/admin/images` to update product photos, banners, collection images and journal images. Uploads accept PNG, JPEG and WebP files up to 8 MB.

## Data and backups

Back up these paths before sending the project or moving it to another computer:

- `data/postgres/` — the PostgreSQL database (stop it with `stop-db.ps1` before copying, or export with `pg_dump`).
- `data/media/` — uploaded images.
- `.env.local` — the database connection string and password.

A new, empty database is filled with the built-in catalogue and media defaults on first start.

## Before going live

Follow the checklist at the end of DEPLOY.md: HTTPS domain and SITE_URL, owner account (ADMIN_SETUP_CODE), business settings and GST, shipping zones, stock levels, Razorpay live keys and webhook, email, policy pages, search indexing and backups.
