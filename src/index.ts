/**
 * Cloudflare Worker entry point
 * Hono app with routes for SSE, OAuth, and admin endpoints
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { OAuthHandler } from './oauth-handler';
import { createMCPServer, registerTools, registerPrompts } from './mcp-server';

export interface Env {
  // R2 bucket bindings
  SECOND_BRAIN_BUCKET: R2Bucket;

  // KV namespace bindings
  OAUTH_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;

  // Analytics Engine binding
  ANALYTICS: AnalyticsEngineDataset;

  // Secrets
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_ALLOWED_USER_ID: string;
  COOKIE_ENCRYPTION_KEY: string;

  // AWS S3 backup configuration
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  AWS_S3_BACKUP_BUCKET: string;
}

/**
 * Create and configure the Hono app
 */
export function createApp(env: Env): Hono {
  const app = new Hono();

  // CORS middleware
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }));

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: 'second-brain-mcp',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // OAuth authorization endpoint
  app.get('/oauth/authorize', async (c) => {
    try {
      const oauthHandler = new OAuthHandler(
        env.OAUTH_KV,
        null, // GitHub API client (will be initialized in real implementation)
        env.GITHUB_CLIENT_ID,
        env.GITHUB_CLIENT_SECRET,
        env.GITHUB_ALLOWED_USER_ID,
        env.COOKIE_ENCRYPTION_KEY
      );

      const response = await oauthHandler.handleOAuthRedirect(c.req.raw);
      return response;
    } catch (error) {
      console.error('OAuth authorization error:', error);
      return c.json({ error: 'Failed to initiate OAuth flow' }, 500);
    }
  });

  // OAuth callback endpoint
  app.get('/oauth/callback', async (c) => {
    try {
      const oauthHandler = new OAuthHandler(
        env.OAUTH_KV,
        null, // GitHub API client (will be initialized in real implementation)
        env.GITHUB_CLIENT_ID,
        env.GITHUB_CLIENT_SECRET,
        env.GITHUB_ALLOWED_USER_ID,
        env.COOKIE_ENCRYPTION_KEY
      );

      const response = await oauthHandler.handleOAuthCallback(c.req.raw);
      return response;
    } catch (error) {
      console.error('OAuth callback error:', error);
      return c.json({ error: 'Failed to complete OAuth flow' }, 500);
    }
  });

  // SSE endpoint for MCP connection
  // This will be implemented in Phase 2.2 or later
  app.get('/sse', async (c) => {
    // Placeholder for SSE implementation
    return c.json({
      error: 'SSE endpoint not yet implemented',
      message: 'MCP over SSE will be available in a future update',
    }, 501);
  });

  // Manual backup trigger endpoint
  // This will be implemented in Phase 4
  app.post('/admin/backup', async (c) => {
    // Placeholder for backup implementation
    return c.json({
      error: 'Backup endpoint not yet implemented',
      message: 'Manual backup will be available in Phase 4',
    }, 501);
  });

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    console.error('Unhandled error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}

/**
 * Worker fetch handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = createApp(env);
    return app.fetch(request, env);
  },

  /**
   * Cron trigger handler for daily backups
   */
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    console.log('Cron trigger fired:', event.cron);
    // Backup implementation will be added in Phase 4
  },
};
