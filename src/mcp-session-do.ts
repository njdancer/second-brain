/**
 * MCP Session Durable Object
 * Provides stateful session management for MCP transport instances
 * Each session gets its own Durable Object instance that persists across requests
 */

import { DurableObject } from 'cloudflare:workers';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StorageService } from './storage';
import { RateLimiter } from './rate-limiting';
import { Logger, generateRequestId } from './logger';
import { createMCPServerInstance, isInitializeRequest } from './mcp-transport';
import type { Env } from './index';

/**
 * Props passed from the main worker (after OAuth validation)
 */
interface SessionProps {
  userId: string;
  githubLogin: string;
  sessionId: string; // Session ID from Worker (used as DO name)
}

/**
 * MCP JSON-RPC request body interface
 */
interface MCPRequestBody {
  jsonrpc: '2.0';
  method: string;
  id: string | number | null;
  params?: Record<string, unknown>;
}

/**
 * Node.js-like IncomingMessage interface for MCP SDK compatibility
 */
interface NodeIncomingMessage {
  method: string;
  url: string;
  headers: Record<string, string>;
  httpVersion: string;
  on: () => NodeIncomingMessage;
  once: () => NodeIncomingMessage;
  emit: () => boolean;
  removeListener: () => NodeIncomingMessage;
}

/**
 * Node.js-like ServerResponse interface for MCP SDK compatibility
 */
interface NodeServerResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => NodeServerResponse;
  writeHead: (statusCode: number, headers?: Record<string, string>) => NodeServerResponse;
  write: (chunk: string) => boolean;
  end: (data?: string) => NodeServerResponse;
  flushHeaders: () => NodeServerResponse;
  on: (_event: string, _callback: (...args: unknown[]) => void) => NodeServerResponse;
}

/**
 * MCPSessionDurableObject - Holds MCP transport and server for a single session
 * Each session ID maps to one instance of this Durable Object
 */
