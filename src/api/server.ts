/**
 * API Server
 *
 * Entry point for the REST API server
 */

import { serve } from 'bun';
import { initDb, closeDb } from './lib/db.js';
import app from './index.js';

const port = parseInt(process.env.PORT || '3001');

console.log(`🚀 Sarawan Social API starting on port ${port}...`);

// Initialize PostgreSQL (non-blocking — falls back to SQLite if unavailable)
initDb().then(() => {
  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`✅ Sarawan Social API ready at http://localhost:${port}`);
  console.log(`📚 API endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   POST /api/publish`);
  console.log(`   GET  /api/analytics/summary`);
  console.log(`   GET  /api/platforms`);
  console.log(`   POST /api/media/upload`);
}).catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await closeDb();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await closeDb();
  process.exit(0);
});
