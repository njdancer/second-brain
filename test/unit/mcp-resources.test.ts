/**
 * Tests for MCP resource handlers
 */

import { createMCPServerInstance } from '../../src/mcp-transport';
import { StorageService } from '../../src/storage';
import { RateLimiter } from '../../src/rate-limiting';
import { Logger } from '../../src/logger';
import { MockR2Bucket } from '../mocks/r2';
import { MockKVNamespace } from '../mocks/kv';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

describe('MCP Resource Handlers', () => {
  let storage: StorageService;
  let rateLimiter: RateLimiter;
  let mockR2: MockR2Bucket;
  let mockKV: MockKVNamespace;
  let analytics: any;
  let logger: Logger;
  let server: ReturnType<typeof createMCPServerInstance>;

  beforeEach(() => {
    mockR2 = new MockR2Bucket();
    mockKV = new MockKVNamespace();
    storage = new StorageService(mockR2 as any);
    rateLimiter = new RateLimiter(mockKV as any);
    analytics = {
      writeDataPoint: jest.fn(),
    };
    logger = new Logger({ requestId: 'test-request-id' });
    server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);
  });

  describe('Server Capabilities', () => {
    it('should have resource handlers registered', () => {
      // Check that resource handlers are registered
      const handlers = (server as any)._requestHandlers;
      expect(handlers.has('resources/list')).toBe(true);
      expect(handlers.has('resources/read')).toBe(true);
      expect(handlers.has('resources/templates/list')).toBe(true);
    });
  });

  describe('resources/list', () => {
    it('should list all files as resources', async () => {
      // Create test files
      await storage.putObject('projects/app/notes.md', '# App Notes\n\nSome content');
      await storage.putObject('areas/health/workout.md', '# Workout Plan\n\nExercises');
      await storage.putObject('resources/tech/rust.md', '# Rust Learning\n\nNotes');

      const handler = (server as any)._requestHandlers.get('resources/list');
      expect(handler).toBeDefined();

      const result = await handler({
        method: 'resources/list',
        params: {},
      });

      expect(result.resources).toHaveLength(3);

      // Check first resource structure
      const firstResource = result.resources[0];
      expect(firstResource).toMatchObject({
        uri: expect.stringMatching(/^file:\/\/\//),
        name: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        mimeType: 'text/markdown',
        annotations: {
          audience: ['user'],
          priority: 0.5,
          lastModified: expect.any(String),
        },
      });

      // Check URIs
      const uris = result.resources.map((r: any) => r.uri);
      expect(uris).toContain('file:///projects/app/notes.md');
      expect(uris).toContain('file:///areas/health/workout.md');
      expect(uris).toContain('file:///resources/tech/rust.md');
    });

    it('should handle empty storage', async () => {
      const handler = (server as any)._requestHandlers.get('resources/list');
      const result = await handler({
        method: 'resources/list',
        params: {},
      });

      expect(result.resources).toEqual([]);
    });

    it('should set correct MIME type for markdown files', async () => {
      await storage.putObject('test.md', '# Test');

      const handler = (server as any)._requestHandlers.get('resources/list');
      const result = await handler({
        method: 'resources/list',
        params: {},
      });

      expect(result.resources[0].mimeType).toBe('text/markdown');
    });

    it('should set plain text MIME type for non-markdown files', async () => {
      await storage.putObject('test.txt', 'Plain text');

      const handler = (server as any)._requestHandlers.get('resources/list');
      const result = await handler({
        method: 'resources/list',
        params: {},
      });

      expect(result.resources[0].mimeType).toBe('text/plain');
    });
  });

  describe('resources/read', () => {
    it('should read resource by URI', async () => {
      const content = '# Test Document\n\nThis is test content.';
      await storage.putObject('projects/test/doc.md', content);

      const handler = (server as any)._requestHandlers.get('resources/read');
      const result = await handler({
        method: 'resources/read',
        params: {
          uri: 'file:///projects/test/doc.md',
        },
      });

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toMatchObject({
        uri: 'file:///projects/test/doc.md',
        name: 'doc.md',
        title: 'projects/test/doc.md',
        mimeType: 'text/markdown',
        text: content,
        annotations: {
          audience: ['user'],
          priority: 0.5,
          lastModified: expect.any(String),
        },
      });
    });

    it('should throw error for non-existent resource', async () => {
      const handler = (server as any)._requestHandlers.get('resources/read');

      await expect(
        handler({
          method: 'resources/read',
          params: {
            uri: 'file:///nonexistent.md',
          },
        })
      ).rejects.toThrow('Resource not found');
    });

    it('should throw error for unsupported URI scheme', async () => {
      const handler = (server as any)._requestHandlers.get('resources/read');

      await expect(
        handler({
          method: 'resources/read',
          params: {
            uri: 'https://example.com/file.md',
          },
        })
      ).rejects.toThrow('Unsupported URI scheme');
    });

    it('should handle files without metadata', async () => {
      await storage.putObject('test.md', '# Test');

      const handler = (server as any)._requestHandlers.get('resources/read');
      const result = await handler({
        method: 'resources/read',
        params: {
          uri: 'file:///test.md',
        },
      });

      expect(result.contents[0].text).toBe('# Test');
      expect(result.contents[0].annotations).toBeDefined();
    });
  });

  describe('resources/templates/list', () => {
    it('should return resource template for second brain documents', async () => {
      const handler = (server as any)._requestHandlers.get('resources/templates/list');
      const result = await handler({
        method: 'resources/templates/list',
        params: {},
      });

      expect(result.resourceTemplates).toHaveLength(1);
      expect(result.resourceTemplates[0]).toMatchObject({
        uriTemplate: 'file:///{path}',
        name: 'Second Brain Documents',
        title: '🧠 Second Brain Documents',
        description: expect.stringContaining('Access any document'),
        mimeType: 'text/markdown',
        annotations: {
          audience: ['user'],
          priority: 0.7,
        },
      });
    });
  });

  describe('Integration with existing tools', () => {
    it('should work alongside tool handlers', async () => {
      // Create a file
      await storage.putObject('test.md', '# Test');

      // List resources
      const listHandler = (server as any)._requestHandlers.get('resources/list');
      const listResult = await listHandler({
        method: 'resources/list',
        params: {},
      });

      expect(listResult.resources).toHaveLength(1);

      // Read resource
      const readHandler = (server as any)._requestHandlers.get('resources/read');
      const readResult = await readHandler({
        method: 'resources/read',
        params: {
          uri: 'file:///test.md',
        },
      });

      expect(readResult.contents[0].text).toBe('# Test');
    });
  });
});
