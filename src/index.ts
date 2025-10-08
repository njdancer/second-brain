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
      version: '1.2.3',
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
      // Get request body first to check if it's an initialize request
      const body = await c.req.json();
      const isInitialize = isInitializeRequest(body);
      const authHeader = c.req.header('Authorization');

      // For initialize requests WITHOUT auth header, allow anonymous access
      // For initialize requests WITH auth header, validate the auth
      // For all other requests, require auth
      let userId: string;

      const requiresAuth = !isInitialize || (isInitialize && authHeader);

      if (requiresAuth) {
        // Extract and validate OAuth token
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return c.json({
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Missing or invalid Authorization header',
            },
            id: body.id || null,
          }, 401);
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Validate token and get user info
        const oauthHandler = new OAuthHandler(
          env.OAUTH_KV,
          null,
          env.GITHUB_CLIENT_ID,
          env.GITHUB_CLIENT_SECRET,
          env.GITHUB_ALLOWED_USER_ID,
          env.COOKIE_ENCRYPTION_KEY
        );

        const userInfo = await oauthHandler.validateToken(token);
        if (!userInfo) {
          return c.json({
            jsonrpc: '2.0',
            error: {
              code: -32002,
              message: 'Invalid or expired token',
            },
            id: body.id || null,
          }, 401);
        }

        // Check if user is authorized
        if (!(await oauthHandler.isUserAuthorized(userInfo.userId))) {
          return c.json({
            jsonrpc: '2.0',
            error: {
              code: -32003,
              message: 'User not authorized',
            },
            id: body.id || null,
          }, 403);
        }

        userId = userInfo.userId;
      } else {
        // For unauthenticated initialize requests, return OAuth information
        // without creating a full session
        return c.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'second-brain-mcp',
              version: '1.2.1',
            },
            capabilities: {
              tools: {},
              prompts: {},
              resources: {},
            },
            // Tell client that OAuth is required
            instructions: `This server requires OAuth authentication.

Please visit: ${new URL('/oauth/authorize', c.req.url).toString()}

After authentication, reconnect with your OAuth token in the Authorization header.`,
          },
          id: body.id,
        });
      }

      // Extract session ID from headers
      const sessionId = c.req.header('mcp-session-id');

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
      const responseChunks: string[] = [];
      const responseHeaders = new Headers();
      let responseStatus = 200;

      const nodeResponse = {
        statusCode: 200,
        setHeader: (name: string, value: string) => {
          responseHeaders.set(name, value);
        },
        writeHead: (statusCode: number, headers?: Record<string, string>) => {
          responseStatus = statusCode;
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              responseHeaders.set(key, value);
            });
          }
        },
        write: (chunk: string) => {
          responseChunks.push(chunk);
          return true;
        },
        end: (data?: string) => {
          if (data) {
            responseChunks.push(data);
          }
          const body = responseChunks.join('');
          return new Response(body, {
            status: responseStatus,
            headers: responseHeaders,
          });
        },
      };

      // Handle the request
      await transport.handleRequest(req as any, nodeResponse as any, body);

      // Return the response
      return nodeResponse.end();

    } catch (error) {
      console.error('MCP endpoint error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      return c.json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
        id: null,
      }, 500);
    }
  });

  // GET endpoint for MCP metadata (optional)
  app.get('/mcp', async (c) => {
    return c.json({
      name: 'second-brain-mcp',
      version: '1.2.3',
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
