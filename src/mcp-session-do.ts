/**
 * MCP Session Durable Object
 * Provides stateful session management for MCP transport instances
 * Each session gets its own Durable Object instance that persists across requests
 */

import { DurableObject } from 'cloudflare:workers';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StorageService } from './storage';
import { RateLimiter } from './rate-limiting';
import { Logger, generateRequestId } from './logger';
import { createMCPServerInstance, isInitializeRequest } from './mcp-transport';
import { Env } from './index';

/**
 * Props passed from the main worker (after OAuth validation)
 */
interface SessionProps {
  userId: string;
  githubLogin: string;
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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Set up periodic cleanup check (every 5 minutes)
    this.ctx.blockConcurrencyWhile(async () => {
      const alarm = await this.ctx.storage.getAlarm();
      if (!alarm) {
        // Schedule first alarm
        await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000);
      }
    });
  }

  /**
   * Alarm handler for session timeout cleanup
   */
  async alarm(): Promise<void> {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivity;

    if (timeSinceLastActivity > this.SESSION_TIMEOUT_MS) {
      // Session has timed out - clean up
      console.log(`Session ${this.sessionId} timed out after ${timeSinceLastActivity}ms of inactivity`);
      this.cleanup();
    }

    // Schedule next alarm
    await this.ctx.storage.setAlarm(now + 5 * 60 * 1000);
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
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const props: SessionProps = JSON.parse(propsHeader);
      const userLogger = logger.child({
        userId: props.userId,
        githubLogin: props.githubLogin,
        sessionId: this.sessionId,
      });

      // Parse request body only for POST requests
      let body: any = undefined;
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
        this.cleanup();
        return new Response(null, { status: 204 });
      }

      // Initialize transport and server if this is the first request (initialize)
      if (isInitialize && !this.transport) {
        userLogger.info('Creating new transport and server for session');

        // Get env from Durable Object context
        const env = this.env as Env;

        // Create transport
        this.transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => {
            // Generate session ID (UUID-like)
            const array = new Uint8Array(16);
            crypto.getRandomValues(array);
            return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
          },
          onsessioninitialized: (sessionId: string) => {
            this.sessionId = sessionId;
            userLogger.info('Session initialized in Durable Object', { sessionId });
          },
          onsessionclosed: (sessionId: string) => {
            userLogger.info('Session closed in Durable Object', { sessionId });
            this.cleanup();
          },
        });

        // Create server
        const storage = new StorageService(env.SECOND_BRAIN_BUCKET);
        const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV);
        this.server = createMCPServerInstance(
          storage,
          rateLimiter,
          env.ANALYTICS,
          props.userId,
          userLogger
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
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Handle the request through the transport
      const responseChunks: string[] = [];
      const responseHeaders = new Headers();
      let responseStatus = 200;

      // Create Node.js-compatible request object
      // The MCP SDK expects http.IncomingMessage properties
      const nodeRequest = {
        method: request.method,
        url: new URL(request.url).pathname + new URL(request.url).search,
        headers: Object.fromEntries(request.headers.entries()), // Convert Headers to plain object
        httpVersion: '1.1',
        on: () => nodeRequest,
        once: () => nodeRequest,
        emit: () => false,
        removeListener: () => nodeRequest,
      };

      const nodeResponse = {
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
          return nodeResponse;
        },
        flushHeaders: () => nodeResponse,
        on: (event: string, callback: (...args: any[]) => void) => nodeResponse,
      };

      // Handle request through transport
      await this.transport.handleRequest(nodeRequest as any, nodeResponse as any, body);

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
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.transport = undefined;
    this.server = undefined;
    this.sessionId = undefined;
  }
}
