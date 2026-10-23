import { defineConfig } from 'drizzle-kit';

// Generates SQL migrations from src/db/schema.ts. The app applies them itself on first connection
// (src/db/index.ts), so `npm run db:generate` is the only command needed after a schema change.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
