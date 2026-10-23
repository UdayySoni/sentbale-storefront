import 'server-only';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from './schema';
import { importLegacyData } from './legacy';
import { ensureCatalogSeeded } from './seed';

/**
 * One PostgreSQL pool per server process, from `DATABASE_URL`.
 *
 * Locally that is the portable PostgreSQL that start-local.ps1 runs from `.tools/` with its data in
 * `data/postgres/` (the URL is in `.env.local`); in production, any hosted PostgreSQL.
 * Migrations in `src/db/migrations` are applied on first use, followed by the one-time import of the
 * pre-Postgres files in `data/` (see legacy.ts).
 */
export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const migrationsFolder = path.join(process.cwd(), 'src', 'db', 'migrations');
const shared = globalThis as typeof globalThis & { sentbaleDb?: Promise<Db> };

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Start the app with start-local.ps1, or set it to a PostgreSQL connection string.');
  const database = drizzle({ client: postgres(url, { max: Number(process.env.DATABASE_POOL || 10), onnotice: () => {} }), schema });
  await migrate(database, { migrationsFolder });
  await importLegacyData(database);
  await ensureCatalogSeeded(database);
  return database;
}

export function db(): Promise<Db> {
  if (!shared.sentbaleDb) shared.sentbaleDb = open().catch(error => { shared.sentbaleDb = undefined; throw error; });
  return shared.sentbaleDb;
}

export { schema };
