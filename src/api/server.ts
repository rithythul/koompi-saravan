/**
 * API Server
 *
 * Entry point for the REST API server
 */

import { serve } from 'bun';
import app from './index.js';

const port = parseInt(process.env.PORT || '3001');

console.log(`🚀 Sarawan Social API starting on port ${port}...`);

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
