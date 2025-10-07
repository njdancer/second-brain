/**
 * Tool Executor tests
 * Tests for the tool execution router
 */

import { executeTool, ToolContext } from '../../../src/tools/executor';
import { MockR2Bucket } from '../../mocks/r2';
import { MockKVNamespace } from '../../mocks/kv';
import { StorageService } from '../../../src/storage';
import { RateLimiter } from '../../../src/rate-limiting';

describe('Tool Executor', () => {
  let mockBucket: MockR2Bucket;
  let storage: StorageService;
  let rateLimitKV: MockKVNamespace;
  let rateLimiter: RateLimiter;
  let context: ToolContext;

  beforeEach(() => {
    mockBucket = new MockR2Bucket();
    storage = new StorageService(mockBucket as any);
    rateLimitKV = new MockKVNamespace();
    rateLimiter = new RateLimiter(rateLimitKV as any);
    context = {
      storage,
      rateLimiter,
      userId: 'test-user',
    };
  });

  describe('read tool', () => {
    it('should execute read tool successfully', async () => {
      const content = 'Test file content';
      await mockBucket.put('test.md', content);

      const result = await executeTool('read', { path: 'test.md' }, context);

      expect(result).toBe(content);
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        executeTool('read', { path: 'nonexistent.md' }, context)
      ).rejects.toThrow('File not found');
    });

    it('should throw error for invalid path', async () => {
      await expect(
        executeTool('read', { path: '' }, context)
      ).rejects.toThrow('path parameter is required');
    });
  });

  describe('write tool', () => {
    it('should execute write tool successfully', async () => {
      const result = await executeTool(
        'write',
        { path: 'new.md', content: 'New content' },
        context
      );

      expect(result).toContain('Successfully wrote');
      const stored = await mockBucket.get('new.md');
      expect(await stored?.text()).toBe('New content');
    });

    it('should throw error for missing content', async () => {
      await expect(
        executeTool('write', { path: 'test.md' }, context)
      ).rejects.toThrow();
    });

    it('should throw error for content too large', async () => {
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB

      await expect(
        executeTool('write', { path: 'large.md', content: largeContent }, context)
      ).rejects.toThrow('exceeds');
    });
  });

  describe('edit tool', () => {
    it('should execute edit tool successfully', async () => {
      await mockBucket.put('test.md', 'Old content');

      const result = await executeTool(
        'edit',
        { path: 'test.md', old_str: 'Old', new_str: 'New' },
        context
      );

      expect(result).toContain('Successfully edited');
      const stored = await mockBucket.get('test.md');
      expect(await stored?.text()).toBe('New content');
    });

    it('should throw error for non-unique string', async () => {
      await mockBucket.put('test.md', 'test test');

      await expect(
        executeTool('edit', { path: 'test.md', old_str: 'test', new_str: 'new' }, context)
      ).rejects.toThrow('not unique');
    });

    it('should delete file when delete=true', async () => {
      await mockBucket.put('test.md', 'content');

      const result = await executeTool(
        'edit',
        { path: 'test.md', delete: true },
        context
      );

      expect(result).toContain('Successfully deleted');
      const stored = await mockBucket.get('test.md');
      expect(stored).toBeNull();
    });
  });

  describe('glob tool', () => {
    it('should execute glob tool successfully', async () => {
      await mockBucket.put('file1.md', 'content1');
      await mockBucket.put('file2.md', 'content2');
      await mockBucket.put('file.txt', 'content3');

      const result = await executeTool('glob', { pattern: '*.md' }, context);

      expect(result).toContain('file1.md');
      expect(result).toContain('file2.md');
      expect(result).not.toContain('file.txt');
    });

    it('should throw error for invalid pattern', async () => {
      await expect(
        executeTool('glob', { pattern: '' }, context)
      ).rejects.toThrow('pattern parameter is required');
    });

    it('should return empty results when no matches', async () => {
      const result = await executeTool('glob', { pattern: '*.xyz' }, context);

      expect(result).toBe('[]');
    });
  });

  describe('grep tool', () => {
    it('should execute grep tool successfully', async () => {
      await mockBucket.put('test.md', 'Hello world\nFoo bar');

      const result = await executeTool('grep', { pattern: 'world' }, context);

      expect(result).toContain('test.md');
      expect(result).toContain('Hello world');
    });

    it('should throw error for invalid regex', async () => {
      await expect(
        executeTool('grep', { pattern: '[invalid' }, context)
      ).rejects.toThrow();
    });

    it('should return no matches when pattern not found', async () => {
      await mockBucket.put('test.md', 'content');

      const result = await executeTool('grep', { pattern: 'notfound' }, context);

      expect(result).toBe('[]');
    });
  });

  describe('unknown tool', () => {
    it('should throw error for unknown tool', async () => {
      await expect(
        executeTool('unknown-tool', {}, context)
      ).rejects.toThrow('Unknown tool: unknown-tool');
    });
  });

  describe('error handling', () => {
    it('should propagate errors from tools', async () => {
      // Try to read from a file that doesn't exist
      await expect(
        executeTool('read', { path: 'nonexistent.md' }, context)
      ).rejects.toThrow();
    });

    it('should handle storage errors gracefully', async () => {
      // Mock a storage error
      mockBucket.setFailure(true, 1);

      await expect(
        executeTool('read', { path: 'test.md' }, context)
      ).rejects.toThrow();
    });
  });
});