export class MCPSessionDurableObject extends DurableObject {
  private transport?: StreamableHTTPServerTransport;
  private server?: Server;
  private sessionId?: string;
  private lastActivity: number = Date.now();
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private isActive: boolean = false; // Track if session is active

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Don't schedule alarm in constructor - only schedule when session is initialized
    // This prevents zombie alarms for DOs that never receive requests
  }

  /**
   * Alarm handler for session timeout cleanup
   */
  async alarm(): Promise<void> {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivity;

    if (timeSinceLastActivity > this.SESSION_TIMEOUT_MS) {
      // Session has timed out - clean up
      console.log(
        `Session ${this.sessionId} timed out after ${timeSinceLastActivity}ms of inactivity`,
      );
      await this.cleanup();
      // Don't reschedule after cleanup
      return;
    }

    // Only reschedule if session is still active
    if (this.isActive) {
      await this.ctx.storage.setAlarm(now + 5 * 60 * 1000);
    }
  }

  /**
   * Main request handler - routes all MCP requests
   */
  async fetch(request: Request): Promise<Response> {
    const requestId = generateRequestId();
    const logger = new Logger({ requestId });

    try {
      // Update last activity timestamp
      this.lastActivity = Date.now();

      // Get props from headers (set by mcp-api-handler)
      const propsHeader = request.headers.get('x-mcp-props');
      if (!propsHeader) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32003, message: 'Missing session props' },
            id: null,
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const props = JSON.parse(propsHeader) as SessionProps;
      const userLogger = logger.child({
        userId: props.userId,
        githubLogin: props.githubLogin,
        sessionId: this.sessionId,
      });

      // Parse request body only for POST requests
      let body: MCPRequestBody | undefined = undefined;
      if (request.method === 'POST') {
        body = await request.json();
      }

      const isInitialize = body ? isInitializeRequest(body) : false;

      userLogger.info('Durable Object handling request', {
        httpMethod: request.method,
        method: body?.method,
        isInitialize,
        hasTransport: !!this.transport,
      });

      // Handle DELETE - terminate session
      if (request.method === 'DELETE') {
        userLogger.info('Terminating session');
        await this.cleanup();
        return new Response(null, { status: 204 });
      }

      // Initialize transport and server if this is the first request (initialize)
      if (isInitialize && !this.transport) {
        userLogger.info('Creating new transport and server for session');

        // Get session ID from Worker props (this is the same ID client receives in header)
        // This ensures the transport uses the SAME session ID that the client receives
        const doSessionId = props.sessionId;
        this.sessionId = doSessionId;
        this.isActive = true; // Mark session as active

        userLogger.info('Using session ID from Worker props', { sessionId: doSessionId });

        // Schedule first alarm for cleanup checks (every 5 minutes)
        await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000);

        // Get env from Durable Object context
        const env = this.env as Env;

        // Create transport with JSON response mode (instead of SSE)
        // Return our session ID instead of generating a new one
        this.transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => {
            // Return the session ID from the Durable Object name
            // This ensures consistency between client, Worker, and transport
            return doSessionId;
          },
          onsessioninitialized: (sessionId: string) => {
            userLogger.info('Session initialized in transport', { sessionId });
          },
          onsessionclosed: async (sessionId: string) => {
            userLogger.info('Session closed in transport', { sessionId });
            await this.cleanup();
          },
          enableJsonResponse: true, // Use JSON responses instead of SSE streams
        });

        // Create server
        const storage = new StorageService(env.SECOND_BRAIN_BUCKET);
        const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV);
        this.server = createMCPServerInstance(
          storage,
          rateLimiter,
          env.ANALYTICS,
          props.userId,
          userLogger,
        );

        // Connect server to transport
        await this.server.connect(this.transport);

        userLogger.info('Transport and server connected');
      }

      // Validate we have a transport
      if (!this.transport || !this.server) {
        userLogger.warn('No transport available - session not initialized');
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Session not initialized. Send initialize request first.',
            },
            id: body?.id || null,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Handle the request through the transport
      const responseChunks: string[] = [];
      const responseHeaders = new Headers();
      let responseStatus = 200;

      // Create a promise that resolves when response.end() is called
      let endResolver: () => void;
      const endPromise = new Promise<void>((resolve) => {
        endResolver = resolve;
      });

      // Create Node.js-compatible request object
      // The MCP SDK expects http.IncomingMessage properties
      const nodeRequest: NodeIncomingMessage = {
        method: request.method,
        url: new URL(request.url).pathname + new URL(request.url).search,
        headers: Object.fromEntries(request.headers.entries()), // Convert Headers to plain object
        httpVersion: '1.1',
        on: () => nodeRequest,
        once: () => nodeRequest,
        emit: () => false,
        removeListener: () => nodeRequest,
      };

      const nodeResponse: NodeServerResponse = {
        statusCode: 200,
        setHeader: (name: string, value: string) => {
          responseHeaders.set(name, value);
          return nodeResponse;
        },
        writeHead: (statusCode: number, headers?: Record<string, string>) => {
          responseStatus = statusCode;
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              responseHeaders.set(key, value);
            });
          }
          return nodeResponse;
        },
        write: (chunk: string) => {
          responseChunks.push(chunk);
          return true;
        },
        end: (data?: string) => {
          if (data) {
            responseChunks.push(data);
          }
          // Resolve the promise when end is called
          endResolver();
          return nodeResponse;
        },
        flushHeaders: () => nodeResponse,
        on: (_event: string, _callback: (...args: unknown[]) => void) => nodeResponse,
      };

      // Handle request through transport
      // Pass pre-parsed body as third parameter (per MCP SDK documentation)
      // Type system boundary: adapting Workers Request/Response to Node.js IncomingMessage/ServerResponse that MCP SDK expects
      const handlePromise = this.transport.handleRequest(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        nodeRequest as any,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        nodeResponse as any,
        body,
      );

      // Wait for BOTH handleRequest to complete AND end() to be called
      await Promise.all([handlePromise, endPromise]);

      const responseBody = responseChunks.join('');

      userLogger.info('Request handled successfully', {
        status: responseStatus,
        bodyLength: responseBody.length,
      });

      return new Response(responseBody, {
        status: responseStatus,
        headers: responseHeaders,
      });
    } catch (error) {
      logger.error('Durable Object request failed', error as Error);
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    this.isActive = false; // Mark session as inactive
    this.transport = undefined;
    this.server = undefined;
    this.sessionId = undefined;

    // Cancel any pending alarms to prevent zombie alarms
    await this.ctx.storage.deleteAlarm();
  }
}
