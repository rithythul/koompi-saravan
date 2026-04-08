/**
 * API Auth Middleware
 *
 * Bearer token auth using API_KEY env var.
 */

import { createMiddleware } from 'hono/factory';

export const authMiddleware = createMiddleware(async (c, next) => {
  // Skip auth for health check
  if (c.req.path === '/health' || c.req.path === '/') {
    return next();
  }

  const apiKey = process.env.API_KEY;

  // If no API_KEY is set, skip auth (dev mode)
  if (!apiKey) {
    return next();
  }

  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      { error: 'Unauthorized', message: 'Missing or invalid API key' },
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
