/**
 * Unit tests for storage abstraction
 */

import { StorageService, StorageObject, QuotaStatus } from '../../src/storage';
import { MockR2Bucket } from '../mocks/r2';

describe('StorageService', () => {
  let mockBucket: MockR2Bucket;
  let storage: StorageService;

  beforeEach(() => {
    mockBucket = new MockR2Bucket();
    storage = new StorageService(mockBucket as any);
  });

  afterEach(() => {
    mockBucket.clear();
  });

  describe('getObject', () => {
    it('should retrieve an existing object', async () => {
      await mockBucket.put('test/file.txt', 'Hello, World!');

      const result = await storage.getObject('test/file.txt');

      expect(result).toBe('Hello, World!');
    });

    it('should return null for non-existent object', async () => {
      const result = await storage.getObject('nonexistent.txt');

      expect(result).toBeNull();
    });

    it('should retry on transient failures', async () => {
      await mockBucket.put('test/file.txt', 'content');
      mockBucket.setFailure(true, 2); // Fail twice, then succeed

      const result = await storage.getObject('test/file.txt');

      expect(result).toBe('content');
    });

    it('should throw after max retries', async () => {
      mockBucket.setFailure(true);

      await expect(storage.getObject('test.txt')).rejects.toThrow();
    });
  });

  describe('putObject', () => {
    it('should store an object successfully', async () => {
      await storage.putObject('test/file.txt', 'Hello, World!');

      const obj = await mockBucket.get('test/file.txt');
      expect(obj).not.toBeNull();
      expect(await obj!.text()).toBe('Hello, World!');
    });

    it('should store metadata', async () => {
      await storage.putObject('test/file.txt', 'content', {
        contentType: 'text/plain',
        userId: 'user123',
      });

      const obj = await mockBucket.get('test/file.txt');
      expect(obj!.customMetadata.contentType).toBe('text/plain');
      expect(obj!.customMetadata.userId).toBe('user123');
    });

    it('should reject invalid paths with ..', async () => {
      await expect(storage.putObject('../etc/passwd', 'evil')).rejects.toThrow('Invalid path');
    });

    it('should reject paths with null bytes', async () => {
      await expect(storage.putObject('test\x00file.txt', 'content')).rejects.toThrow(
        'Invalid path'
      );
    });

    it('should reject paths with control characters', async () => {
      await expect(storage.putObject('test\x01file.txt', 'content')).rejects.toThrow(
        'Invalid path'
      );
    });

    it('should enforce file size limit', async () => {
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11 MB

      await expect(storage.putObject('large.txt', largeContent)).rejects.toThrow(
        'File size exceeds limit'
      );
    });
  });

  describe('deleteObject', () => {
    it('should delete an existing object', async () => {
      await mockBucket.put('test/file.txt', 'content');

      await storage.deleteObject('test/file.txt');

      const obj = await mockBucket.get('test/file.txt');
      expect(obj).toBeNull();
    });

    it('should not throw when deleting non-existent object', async () => {
      await expect(storage.deleteObject('nonexistent.txt')).resolves.not.toThrow();
    });
  });

  describe('listObjects', () => {
    beforeEach(async () => {
      await mockBucket.put('projects/project1.md', 'content1');
      await mockBucket.put('projects/project2.md', 'content2');
      await mockBucket.put('areas/area1.md', 'content3');
      await mockBucket.put('README.md', 'content4');
    });

    it('should list all objects with no prefix', async () => {
      const objects = await storage.listObjects();

      expect(objects).toHaveLength(4);
      expect(objects.map((o) => o.key)).toContain('README.md');
    });

    it('should list objects with prefix', async () => {
      const objects = await storage.listObjects('projects/');

      expect(objects).toHaveLength(2);
      expect(objects.every((o) => o.key.startsWith('projects/'))).toBe(true);
    });

    it('should include metadata in results', async () => {
      const objects = await storage.listObjects();

      objects.forEach((obj) => {
        expect(obj.key).toBeDefined();
        expect(obj.size).toBeGreaterThan(0);
        expect(obj.modified).toBeInstanceOf(Date);
      });
    });
  });

  describe('checkStorageQuota', () => {
    it('should return within quota for small usage', async () => {
      await mockBucket.put('test1.txt', 'small content');
      await mockBucket.put('test2.txt', 'small content');

      const status = await storage.checkStorageQuota('user123');

      expect(status.withinQuota).toBe(true);
      expect(status.totalBytes).toBeGreaterThan(0);
      expect(status.totalFiles).toBe(2);
    });

    it('should reject when file count exceeds quota', async () => {
      // Simulate 10001 files (exceeds 10k limit)
      for (let i = 0; i < 10001; i++) {
        await mockBucket.put(`file${i}.txt`, 'content');
      }

      const status = await storage.checkStorageQuota('user123');

      expect(status.withinQuota).toBe(false);
      expect(status.totalFiles).toBeGreaterThan(10000);
    });

    it('should calculate total bytes correctly', async () => {
      const content1 = 'a'.repeat(1000);
      const content2 = 'b'.repeat(2000);

      await mockBucket.put('file1.txt', content1);
      await mockBucket.put('file2.txt', content2);

      const status = await storage.checkStorageQuota('user123');

      expect(status.totalBytes).toBeGreaterThanOrEqual(3000);
    });
  });

  describe('path validation', () => {
    it('should accept valid relative paths', async () => {
      await expect(storage.putObject('projects/project1.md', 'content')).resolves.not.toThrow();
      await expect(storage.putObject('areas/health/notes.md', 'content')).resolves.not.toThrow();
    });

    it('should accept paths with spaces', async () => {
      await expect(storage.putObject('my project notes.md', 'content')).resolves.not.toThrow();
    });

    it('should accept paths with unicode', async () => {
      await expect(storage.putObject('日本語.md', 'content')).resolves.not.toThrow();
    });

    it('should reject absolute paths', async () => {
      await expect(storage.putObject('/etc/passwd', 'evil')).rejects.toThrow('Invalid path');
    });
  });
});
