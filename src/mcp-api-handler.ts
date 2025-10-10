/**
 * MCP API Handler
 * Handles authenticated MCP requests after OAuth validation by OAuthProvider
 * Pattern based on Cloudflare's remote-mcp-github-oauth template
 */

import { Hono } from 'hono';
import {
  createMCPServerInstance,
  getOrCreateTransport,
  storeSession,
  isInitializeRequest,
} from './mcp-transport';
import { StorageService } from './storage';
import { RateLimiter } from './rate-limiting';
import { Env } from './index';

/**
 * Props injected by OAuthProvider after token validation
 */
interface MCPProps {
  userId: string;
  githubLogin: string;
}

/**
 * Extended environment with OAuthProvider props
 */
interface MCPEnv extends Env {
  props: MCPProps;
}

/**
 * Create MCP API handler
 * This handler is called by OAuthProvider after validating the OAuth token
 * User information is available in c.env.props (injected by OAuthProvider)
 */
export function createMCPHandler() {
  const app = new Hono<{ Bindings: MCPEnv }>();

  /**
   * Handle authenticated MCP JSON-RPC requests
   */
  app.post('/mcp', async (c) => {
    try {
      // Get user ID from props (set by OAuthProvider after token validation)
      const userId = c.env.props?.userId;
      if (!userId) {
        return c.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32003,
              message: 'User not authorized',
            },
            id: null,
          },
          403
        );
      }

      // Parse JSON-RPC request
      const body = await c.req.json();
      const isInitialize = isInitializeRequest(body);

      console.log('MCP POST request received (authenticated)');
      console.log('Request method:', body.method);
      console.log('Request ID:', body.id);
      console.log('User ID:', userId);
      console.log('GitHub Login:', c.env.props.githubLogin);

      // Initialize services
      const storage = new StorageService(c.env.SECOND_BRAIN_BUCKET);
      const rateLimiter = new RateLimiter(c.env.RATE_LIMIT_KV);

      // Check rate limit (check minute window - most strict)
      const rateLimitResult = await rateLimiter.checkRateLimit(userId, 'minute');
      if (!rateLimitResult.allowed) {
        return c.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32004,
              message: 'Rate limit exceeded',
              data: {
                retryAfter: rateLimitResult.retryAfter,
                limit: rateLimitResult.limit,
                remaining: rateLimitResult.remaining,
              },
            },
            id: body.id || null,
          },
          429,
          {
            'Retry-After': rateLimitResult.retryAfter?.toString() || '60',
          }
        );
      }

      // Extract session ID from headers
      const sessionId = c.req.header('mcp-session-id');
      console.log('Session ID:', sessionId || 'none');

      // Get or create transport
      const transport = getOrCreateTransport(sessionId, isInitialize);

      if (!transport) {
        console.log('No transport - invalid session or not initialize request');
        return c.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid session or missing session ID',
            },
            id: body.id || null,
          },
          400
        );
      }

      console.log('Transport created/retrieved, session:', transport.sessionId);

      // Create MCP server instance
      const server = createMCPServerInstance(storage, rateLimiter, c.env.ANALYTICS, userId);
      console.log('MCP server instance created for user:', userId);

      // Store session if this is a new initialize request
      if (isInitialize && transport.sessionId) {
        storeSession(transport.sessionId, transport, server);
      }

      // Connect server to transport if not already connected
      await server.connect(transport);

      // Handle the request through the transport
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
        },
      };

      // Handle the request
      await transport.handleRequest(c.req.raw as any, nodeResponse as any, body);

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
      console.error('MCP API handler error:', error);
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
          },
          id: null,
        },
        500
      );
    }
  });

  return app;
}

/**
 * Export the handler for OAuthProvider apiHandler configuration
 * Wrapper class required to bridge OAuthProvider's ctx.props to Hono's context
 */
export class MCPHandler {
  private honoApp = createMCPHandler();

  /**
   * Fetch handler called by OAuthProvider
   * OAuthProvider injects props into this.ctx after token validation
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Extract props from OAuthProvider's context
    // @ts-expect-error - OAuthProvider injects ctx.props dynamically
    const props = this.ctx?.props as MCPProps | undefined;

    // Create extended environment with props
    const extendedEnv: MCPEnv = {
      ...env,
      props: props || { userId: '', githubLogin: '' },
    };

    console.log('MCPHandler.fetch called with props:', props);

    // Call Hono app with extended environment
    return this.honoApp.fetch(request, extendedEnv, ctx);
  }
}
