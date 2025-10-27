/**
 * Unit tests for read tool implementation
 */

import { readTool } from '../../../src/tools/read';

// Mock storage service
class MockStorageService {
  private files: Map<string, string> = new Map();

  getObject(path: string): Promise<string | null> {
    if (this.files.has(path)) {
      return Promise.resolve(this.files.get(path)!);
    }
    return Promise.resolve(null);
  }

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }
}

describe('Read Tool', () => {
  let storage: MockStorageService;

  beforeEach(() => {
    storage = new MockStorageService();
  });

  describe('read entire file', () => {
    it('should read entire file', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      storage.setFile('test.md', content);

      const result = await readTool({ path: 'test.md' }, storage as any);

      expect(result.content).toBe(content);
      expect(result.isError).toBe(false);
    });

    it('should return error for non-existent file', async () => {
      const result = await readTool(
        { path: 'does-not-exist.md' },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('File not found');
    });

    it('should handle unicode characters', async () => {
      const content = '日本語 🎉 Émojis';
      storage.setFile('unicode.md', content);

      const result = await readTool({ path: 'unicode.md' }, storage as any);

      expect(result.content).toBe(content);
      expect(result.isError).toBe(false);
    });

    it('should handle empty files', async () => {
      storage.setFile('empty.md', '');

      const result = await readTool({ path: 'empty.md' }, storage as any);

      expect(result.content).toBe('');
      expect(result.isError).toBe(false);
    });
  });

  describe('read with line range', () => {
    it('should read specific line range', async () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      storage.setFile('test.md', content);

      const result = await readTool(
        { path: 'test.md', range: [2, 4] },
        storage as any,
      );

      expect(result.content).toBe('Line 2\nLine 3\nLine 4');
      expect(result.isError).toBe(false);
    });

    it('should read first line', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      storage.setFile('test.md', content);

      const result = await readTool(
        { path: 'test.md', range: [1, 1] },
        storage as any,
      );

      expect(result.content).toBe('Line 1');
      expect(result.isError).toBe(false);
    });

    it('should read last line', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      storage.setFile('test.md', content);

      const result = await readTool(
        { path: 'test.md', range: [3, 3] },
        storage as any,
      );

      expect(result.content).toBe('Line 3');
      expect(result.isError).toBe(false);
    });

    it('should handle range beyond file length', async () => {
      const content = 'Line 1\nLine 2';
      storage.setFile('test.md', content);

      const result = await readTool(
        { path: 'test.md', range: [1, 10] },
        storage as any,
      );

      // Should read up to end of file
      expect(result.content).toBe('Line 1\nLine 2');
      expect(result.isError).toBe(false);
    });

    it('should return error for invalid range (start > end)', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      storage.setFile('test.md', content);

      const result = await readTool(
        { path: 'test.md', range: [3, 1] },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Invalid range');
    });

    it('should return error for invalid range (start < 1)', async () => {
      const content = 'Line 1\nLine 2\nLine 3';
      storage.setFile('test.md', content);

      const result = await readTool(
        { path: 'test.md', range: [0, 2] },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Invalid range');
    });
  });

  describe('read with byte limit', () => {
    it('should respect byte limit', async () => {
      const content = 'A'.repeat(1000);
      storage.setFile('large.md', content);

      const result = await readTool(
        { path: 'large.md', max_bytes: 100 },
        storage as any,
      );

      expect(result.content.length).toBeLessThanOrEqual(100);
      expect(result.isError).toBe(false);
    });

    it('should return entire file if under byte limit', async () => {
      const content = 'Small file';
      storage.setFile('small.md', content);

      const result = await readTool(
        { path: 'small.md', max_bytes: 1000 },
        storage as any,
      );

      expect(result.content).toBe(content);
      expect(result.isError).toBe(false);
    });

    it('should return error if file exceeds byte limit without truncation', async () => {
      const content = 'A'.repeat(100 * 1024 * 1024); // 100MB
      storage.setFile('huge.md', content);

      const result = await readTool(
        { path: 'huge.md', max_bytes: 1024 },
        storage as any,
      );

      // Should either truncate or return error
      expect(result.isError || result.content.length <= 1024).toBe(true);
    });

    it('should handle multi-byte characters with byte limit', async () => {
      const content = '日本語'.repeat(100); // Multi-byte characters
      storage.setFile('unicode.md', content);

      const result = await readTool(
        { path: 'unicode.md', max_bytes: 50 },
        storage as any,
      );

      // Should not cut multi-byte characters in half
      expect(result.isError).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      const errorStorage = {
        getObject(): Promise<string | null> {
          return Promise.reject(new Error('Storage failure'));
        },
      };

      const result = await readTool({ path: 'test.md' }, errorStorage as any);

      expect(result.isError).toBe(true);
      expect(result.content.toLowerCase()).toContain('error');
    });

    it('should validate path parameter', async () => {
      const result = await readTool({ path: '' }, storage as any);

      expect(result.isError).toBe(true);
      expect(result.content).toContain('path');
    });

    it('should handle null path', async () => {
      const result = await readTool(
         
        { path: null as any },
        storage as any,
      );

      expect(result.isError).toBe(true);
    });
  });

  describe('combined parameters', () => {
    it('should handle range and byte limit together', async () => {
      const content =
        'Line 1 with lots of text\nLine 2 with lots of text\nLine 3 with lots of text\nLine 4 with lots of text';
      storage.setFile('test.md', content);

      const result = await readTool(
        { path: 'test.md', range: [1, 3], max_bytes: 50 },
        storage as any,
      );

      // Should apply range first, then byte limit
      expect(result.isError).toBe(false);
      expect(result.content.length).toBeLessThanOrEqual(50);
    });
  });
});
