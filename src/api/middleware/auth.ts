/**
 * API Auth Middleware
 *
 * Bearer token auth using API_KEY env var.
 * Defaults to DENY-ALL in production. Set AUTH_DISABLED=true for dev mode.
 */

import { createMiddleware } from 'hono/factory';

export const authMiddleware = createMiddleware(async (c, next) => {
  // Skip auth for health check
  if (c.req.path === '/health' || c.req.path === '/') {
    return next();
  }

  const authDisabled = process.env.AUTH_DISABLED === 'true';
  const apiKey = process.env.API_KEY;

  // Dev mode: explicit opt-in required
  if (authDisabled) {
    console.warn('⚠️  Auth disabled — AUTH_DISABLED=true (dev mode only)');
    return next();
  }

  // Production: require API_KEY
  if (!apiKey) {
    return c.json(
      {
        error: 'Service Unavailable',
        message: 'API authentication not configured. Set API_KEY environment variable.',
      },
      503
    );
  }

  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      { error: 'Unauthorized', message: 'Missing or invalid Authorization header' },
      401
    );
  }

  const token = authHeader.slice(7);

  if (token !== apiKey) {
    return c.json(
      { error: 'Forbidden', message: 'Invalid API key' },
      403
    );
  }

  return next();
});
