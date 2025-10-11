/**
 * MCP API Handler
 * Handles authenticated MCP requests after OAuth validation by OAuthProvider
 * Direct Fetch API handler (no Hono)
 */

import {
  createMCPServerInstance,
  getOrCreateTransport,
  storeSession,
  isInitializeRequest,
} from './mcp-transport';
import { StorageService } from './storage';
import { RateLimiter } from './rate-limiting';
import { Logger, generateRequestId } from './logger';
import { Env } from './index';

/**
 * Props injected by OAuthProvider after token validation
 */
interface MCPProps {
  userId: string;
  githubLogin: string;
}

/**
 * Main MCP API handler
 * Called by OAuthProvider after validating the OAuth token
 * User information is available in ctx.props (injected by OAuthProvider)
 */
export async function mcpApiHandler(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const requestId = generateRequestId();
  const logger = new Logger({ requestId });
  const startTime = Date.now();

  logger.info('MCP request started', {
    method: request.method,
    url: request.url,
  });

  try {
    // Get user ID from props (set by OAuthProvider after token validation)
    const props = (ctx as any).props as MCPProps | undefined;
    const userId = props?.userId;

    if (!userId) {
      logger.warn('Unauthorized MCP request - missing user ID');
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32003,
            message: 'User not authorized',
          },
          id: null,
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Create child logger with user context
    const userLogger = logger.child({
      userId,
      githubLogin: props.githubLogin,
    });

    // Parse JSON-RPC request
    const body = await request.json() as any;
    const isInitialize = isInitializeRequest(body);

    userLogger.info('MCP request authenticated', {
      method: body.method,
      requestId: body.id,
      isInitialize,
    });

    // Initialize services
    const storage = new StorageService(env.SECOND_BRAIN_BUCKET);
    const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV);

    // Check rate limit (check minute window - most strict)
    const rateLimitResult = await rateLimiter.checkRateLimit(userId, 'minute');
    if (!rateLimitResult.allowed) {
      userLogger.warn('Rate limit exceeded', {
        window: 'minute',
        limit: rateLimitResult.limit,
        retryAfter: rateLimitResult.retryAfter,
      });
      return new Response(
        JSON.stringify({
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
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': rateLimitResult.retryAfter?.toString() || '60',
          },
        }
      );
    }

    // Extract session ID from headers
    const sessionId = request.headers.get('mcp-session-id');
    userLogger.debug('Session extracted', { sessionId: sessionId || 'none' });

    // Get or create transport
    const transport = getOrCreateTransport(sessionId || undefined, isInitialize);

    if (!transport) {
      userLogger.warn('Invalid transport - missing session or not initialize request');
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid session or missing session ID',
          },
          id: body.id || null,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const sessionLogger = userLogger.child({ sessionId: transport.sessionId });
    sessionLogger.debug('Transport created/retrieved');

    // Create MCP server instance
    const server = createMCPServerInstance(storage, rateLimiter, env.ANALYTICS, userId, sessionLogger);
    sessionLogger.debug('MCP server instance created');

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
        sessionLogger.debug('Response header set', { name, value });
        responseHeaders.set(name, value);
      },
      writeHead: (statusCode: number, headers?: Record<string, string>) => {
        sessionLogger.debug('Response writeHead called', { statusCode });
        responseStatus = statusCode;
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            responseHeaders.set(key, value);
          });
        }
      },
      write: (chunk: string) => {
        sessionLogger.debug('Response chunk written', { chunkLength: chunk?.length });
        responseChunks.push(chunk);
        return true;
      },
      end: (data?: string) => {
        sessionLogger.debug('Response end called', { dataLength: data?.length });
        if (data) {
          responseChunks.push(data);
        }
      },
      flushHeaders: () => {
        // No-op in our implementation
      },
      on: (event: string, callback: (...args: any[]) => void) => {
        // No-op in our implementation, but return this for chaining
        return nodeResponse;
      },
    };

    sessionLogger.debug('Handling MCP transport request');

    // Handle the request
    try {
      await transport.handleRequest(request as any, nodeResponse as any, body);
    } catch (err) {
      sessionLogger.error('Transport handleRequest failed', err as Error);
      throw err;
    }

    // Get the response body after transport.handleRequest has called end()
    const responseBody = responseChunks.join('');
    const duration = Date.now() - startTime;

    sessionLogger.info('MCP request completed', {
      status: responseStatus,
      bodyLength: responseBody.length,
      duration,
    });

    // Return the response
    return new Response(responseBody, {
      status: responseStatus,
      headers: responseHeaders,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('MCP API handler error', error as Error, { duration });
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
        },
        id: null,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Export the handler for OAuthProvider apiHandler configuration
 */
export const MCPHandler = {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    return mcpApiHandler(request, env, ctx);
  }
};
