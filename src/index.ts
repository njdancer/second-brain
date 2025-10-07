/**
 * Cloudflare Worker entry point
 * Hono app with routes for SSE, OAuth, and admin endpoints
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { OAuthHandler } from './oauth-handler';
import { createMCPServer, registerTools, registerPrompts } from './mcp-server';
import {
  createMCPServerInstance,
  getOrCreateTransport,
  storeSession,
  isInitializeRequest,
} from './mcp-transport';
import { StorageService } from './storage';
import { RateLimiter } from './rate-limiting';

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

  // MCP endpoint for Streamable HTTP transport
  // Handles both GET (endpoint info) and POST (JSON-RPC messages)
  app.post('/mcp', async (c) => {
    try {
      // Extract session ID from headers
      const sessionId = c.req.header('mcp-session-id');

      // Get request body
      const body = await c.req.json();

      // Check if this is an initialize request
      const isInitialize = isInitializeRequest(body);

      // Get or create transport
      const transport = getOrCreateTransport(sessionId, isInitialize);

      if (!transport) {
        return c.json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid session or missing session ID',
          },
          id: body.id || null,
        }, 400);
      }

      // TODO: Extract user ID from OAuth token
      // For now, use a placeholder (will be implemented with OAuth integration)
      const userId = 'user-placeholder';

      // Create storage and rate limiter instances
      const storage = new StorageService(env.SECOND_BRAIN_BUCKET);
      const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV);

      // Create or retrieve MCP server instance
      const server = createMCPServerInstance(storage, rateLimiter, env.ANALYTICS, userId);

      // Store session if this is a new initialize request
      if (isInitialize && transport.sessionId) {
        storeSession(transport.sessionId, transport, server);
      }

      // Connect server to transport if not already connected
      await server.connect(transport);

      // Handle the request through the transport
      // The transport will process the JSON-RPC message and send response
      const req = c.req.raw;
      const res = new Response();

      // Create a Node.js-compatible response wrapper
      const nodeResponse = {
        statusCode: 200,
        setHeader: (name: string, value: string) => {
          res.headers.set(name, value);
        },
        writeHead: (statusCode: number, headers?: Record<string, string>) => {
          nodeResponse.statusCode = statusCode;
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              res.headers.set(key, value);
            });
          }
        },
        write: (chunk: string) => {
          // Handle SSE streaming (if needed)
          console.log('SSE chunk:', chunk);
        },
        end: (data?: string) => {
          if (data) {
            return new Response(data, {
              status: nodeResponse.statusCode,
              headers: res.headers,
            });
          }
          return new Response(null, {
            status: nodeResponse.statusCode,
            headers: res.headers,
          });
        },
      };

      // Handle the request
      await transport.handleRequest(req as any, nodeResponse as any, body);

      // Return the response
      return nodeResponse.end();

    } catch (error) {
      console.error('MCP endpoint error:', error);
      return c.json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      }, 500);
    }
  });

  // GET endpoint for MCP metadata (optional)
  app.get('/mcp', async (c) => {
    return c.json({
      name: 'second-brain-mcp',
      version: '1.0.0',
      description: 'Model Context Protocol server for Building a Second Brain methodology',
      protocol: 'streamable-http',
      protocolVersion: '2025-03-26',
    });
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
