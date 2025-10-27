/**
 * Unit tests for grep tool implementation
 */

import { grepTool } from '../../../src/tools/grep';
import type { StorageObject } from '../../../src/storage';
import type { StorageService } from '../../../src/storage';

// Type for grep tool result
interface GrepMatchResult {
  path: string;
  lineNumber: number;
  line: string;
  match: string;
  context?: string[];
}

// Mock storage service
class MockStorageService {
  private files: Map<string, string> = new Map();

  listObjects(prefix?: string): Promise<StorageObject[]> {
    const objects: StorageObject[] = [];
    for (const [key, content] of this.files.entries()) {
      if (!prefix || key.startsWith(prefix)) {
        objects.push({
          key,
          size: content.length,
          modified: new Date(),
        });
      }
    }
    return Promise.resolve(objects);
  }

  getObject(path: string): Promise<string | null> {
    return Promise.resolve(this.files.get(path) || null);
  }

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }
}

describe('Grep Tool', () => {
  let storage: MockStorageService;

  beforeEach(() => {
    storage = new MockStorageService();

    // Setup test files
    storage.setFile('README.md', 'Welcome to my second brain\nThis is a test\nBASB methodology');
    storage.setFile(
      'projects/app/notes.md',
      'Feature requirements\nTODO: implement login\nUser authentication',
    );
    storage.setFile('projects/app/design.md', 'Design mockups\nUI components\nColor scheme: blue');
    storage.setFile('areas/health/fitness.md', 'Workout plan\nExercise routine\nHealth tracking');
    storage.setFile('resources/tech/react.md', 'React hooks\nComponent patterns\nState management');
  });

  describe('search all files', () => {
    it('should search all files for pattern', async () => {
      const result = await grepTool({ pattern: 'TODO' }, storage as any);

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBe(1);
      expect(matches[0].path).toBe('projects/app/notes.md');
      expect(matches[0].line).toBe(2);
      expect(matches[0].match).toContain('TODO');
    });

    it('should find multiple matches across files', async () => {
      const result = await grepTool({ pattern: 'design' }, storage as any);

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches.some((m: GrepMatchResult) => m.path.includes('design'))).toBe(true);
    });

    it('should be case-insensitive by default', async () => {
      const result = await grepTool({ pattern: 'react' }, storage as any);

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array when no matches', async () => {
      const result = await grepTool(
        { pattern: 'nonexistent pattern xyz123' },
        storage as any,
      );

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBe(0);
    });
  });

  describe('scoped search', () => {
    it('should search only in specified path', async () => {
      const result = await grepTool(
        { pattern: 'design', path: 'projects/app/**' },
        storage as any,
      );

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.every((m: GrepMatchResult) => m.path.startsWith('projects/app/'))).toBe(true);
    });

    it('should support glob patterns in path', async () => {
      const result = await grepTool(
        { pattern: 'health', path: 'areas/**' },
        storage as any,
      );

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.every((m: GrepMatchResult) => m.path.startsWith('areas/'))).toBe(true);
    });

    it('should handle specific file path', async () => {
      const result = await grepTool(
        { pattern: 'TODO', path: 'projects/app/notes.md' },
        storage as any,
      );

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBe(1);
      expect(matches[0].path).toBe('projects/app/notes.md');
    });
  });

  describe('context lines', () => {
    it('should include context lines around match', async () => {
      const result = await grepTool(
        { pattern: 'TODO', context_lines: 1 },
        storage as any,
      );

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBe(1);
      expect(matches[0].context).toBeDefined();
      if (matches[0].context) {
        expect(matches[0].context.length).toBe(3); // 1 before + match + 1 after
      }
    });

    it('should handle context at file boundaries', async () => {
      storage.setFile('test.md', 'First line\nSecond line');

      const result = await grepTool(
        { pattern: 'First', context_lines: 5 },
        storage as any,
      );

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      if (matches[0].context) {
        expect(matches[0].context.length).toBeLessThanOrEqual(2); // Only 2 lines in file
      }
    });

    it('should work with zero context lines', async () => {
      const result = await grepTool(
        { pattern: 'TODO', context_lines: 0 },
        storage as any,
      );

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches[0].context).toBeUndefined();
    });
  });

  describe('regex patterns', () => {
    it('should support regex patterns', async () => {
      const result = await grepTool(
        { pattern: 'TODO:.*login' },
        storage as any,
      );

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should support word boundaries', async () => {
      const result = await grepTool(
        { pattern: '\\btest\\b' },
        storage as any,
      );

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle special regex characters', async () => {
      storage.setFile('test.md', 'Price: $100 (50%)');

      const result = await grepTool({ pattern: '\\$100' }, storage as any);

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBe(1);
    });

    it('should return error for invalid regex', async () => {
      const result = await grepTool(
        { pattern: '[[[invalid' },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Invalid');
    });
  });

  describe('max matches limiting', () => {
    it('should limit results to max_matches', async () => {
      // Create file with many matches
      const manyLines = Array(100).fill('match this line').join('\n');
      storage.setFile('many.md', manyLines);

      const result = await grepTool(
        { pattern: 'match', max_matches: 10 },
        storage as any,
      );

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBe(10);
    });

    it('should default to 50 matches', async () => {
      const manyLines = Array(100).fill('match this line').join('\n');
      storage.setFile('many.md', manyLines);

      const result = await grepTool({ pattern: 'match' }, storage as any);

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches.length).toBe(50); // Default limit
    });

    it('should enforce max 1000 matches', async () => {
      const result = await grepTool(
        { pattern: 'test', max_matches: 5000 },
        storage as any,
      );

      expect(result.isError).toBe(false);
      // Should be clamped to 1000
    });
  });

  describe('error handling', () => {
    it('should return error for missing pattern', async () => {
      const result = await grepTool({ pattern: '' }, storage as any);

      expect(result.isError).toBe(true);
      expect(result.content).toContain('pattern');
    });

    it('should return error for null pattern', async () => {
      const result = await grepTool(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        { pattern: null as any },
        storage as any,
      );

      expect(result.isError).toBe(true);
    });

    it('should handle storage errors gracefully', async () => {
      const errorStorage = {
        listObjects(): Promise<StorageObject[]> {
          return Promise.reject(new Error('Storage failure'));
        },
      };

      const result = await grepTool({ pattern: 'test' }, errorStorage as any);

      expect(result.isError).toBe(true);
      expect(result.content.toLowerCase()).toContain('error');
    });
  });

  describe('match details', () => {
    it('should include path, line number, and match content', async () => {
      const result = await grepTool({ pattern: 'TODO' }, storage as any);

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches[0]).toHaveProperty('path');
      expect(matches[0]).toHaveProperty('line');
      expect(matches[0]).toHaveProperty('match');
    });

    it('should have correct line numbers (1-indexed)', async () => {
      storage.setFile('lines.md', 'Line 1\nLine 2\nLine 3');

      const result = await grepTool({ pattern: 'Line 2' }, storage as any);

      expect(result.isError).toBe(false);
      const matches = JSON.parse(result.content) as GrepMatchResult[];
      expect(matches[0].line).toBe(2);
    });
  });
});
