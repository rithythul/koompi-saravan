/**
 * Sarawan Social REST API
 *
 * Hono-based HTTP API for social media publishing and analytics.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import type { Bindings } from './types.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';

// Create Hono app
const app = new Hono<{ Bindings: Bindings }>();

// Global middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', rateLimitMiddleware);

// Health check (no auth)
app.get('/', (c) => {
  return c.json({
    name: 'Sarawan Social API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// Import routes
import publishRoutes from './routes/publish.js';
import analyticsRoutes from './routes/analytics.js';
import mediaRoutes from './routes/media.js';
import platformRoutes from './routes/platforms.js';

// Register routes with auth
const apiRoutes = new Hono<{ Bindings: Bindings }>();
apiRoutes.use('*', authMiddleware);
apiRoutes.route('/publish', publishRoutes);
apiRoutes.route('/analytics', analyticsRoutes);
apiRoutes.route('/media', mediaRoutes);
apiRoutes.route('/platforms', platformRoutes);

app.route('/api', apiRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    path: c.req.path,
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
  }, 500);
});

export default app;
