/**
 * API Server
 *
 * Entry point for the REST API server
 */

import { serve } from 'bun';
import { initDb, closeDb } from './lib/db.js';
import app from './index.js';

const port = parseInt(process.env.PORT || '3001');

function log(level: 'info' | 'error' | 'warn', msg: string, data?: Record<string, unknown>) {
  const entry = { level, ts: new Date().toISOString(), msg, ...data };
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    const icons = { info: 'ℹ️', error: '❌', warn: '⚠️' };
    console.log(`${icons[level]} ${msg}`, data ?? '');
  }
}

log('info', 'Sarawan Social API starting', { port, nodeEnv: process.env.NODE_ENV || 'development' });

let server: ReturnType<typeof serve> | null = null;

// Initialize PostgreSQL (non-blocking — falls back to SQLite if unavailable)
initDb().then(() => {
  server = serve({
    fetch: app.fetch,
    port,
  });

  log('info', 'Sarawan Social API ready', { url: `http://localhost:${port}` });
}).catch((err) => {
  log('error', 'Startup failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

// Graceful shutdown
async function shutdown(signal: string) {
  log('info', 'Shutting down', { signal });
  if (server) server.stop();
  await closeDb();
  log('info', 'Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
