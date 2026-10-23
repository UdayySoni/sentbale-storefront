/** Runs once when the server starts: checks the configuration before any request is served. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { checkConfigOrExit } = await import('./lib/config');
  checkConfigOrExit();
}
