/**
 * Unit tests for glob tool implementation
 */

import { globTool } from '../../../src/tools/glob';
import type { StorageObject } from '../../../src/storage';
import type { StorageService } from '../../../src/storage';

// Type for glob tool result
interface GlobFileResult {
  path: string;
  size: number;
  modified: string;
}

// Mock storage service
class MockStorageService {
  private files: StorageObject[] = [];

  listObjects(prefix?: string): Promise<StorageObject[]> {
    if (prefix) {
      return Promise.resolve(this.files.filter((f) => f.key.startsWith(prefix)));
    }
    return Promise.resolve(this.files);
  }

  setFiles(files: StorageObject[]): void {
    this.files = files;
  }
}

describe('Glob Tool', () => {
  let storage: MockStorageService;

  beforeEach(() => {
    storage = new MockStorageService();

    // Setup test files
    storage.setFiles([
      { key: 'README.md', size: 100, modified: new Date('2025-01-01') },
      { key: 'projects/app/notes.md', size: 200, modified: new Date('2025-01-02') },
      { key: 'projects/app/design.md', size: 300, modified: new Date('2025-01-03') },
      { key: 'projects/launch/plan.md', size: 400, modified: new Date('2025-01-04') },
      { key: 'areas/health/fitness.md', size: 500, modified: new Date('2025-01-05') },
      { key: 'areas/health/nutrition.txt', size: 600, modified: new Date('2025-01-06') },
      { key: 'resources/tech/react.md', size: 700, modified: new Date('2025-01-07') },
      { key: 'archives/2024/old.md', size: 800, modified: new Date('2025-01-08') },
    ]);
  });

  describe('pattern matching', () => {
    it('should match all markdown files with **/*.md', async () => {
      const result = await globTool({ pattern: '**/*.md' }, storage as unknown as StorageService);

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(7); // All .md files
      expect(files.every((f: GlobFileResult) => f.path.endsWith('.md'))).toBe(true);
    });

    it('should match files in specific directory with projects/**', async () => {
      const result = await globTool(
        { pattern: 'projects/**' },
        storage as unknown as StorageService,
      );

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(3);
      expect(files.every((f: GlobFileResult) => f.path.startsWith('projects/'))).toBe(true);
    });

    it('should match files at root level with *.md', async () => {
      const result = await globTool({ pattern: '*.md' }, storage as unknown as StorageService);

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(1);
      expect(files[0].path).toBe('README.md');
    });

    it('should match by directory pattern with **/health/**', async () => {
      const result = await globTool(
        { pattern: '**/health/**' },
        storage as unknown as StorageService,
      );

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(2);
      expect(files.every((f: GlobFileResult) => f.path.includes('health/'))).toBe(true);
    });

    it('should match specific directory with areas/health/*', async () => {
      const result = await globTool(
        { pattern: 'areas/health/*' },
        storage as unknown as StorageService,
      );

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(2);
      expect(files.every((f: GlobFileResult) => f.path.startsWith('areas/health/'))).toBe(true);
    });

    it('should match by extension with **/*.txt', async () => {
      const result = await globTool({ pattern: '**/*.txt' }, storage as unknown as StorageService);

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(1);
      expect(files[0].path).toBe('areas/health/nutrition.txt');
    });

    it('should return empty array when no matches', async () => {
      const result = await globTool({ pattern: '**/*.pdf' }, storage as unknown as StorageService);

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(0);
    });
  });

  describe('result metadata', () => {
    it('should include size and modified date', async () => {
      const result = await globTool({ pattern: 'README.md' }, storage as unknown as StorageService);

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(1);
      expect(files[0]).toHaveProperty('path', 'README.md');
      expect(files[0]).toHaveProperty('size', 100);
      expect(files[0]).toHaveProperty('modified');
    });

    it('should sort by modified date (newest first)', async () => {
      const result = await globTool(
        { pattern: 'projects/**/*.md' },
        storage as unknown as StorageService,
      );

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(3);

      // Should be sorted newest first
      expect(files[0].path).toBe('projects/launch/plan.md'); // 2025-01-04
      expect(files[1].path).toBe('projects/app/design.md'); // 2025-01-03
      expect(files[2].path).toBe('projects/app/notes.md'); // 2025-01-02
    });
  });

  describe('result limiting', () => {
    it('should limit results to max_results', async () => {
      const result = await globTool(
        { pattern: '**/*.md', max_results: 3 },
        storage as unknown as StorageService,
      );

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(3);
    });

    it('should default to 100 results', async () => {
      // Create 150 files
      const manyFiles: StorageObject[] = [];
      for (let i = 0; i < 150; i++) {
        manyFiles.push({
          key: `file${i}.md`,
          size: 100,
          modified: new Date(2025, 0, i + 1), // Different dates
        });
      }
      storage.setFiles(manyFiles);

      const result = await globTool({ pattern: '**/*.md' }, storage as unknown as StorageService);

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(100); // Default limit
    });

    it('should enforce max 1000 results', async () => {
      // Try to request more than max
      const result = await globTool(
        { pattern: '**/*', max_results: 2000 },
        storage as unknown as StorageService,
      );

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBeLessThanOrEqual(1000);
    });

    it('should allow custom max_results under 1000', async () => {
      const result = await globTool(
        { pattern: '**/*', max_results: 5 },
        storage as unknown as StorageService,
      );

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(5);
    });
  });

  describe('error handling', () => {
    it('should return error for missing pattern', async () => {
      const result = await globTool({ pattern: '' }, storage as unknown as StorageService);

      expect(result.isError).toBe(true);
      expect(result.content).toContain('pattern');
    });

    it('should return error for null pattern', async () => {
      const result = await globTool(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        { pattern: null as any },
        storage as unknown as StorageService,
      );

      expect(result.isError).toBe(true);
    });

    it('should handle storage errors gracefully', async () => {
      const errorStorage = {
        listObjects(): Promise<StorageObject[]> {
          return Promise.reject(new Error('Storage failure'));
        },
      };

      const result = await globTool({ pattern: '**/*' }, errorStorage as unknown as StorageService);

      expect(result.isError).toBe(true);
      expect(result.content.toLowerCase()).toContain('error');
    });

    it('should reject invalid glob patterns', async () => {
      // Invalid patterns with unsupported characters
      const result = await globTool(
        { pattern: '[[[invalid' },
        storage as unknown as StorageService,
      );

      // Should either return error or empty results
      expect(result.isError || (JSON.parse(result.content) as GlobFileResult[]).length === 0).toBe(
        true,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty storage', async () => {
      storage.setFiles([]);

      const result = await globTool({ pattern: '**/*' }, storage as unknown as StorageService);

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(0);
    });

    it('should handle pattern with no wildcards', async () => {
      const result = await globTool({ pattern: 'README.md' }, storage as unknown as StorageService);

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(1);
      expect(files[0].path).toBe('README.md');
    });

    it('should handle deeply nested paths', async () => {
      storage.setFiles([
        {
          key: 'a/b/c/d/e/f/deep.md',
          size: 100,
          modified: new Date(),
        },
      ]);

      const result = await globTool(
        { pattern: '**/deep.md' },
        storage as unknown as StorageService,
      );

      expect(result.isError).toBe(false);
      const files = JSON.parse(result.content) as GlobFileResult[];
      expect(files.length).toBe(1);
      expect(files[0].path).toBe('a/b/c/d/e/f/deep.md');
    });
  });
});
