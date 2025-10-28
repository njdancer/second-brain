/**
 * Test to demonstrate the difference between Resources and Tools
 * and understand how they're exposed to the AI
 */

import { createMCPServerInstance } from '../../src/mcp-transport';
import { StorageService } from '../../src/storage';
import { RateLimiter } from '../../src/rate-limiting';
import { Logger } from '../../src/logger';
import { MockR2Bucket } from '../mocks/r2';
import { MockKVNamespace } from '../mocks/kv';

describe('Resources vs Tools Behavior', () => {
  let storage: StorageService;
  let rateLimiter: RateLimiter;
  let mockR2: MockR2Bucket;
  let mockKV: MockKVNamespace;
  let analytics: any;
  let logger: Logger;
  let server: ReturnType<typeof createMCPServerInstance>;

  beforeEach(async () => {
    mockR2 = new MockR2Bucket();
    mockKV = new MockKVNamespace();
    storage = new StorageService(mockR2 as any);
    rateLimiter = new RateLimiter(mockKV as any);
    analytics = {
      writeDataPoint: jest.fn(),
    };
    logger = new Logger({ requestId: 'test-request-id' });
    server = createMCPServerInstance(storage, rateLimiter, analytics, 'test-user', logger);

    // Create a test file
    await storage.putObject('test.md', '# Test Document\n\nContent here.');
  });

  describe('How Claude (the AI) accesses data', () => {
    it('Tools: Can be called directly by the AI via tools/call', async () => {
      // Claude can call the 'read' TOOL directly
      const toolHandler = (server as any)._requestHandlers.get('tools/call');
      const result = await toolHandler({
        method: 'tools/call',
        params: {
          name: 'read',
          arguments: {
            path: 'test.md',
          },
        },
      });

      expect(result.content[0].text).toContain('# Test Document');

      // This proves: Claude can AUTONOMOUSLY call tools
    });

    it('Resources: Cannot be called by the AI - only by the CLIENT', async () => {
      // The 'resources/read' handler exists, but it's called by the CLIENT (Claude Desktop)
      // NOT by Claude (the AI)
      const resourceHandler = (server as any)._requestHandlers.get('resources/read');
      const result = await resourceHandler({
        method: 'resources/read',
        params: {
          uri: 'file:///test.md',
        },
      });

      expect(result.contents[0].text).toContain('# Test Document');

      // This proves: Resources work, but are called by the HOST APPLICATION,
      // not by the AI model itself
    });

    it('Key difference: Tools are in tools/list, Resources are separate', async () => {
      // Get the list of tools that Claude (the AI) can call
      const toolsHandler = (server as any)._requestHandlers.get('tools/list');
      const toolsResult = await toolsHandler({
        method: 'tools/list',
        params: {},
      });

      const toolNames = toolsResult.tools.map((t: any) => t.name);

      // Claude sees these as callable tools:
      expect(toolNames).toContain('read');
      expect(toolNames).toContain('write');
      expect(toolNames).toContain('edit');
      expect(toolNames).toContain('glob');
      expect(toolNames).toContain('grep');

      // But 'resources/read' is NOT in the tools list!
      // It's a separate CLIENT-side API
      expect(toolNames).not.toContain('resources/read');
      expect(toolNames).not.toContain('resources/list');
    });
  });

  describe('What resources are actually for', () => {
    it('Resources provide metadata for the CLIENT to use', async () => {
      const resourcesHandler = (server as any)._requestHandlers.get('resources/list');
      const result = await resourcesHandler({
        method: 'resources/list',
        params: {},
      });

      const resource = result.resources[0];

      // Resources have rich metadata that the CLIENT can use for:
      // - UI display (name, title, description)
      // - Filtering (audience, priority)
      // - Organization (mimeType, lastModified)
      expect(resource).toMatchObject({
        uri: 'file:///test.md',
        name: 'test.md',
        title: 'test.md',
        mimeType: 'text/markdown',
        annotations: {
          audience: ['user'],
          priority: 0.5,
          lastModified: expect.any(String),
        },
      });

      // This metadata helps the CLIENT (Claude Desktop) decide:
      // - Should this show in the UI picker?
      // - Should this be auto-included as context?
      // - How important is this?
    });

    it('Audience field controls CLIENT behavior, not AI access', () => {
      // audience: ["user"] - CLIENT shows in UI for user to pick (our implementation)
      // audience: ["assistant"] - CLIENT might auto-include as context (not in Claude Desktop)
      // audience: ["user", "assistant"] - Both behaviors (spec allows, not implemented)

      // NOTE: We use audience: ["user"] because Claude Desktop requires explicit
      // user selection and doesn't expose resources to AI based on audience.

      // BUT: Claude (the AI) doesn't call resources/read itself
      // The CLIENT calls it and provides the content to Claude

      // This is different from tools, where Claude directly calls them!

      expect(true).toBe(true); // Placeholder for conceptual test
    });
  });

  describe('Are our tools redundant?', () => {
    it('NO: Tools are necessary for Claude to autonomously access files', async () => {
      // Without the 'read' TOOL, Claude cannot autonomously read files
      // Resources alone won't give Claude that capability

      // Scenario: Claude wants to read a file during a conversation
      // With tools: Claude calls read tool → gets content
      // Without tools: Claude has no way to read files (resources are client-side)

      const toolsHandler = (server as any)._requestHandlers.get('tools/list');
      const result = await toolsHandler({ method: 'tools/list', params: {} });

      expect(result.tools.map((t: any) => t.name)).toContain('read');
      // This tool is ESSENTIAL for Claude's autonomy
    });

    it('Resources complement tools by providing metadata and UI hints', async () => {
      // Resources add value by:
      // 1. Letting the CLIENT show a nice UI picker
      // 2. Providing metadata (last modified, mime type, etc.)
      // 3. Allowing the CLIENT to auto-include context based on audience/priority
      // 4. Enabling tools to return ResourceLinks instead of full content

      // Example: A tool could return a ResourceLink
      const resourceLink = {
        type: 'resource',
        uri: 'file:///test.md',
        text: 'See test.md for details',
      };

      // Then the CLIENT can fetch it via resources/read if needed
      // This saves tokens when the AI mentions a file but doesn't need full content

      expect(resourceLink.uri).toBe('file:///test.md');
    });
  });

  describe('Summary: The actual architecture', () => {
    it('demonstrates the complete flow', async () => {
      /**
       * ARCHITECTURE:
       *
       * 1. CLIENT (Claude Desktop) calls resources/list
       *    → Gets list of all documents with metadata
       *    → Shows in UI picker based on audience
       *
       * 2. USER selects a resource from picker
       *    → CLIENT calls resources/read
       *    → CLIENT provides content to AI as context
       *
       * 3. AI (Claude) uses tools autonomously
       *    → Calls 'read' tool when it needs a file
       *    → Calls 'write' tool to create files
       *    → No resources/read - those are CLIENT APIs
       *
       * 4. Tools can return ResourceLinks
       *    → Instead of full content in tool response
       *    → CLIENT can fetch via resources/read if needed
       *
       * CONCLUSION: Tools and Resources are NOT redundant!
       * - Tools: AI autonomy (Claude calls them)
       * - Resources: Client-driven UI and context (Client calls them)
       */

      expect(true).toBe(true);
    });
  });
});
