/**
 * Unit tests for write tool implementation
 */

import { writeTool } from '../../../src/tools/write';
import type { QuotaStatus, StorageService } from '../../../src/storage';

// Mock storage service
class MockStorageService {
  private files: Map<string, string> = new Map();
  private quotaExceeded = false;

  putObject(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }

  getObject(path: string): Promise<string | null> {
    if (this.files.has(path)) {
      return Promise.resolve(this.files.get(path)!);
    }
    return Promise.resolve(null);
  }

  checkStorageQuota(_userId: string): Promise<QuotaStatus> {
    return Promise.resolve({
      withinQuota: !this.quotaExceeded,
      totalBytes: 1000,
      totalFiles: 10,
      maxBytes: 10 * 1024 * 1024 * 1024, // 10GB
      maxFiles: 10000,
      maxFileSize: 10 * 1024 * 1024, // 10MB
    });
  }

  setQuotaExceeded(exceeded: boolean): void {
    this.quotaExceeded = exceeded;
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }
}

describe('Write Tool', () => {
  let storage: MockStorageService;

  beforeEach(() => {
    storage = new MockStorageService();
  });

  describe('create new file', () => {
    it('should create new file', async () => {
      const content = 'Test file content';
      const result = await writeTool(
        { path: 'test.md', content },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(false);
      expect(result.content).toContain('Successfully wrote');
      expect(storage.getFile('test.md')).toBe(content);
    });

    it('should create file in nested directory', async () => {
      const content = 'Nested file';
      const result = await writeTool(
        { path: 'projects/myproject/notes.md', content },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('projects/myproject/notes.md')).toBe(content);
    });

    it('should handle unicode content', async () => {
      const content = '日本語 🎉 Émojis';
      const result = await writeTool(
        { path: 'unicode.md', content },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('unicode.md')).toBe(content);
    });

    it('should create empty file', async () => {
      const result = await writeTool(
        { path: 'empty.md', content: '' },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('empty.md')).toBe('');
    });
  });

  describe('overwrite existing file', () => {
    it('should overwrite existing file', async () => {
      await writeTool(
        { path: 'test.md', content: 'Original content' },
        storage as unknown as StorageService,
        'user123'
      );

      const result = await writeTool(
        { path: 'test.md', content: 'New content' },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('test.md')).toBe('New content');
    });

    it('should handle overwriting with larger content', async () => {
      await writeTool(
        { path: 'test.md', content: 'Small' },
        storage as unknown as StorageService,
        'user123'
      );

      const newContent = 'A'.repeat(1000);
      const result = await writeTool(
        { path: 'test.md', content: newContent },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('test.md')).toBe(newContent);
    });
  });

  describe('size validation', () => {
    it('should reject file exceeding 1MB limit', async () => {
      const largeContent = 'A'.repeat(2 * 1024 * 1024); // 2MB
      const result = await writeTool(
        { path: 'large.md', content: largeContent },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('exceeds');
      expect(result.content).toContain('1MB');
    });

    it('should accept file at 1MB limit', async () => {
      const content = 'A'.repeat(1024 * 1024); // Exactly 1MB
      const result = await writeTool(
        { path: 'maxsize.md', content },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(false);
    });

    it('should handle multi-byte characters in size calculation', async () => {
      const content = '日本語'.repeat(100000); // Multi-byte characters
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);

      const result = await writeTool(
        { path: 'unicode.md', content },
        storage as unknown as StorageService,
        'user123'
      );

      if (bytes.length > 1024 * 1024) {
        expect(result.isError).toBe(true);
      } else {
        expect(result.isError).toBe(false);
      }
    });
  });

  describe('path validation', () => {
    it('should reject empty path', async () => {
      const result = await writeTool(
        { path: '', content: 'test' },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('path');
    });

    it('should reject null path', async () => {
      const result = await writeTool(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        { path: null as any, content: 'test' },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(true);
    });

    it('should reject path with .. (directory traversal)', async () => {
      const result = await writeTool(
        { path: '../../../etc/passwd', content: 'test' },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Invalid path');
    });

    it('should accept valid nested paths', async () => {
      const result = await writeTool(
        { path: 'projects/app/design/notes.md', content: 'test' },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(false);
    });
  });

  describe('storage quota', () => {
    it('should reject write when quota exceeded', async () => {
      storage.setQuotaExceeded(true);

      const result = await writeTool(
        { path: 'test.md', content: 'test' },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('quota');
    });

    it('should allow write when within quota', async () => {
      storage.setQuotaExceeded(false);

      const result = await writeTool(
        { path: 'test.md', content: 'test' },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      const errorStorage = {
        putObject(): Promise<void> {
          return Promise.reject(new Error('Storage failure'));
        },
        checkStorageQuota(): Promise<QuotaStatus> {
          return Promise.resolve({
            withinQuota: true,
            totalBytes: 0,
            totalFiles: 0,
            maxBytes: 10 * 1024 * 1024 * 1024,
            maxFiles: 10000,
            maxFileSize: 10 * 1024 * 1024,
          });
        },
      };

      const result = await writeTool(
        { path: 'test.md', content: 'test' },
        errorStorage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(true);
      expect(result.content.toLowerCase()).toContain('error');
    });

    it('should validate content parameter', async () => {
      const result = await writeTool(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        { path: 'test.md', content: null as any },
        storage as unknown as StorageService,
        'user123'
      );

      expect(result.isError).toBe(true);
    });
  });

  describe('concurrent writes', () => {
    it('should handle concurrent writes to different files', async () => {
      const writes = [
        writeTool({ path: 'file1.md', content: 'Content 1' }, storage as unknown as StorageService, 'user123'),
        writeTool({ path: 'file2.md', content: 'Content 2' }, storage as unknown as StorageService, 'user123'),
        writeTool({ path: 'file3.md', content: 'Content 3' }, storage as unknown as StorageService, 'user123'),
      ];

      const results = await Promise.all(writes);

      expect(results.every((r) => !r.isError)).toBe(true);
      expect(storage.getFile('file1.md')).toBe('Content 1');
      expect(storage.getFile('file2.md')).toBe('Content 2');
      expect(storage.getFile('file3.md')).toBe('Content 3');
    });
  });
});
