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
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowHeaders: ['Content-Type', 'Authorization', 'mcp-protocol-version', 'mcp-session-id'],
    exposeHeaders: ['mcp-session-id'],
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

  // OAuth callback endpoint (browser redirect from GitHub)
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

  // OAuth token endpoint (server-to-server token exchange)
  app.post('/oauth/token', async (c) => {
    try {
      console.log('=== /oauth/token ENDPOINT DEBUG ===');
      console.log('Request headers:', Object.fromEntries(c.req.raw.headers.entries()));

      const oauthHandler = new OAuthHandler(
        env.OAUTH_KV,
        null,
        env.GITHUB_CLIENT_ID,
        env.GITHUB_CLIENT_SECRET,
        env.GITHUB_ALLOWED_USER_ID,
        env.COOKIE_ENCRYPTION_KEY
      );

      const body = await c.req.parseBody();
      console.log('Parsed body:', body);

      const code = body.code as string;
      const grantType = body.grant_type as string;

      console.log('Code:', code);
      console.log('Grant type:', grantType);

      if (grantType !== 'authorization_code') {
        console.log('Unsupported grant type:', grantType);
        return c.json({ error: 'unsupported_grant_type' }, 400);
      }

      if (!code) {
        console.log('Missing code parameter');
        return c.json({ error: 'invalid_request', error_description: 'Missing code parameter' }, 400);
      }

      // Exchange code for token
      console.log('Calling handleTokenExchange with code:', code);
      const result = await oauthHandler.handleTokenExchange(code);

      if (!result) {
        console.log('handleTokenExchange returned null - invalid code or unauthorized user');
        return c.json({ error: 'invalid_grant', error_description: 'Invalid authorization code or user not authorized' }, 400);
      }

      console.log('Token exchange successful, returning result');
      return c.json(result);
    } catch (error) {
      console.error('OAuth token endpoint error:', error);
      return c.json({ error: 'server_error', error_description: 'Failed to exchange token' }, 500);
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

      console.log('MCP POST request received');
      console.log('Request method:', body.method);
      console.log('Request ID:', body.id);
      console.log('Has Authorization header:', !!authHeader);
      console.log('Is initialize request:', isInitialize);
      console.log('Request body:', JSON.stringify(body));

      // For initialize requests WITHOUT auth header, allow anonymous access
      // For initialize requests WITH auth header, validate the auth
      // For all other requests, require auth
      let userId: string;

      const requiresAuth = !isInitialize || (isInitialize && authHeader);
      console.log('Requires auth:', requiresAuth);

      if (requiresAuth) {
        console.log('Entering auth validation block');
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
          console.log('Token validation failed');
          return c.json({
            jsonrpc: '2.0',
            error: {
              code: -32002,
              message: 'Invalid or expired token',
            },
            id: body.id || null,
          }, 401);
        }

        console.log('Token validated for user:', userInfo.userId);

        // Check if user is authorized
        if (!(await oauthHandler.isUserAuthorized(userInfo.userId))) {
          console.log('User not authorized:', userInfo.userId);
          return c.json({
            jsonrpc: '2.0',
            error: {
              code: -32003,
              message: 'User not authorized',
            },
            id: body.id || null,
          }, 403);
        }

        console.log('User authorized:', userInfo.userId);
        userId = userInfo.userId;
      } else {
        console.log('Returning OAuth info for unauthenticated initialize request');
        // For unauthenticated initialize requests, return OAuth information
        // without creating a full session
        return c.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'second-brain-mcp',
              version: '1.2.3',
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
      console.log('Session ID:', sessionId || 'none');

      // Get or create transport
      const transport = getOrCreateTransport(sessionId, isInitialize);

      if (!transport) {
        console.log('No transport - invalid session or not initialize request');
        return c.json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid session or missing session ID',
          },
          id: body.id || null,
        }, 400);
      }

      console.log('Transport created/retrieved, session:', transport.sessionId);

      // Create storage and rate limiter instances
      const storage = new StorageService(env.SECOND_BRAIN_BUCKET);
      const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV);

      // Create or retrieve MCP server instance
      const server = createMCPServerInstance(storage, rateLimiter, env.ANALYTICS, userId);
      console.log('MCP server instance created for user:', userId);

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
      let isEnded = false;

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
          isEnded = true;
        },
      };

      // Handle the request
      await transport.handleRequest(req as any, nodeResponse as any, body);

      // Get the response body after transport.handleRequest has called end()
      const responseBody = responseChunks.join('');

      console.log('MCP Response status:', responseStatus);
      console.log('MCP Response body:', responseBody.substring(0, 500));

      // Return the response
      return new Response(responseBody, {
        status: responseStatus,
        headers: responseHeaders,
      });

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

  // OAuth 2.1 Authorization Server Metadata (RFC 8414)
  app.get('/.well-known/oauth-authorization-server', async (c) => {
    const baseUrl = new URL(c.req.url).origin;
    return c.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/register`,
      scopes_supported: ['mcp:read', 'mcp:write'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    });
  });

  // OAuth 2.1 Protected Resource Metadata
  app.get('/.well-known/oauth-protected-resource/mcp', async (c) => {
    const baseUrl = new URL(c.req.url).origin;
    return c.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: ['mcp:read', 'mcp:write'],
      bearer_methods_supported: ['header'],
    });
  });

  // Dynamic Client Registration (RFC 7591) - Simplified
  app.post('/register', async (c) => {
    // For now, return metadata pointing to our OAuth app
    // In a full implementation, this would create a new OAuth client
    return c.json({
      client_id: 'use-github-oauth-app',
      client_secret: 'n/a',
      authorization_endpoint: new URL('/oauth/authorize', c.req.url).toString(),
      token_endpoint: new URL('/oauth/token', c.req.url).toString(),
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
