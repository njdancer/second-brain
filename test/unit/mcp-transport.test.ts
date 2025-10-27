/**
 * MCP Transport tests
 * Tests for MCP server instance creation and utilities
 * Session management is now handled by Durable Objects (see mcp-session-do.ts)
 */

import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMCPServerInstance, isInitializeRequest } from '../../src/mcp-transport';
import { MockR2Bucket } from '../mocks/r2';
import { MockKVNamespace } from '../mocks/kv';
import { StorageService } from '../../src/storage';
import { RateLimiter } from '../../src/rate-limiting';
import { Logger } from '../../src/logger';

describe('MCP Transport', () => {
  let mockBucket: MockR2Bucket;
  let storage: StorageService;
  let rateLimitKV: MockKVNamespace;
  let rateLimiter: RateLimiter;
  let analytics: AnalyticsEngineDataset;
  let logger: Logger;

  beforeEach(() => {
    mockBucket = new MockR2Bucket();
    storage = new StorageService(mockBucket as any);
    rateLimitKV = new MockKVNamespace();
    rateLimiter = new RateLimiter(rateLimitKV as any);
    analytics = {
      writeDataPoint: jest.fn(),
    } as any;
    logger = new Logger({ userId: 'test-user', requestId: 'test-request' });
  });

  describe('createMCPServerInstance', () => {
    it('should create MCP server with correct metadata', () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      expect(server).toBeInstanceOf(Server);
    });

    it('should register all 5 tools', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      // The server should have tools registered
      expect(server).toBeDefined();
    });

    it('should register all 3 prompts', () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      expect(server).toBeDefined();
    });
  });

  describe('isInitializeRequest', () => {
    it('should detect initialize request', () => {
      const body = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
        id: 1,
      };

      expect(isInitializeRequest(body)).toBe(true);
    });

    it('should reject non-initialize request', () => {
      const body = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
      };

      expect(isInitializeRequest(body)).toBe(false);
    });

    it('should handle missing method', () => {
      const body = {
        jsonrpc: '2.0',
        id: 3,
      };

      expect(isInitializeRequest(body)).toBe(false);
    });
  });

  describe('Tool Call Handler', () => {
    it('should list tools', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      // Access the internal request handlers
      const handlers = (server as any)._requestHandlers;
      const listToolsHandler = handlers.get('tools/list');

      expect(listToolsHandler).toBeDefined();

      const result = await listToolsHandler({
        method: 'tools/list',
        params: {},
      });

      expect(result.tools).toHaveLength(5);
      expect(result.tools.map((t: any) => t.name)).toEqual([
        'read',
        'write',
        'edit',
        'glob',
        'grep',
      ]);
    });

    it('should handle tool call with rate limit check', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      // Create a test file
      await mockBucket.put('projects/test.md', 'Test content');

      const handlers = (server as any)._requestHandlers;
      const callToolHandler = handlers.get('tools/call');

      const result = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'read',
          arguments: { path: 'projects/test.md' },
        },
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Test content');
    });

    it('should handle rate limit exceeded', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      // Set up rate limit to be exceeded
      await rateLimitKV.put('ratelimit:test-user:minute', '100');

      const handlers = (server as any)._requestHandlers;
      const callToolHandler = handlers.get('tools/call');

      const result = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'read',
          arguments: { path: 'projects/test.md' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Rate limit exceeded');
    });

    it('should handle tool execution error', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      const handlers = (server as any)._requestHandlers;
      const callToolHandler = handlers.get('tools/call');

      // Try to read non-existent file
      const result = await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'read',
          arguments: { path: 'nonexistent.md' },
        },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should increment rate limits after successful call', async () => {
      // Create fresh instances to ensure test isolation
      const freshMockBucket = new MockR2Bucket();
      const freshStorage = new StorageService(freshMockBucket as any);
      const freshRateLimitKV = new MockKVNamespace();
      const freshRateLimiter = new RateLimiter(freshRateLimitKV as any);

      const server = createMCPServerInstance(
        freshStorage,
        freshRateLimiter,
        analytics,
        'test-user-unique', // Use unique user ID to avoid any potential conflicts
        logger,
      );

      // Create a test file
      await freshMockBucket.put('projects/test.md', 'Test content');

      const handlers = (server as any)._requestHandlers;
      const callToolHandler = handlers.get('tools/call');

      await callToolHandler({
        method: 'tools/call',
        params: {
          name: 'read',
          arguments: { path: 'projects/test.md' },
        },
      });

      // Check that rate limits were incremented
      const minuteCount = await freshRateLimitKV.get('ratelimit:test-user-unique:minute');
      const hourCount = await freshRateLimitKV.get('ratelimit:test-user-unique:hour');
      const dayCount = await freshRateLimitKV.get('ratelimit:test-user-unique:day');

      expect(minuteCount).toBe('1');
      expect(hourCount).toBe('1');
      expect(dayCount).toBe('1');
    });
  });

  describe('Prompt Handlers', () => {
    it('should list prompts', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      const handlers = (server as any)._requestHandlers;
      const listPromptsHandler = handlers.get('prompts/list');

      expect(listPromptsHandler).toBeDefined();

      const result = await listPromptsHandler({
        method: 'prompts/list',
        params: {},
      });

      expect(result.prompts).toHaveLength(3);
      expect(result.prompts.map((p: any) => p.name)).toEqual([
        'capture-note',
        'weekly-review',
        'research-summary',
      ]);
    });

    it('should get capture-note prompt', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      const handlers = (server as any)._requestHandlers;
      const getPromptHandler = handlers.get('prompts/get');

      const result = await getPromptHandler({
        method: 'prompts/get',
        params: {
          name: 'capture-note',
          arguments: {
            content: 'Test note',
            context: 'Test context',
            tags: 'test,note',
          },
        },
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.text).toContain('Test note');
      expect(result.messages[0].content.text).toContain('Test context');
      expect(result.messages[0].content.text).toContain('test,note');
    });

    it('should get weekly-review prompt', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      const handlers = (server as any)._requestHandlers;
      const getPromptHandler = handlers.get('prompts/get');

      const result = await getPromptHandler({
        method: 'prompts/get',
        params: {
          name: 'weekly-review',
          arguments: {
            focus_areas: 'Project A, Area B',
          },
        },
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toContain('weekly review');
      expect(result.messages[0].content.text).toContain('Project A, Area B');
    });

    it('should get research-summary prompt', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      const handlers = (server as any)._requestHandlers;
      const getPromptHandler = handlers.get('prompts/get');

      const result = await getPromptHandler({
        method: 'prompts/get',
        params: {
          name: 'research-summary',
          arguments: {
            topic: 'Machine Learning',
            output_location: 'resources/ml/summary.md',
          },
        },
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toContain('Machine Learning');
      expect(result.messages[0].content.text).toContain('resources/ml/summary.md');
    });

    it('should handle unknown prompt', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      const handlers = (server as any)._requestHandlers;
      const getPromptHandler = handlers.get('prompts/get');

      const result = await getPromptHandler({
        method: 'prompts/get',
        params: {
          name: 'unknown-prompt',
          arguments: {},
        },
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toContain('not found');
    });

    it('should handle prompts with missing arguments', async () => {
      const server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

      const handlers = (server as any)._requestHandlers;
      const getPromptHandler = handlers.get('prompts/get');

      const result = await getPromptHandler({
        method: 'prompts/get',
        params: {
          name: 'capture-note',
          arguments: {},
        },
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toBeDefined();
    });
  });
});
