/**
 * MCP API Handler
 * Handles authenticated MCP requests after OAuth validation by OAuthProvider
 * Routes requests to Durable Objects for stateful session management
 * Direct Fetch API handler (no Hono)
 */

import { isInitializeRequest } from './mcp-transport';
import { RateLimiter } from './rate-limiting';
import { MonitoringService } from './monitoring';
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

    // Parse JSON body only for POST requests
    // GET is used for SSE streaming, DELETE for session termination
    let body: any = undefined;
    if (request.method === 'POST') {
      body = await request.json();
    }

    const isInitialize = body ? isInitializeRequest(body) : false;

    userLogger.info('MCP request authenticated', {
      httpMethod: request.method,
      method: body?.method,
      requestId: body?.id,
      isInitialize,
    });

    // Initialize services
    const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV);
    const monitoring = new MonitoringService(env.ANALYTICS);

    // Check rate limit (check minute window - most strict)
    const rateLimitResult = await rateLimiter.checkRateLimit(userId, 'minute');
    if (!rateLimitResult.allowed) {
      userLogger.warn('Rate limit exceeded', {
        window: 'minute',
        limit: rateLimitResult.limit,
        retryAfter: rateLimitResult.retryAfter,
      });

      // Record rate limit hit to Analytics Engine
      await monitoring.recordRateLimitHit(userId, 'minute', rateLimitResult.limit);

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
          id: body?.id || null,
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

    // Extract or generate session ID
    let sessionId = request.headers.get('mcp-session-id');

    // For initialize requests without a session ID, generate one
    if (isInitialize && !sessionId) {
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);
      sessionId = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
      userLogger.info('Generated new session ID for initialize request', { sessionId });
    }

    if (!sessionId) {
      userLogger.warn('Missing session ID for non-initialize request');
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Missing session ID. Initialize a session first.',
          },
          id: body?.id || null,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const sessionLogger = userLogger.child({ sessionId });

    // Get Durable Object stub for this session
    const durableObjectId = env.MCP_SESSIONS.idFromName(sessionId);
    const durableObject = env.MCP_SESSIONS.get(durableObjectId);

    sessionLogger.info('Routing to Durable Object', {
      durableObjectId: durableObjectId.toString(),
    });

    // Create new request with props in header (for Durable Object)
    const propsHeader = JSON.stringify({
      userId,
      githubLogin: props.githubLogin,
    });

    const durableRequest = new Request(request.url, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'x-mcp-props': propsHeader,
      },
      body: request.method === 'POST' ? JSON.stringify(body) : undefined,
    });

    // Forward request to Durable Object
    const response = await durableObject.fetch(durableRequest);

    const duration = Date.now() - startTime;

    sessionLogger.info('MCP request completed', {
      status: response.status,
      duration,
    });

    // Add session ID to response headers for client to use in subsequent requests
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('mcp-session-id', sessionId);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
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
