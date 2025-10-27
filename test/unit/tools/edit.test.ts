/**
 * Unit tests for edit tool implementation
 */

import { editTool } from '../../../src/tools/edit';

// Mock storage service
class MockStorageService {
  private files: Map<string, string> = new Map();

  getObject(path: string): Promise<string | null> {
    if (this.files.has(path)) {
      return Promise.resolve(this.files.get(path)!);
    }
    return Promise.resolve(null);
  }

  putObject(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }

  deleteObject(path: string): Promise<void> {
    this.files.delete(path);
    return Promise.resolve();
  }

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  fileExists(path: string): boolean {
    return this.files.has(path);
  }
}

describe('Edit Tool', () => {
  let storage: MockStorageService;

  beforeEach(() => {
    storage = new MockStorageService();
  });

  describe('string replacement', () => {
    it('should replace unique string', async () => {
      storage.setFile('test.md', 'Hello World\nThis is a test\nGoodbye');

      const result = await editTool(
        {
          path: 'test.md',
          old_str: 'This is a test',
          new_str: 'This is updated',
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('test.md')).toBe('Hello World\nThis is updated\nGoodbye');
    });

    it('should return error for non-unique string', async () => {
      storage.setFile('test.md', 'Hello\nHello\nGoodbye');

      const result = await editTool(
        {
          path: 'test.md',
          old_str: 'Hello',
          new_str: 'Hi',
        },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('not unique');
    });

    it('should return error for string not found', async () => {
      storage.setFile('test.md', 'Hello World');

      const result = await editTool(
        {
          path: 'test.md',
          old_str: 'Not present',
          new_str: 'Updated',
        },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('not found');
    });

    it('should handle empty replacement (deletion)', async () => {
      storage.setFile('test.md', 'Hello World\nDelete this line\nGoodbye');

      const result = await editTool(
        {
          path: 'test.md',
          old_str: '\nDelete this line',
          new_str: '',
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('test.md')).toBe('Hello World\nGoodbye');
    });

    it('should handle special characters in replacement', async () => {
      storage.setFile('test.md', 'Normal text');

      const result = await editTool(
        {
          path: 'test.md',
          old_str: 'Normal text',
          new_str: 'Special chars: $100 (50%) [test]',
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('test.md')).toBe('Special chars: $100 (50%) [test]');
    });

    it('should handle unicode in replacement', async () => {
      storage.setFile('test.md', 'English text');

      const result = await editTool(
        {
          path: 'test.md',
          old_str: 'English text',
          new_str: '日本語 🎉 Émojis',
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('test.md')).toBe('日本語 🎉 Émojis');
    });

    it('should handle multiline string replacement', async () => {
      storage.setFile('test.md', 'Line 1\nLine 2\nLine 3\nLine 4');

      const result = await editTool(
        {
          path: 'test.md',
          old_str: 'Line 2\nLine 3',
          new_str: 'Combined line',
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('test.md')).toBe('Line 1\nCombined line\nLine 4');
    });
  });

  describe('move/rename file', () => {
    it('should move file to new location', async () => {
      storage.setFile('old.md', 'Content');

      const result = await editTool(
        {
          path: 'old.md',
          new_path: 'projects/new.md',
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.fileExists('old.md')).toBe(false);
      expect(storage.getFile('projects/new.md')).toBe('Content');
    });

    it('should rename file in same directory', async () => {
      storage.setFile('old-name.md', 'Content');

      const result = await editTool(
        {
          path: 'old-name.md',
          new_path: 'new-name.md',
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.fileExists('old-name.md')).toBe(false);
      expect(storage.getFile('new-name.md')).toBe('Content');
    });

    it('should return error if target path already exists', async () => {
      storage.setFile('file1.md', 'Content 1');
      storage.setFile('file2.md', 'Content 2');

      const result = await editTool(
        {
          path: 'file1.md',
          new_path: 'file2.md',
        },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('already exists');
    });

    it('should move to nested directory', async () => {
      storage.setFile('note.md', 'Content');

      const result = await editTool(
        {
          path: 'note.md',
          new_path: 'archives/2024/old/note.md',
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('archives/2024/old/note.md')).toBe('Content');
    });
  });

  describe('delete file', () => {
    it('should delete file', async () => {
      storage.setFile('delete-me.md', 'Content');

      const result = await editTool(
        {
          path: 'delete-me.md',
          delete: true,
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.fileExists('delete-me.md')).toBe(false);
    });

    it('should return error when deleting non-existent file', async () => {
      const result = await editTool(
        {
          path: 'does-not-exist.md',
          delete: true,
        },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('not found');
    });

    it('should ignore other params when delete is true', async () => {
      storage.setFile('delete-me.md', 'Content');

      const result = await editTool(
        {
          path: 'delete-me.md',
          old_str: 'ignored',
          new_str: 'also ignored',
          new_path: 'ignored-path.md',
          delete: true,
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.fileExists('delete-me.md')).toBe(false);
      expect(storage.fileExists('ignored-path.md')).toBe(false);
    });
  });

  describe('edit and move combined', () => {
    it('should edit content and move file', async () => {
      storage.setFile('projects/active.md', 'Status: In Progress');

      const result = await editTool(
        {
          path: 'projects/active.md',
          old_str: 'Status: In Progress',
          new_str: 'Status: Completed',
          new_path: 'archives/2024/active.md',
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.fileExists('projects/active.md')).toBe(false);
      expect(storage.getFile('archives/2024/active.md')).toBe('Status: Completed');
    });

    it('should handle edit and move with multiple edits', async () => {
      storage.setFile('file.md', 'Line 1\nLine 2\nLine 3');

      const result = await editTool(
        {
          path: 'file.md',
          old_str: 'Line 2',
          new_str: 'Updated line',
          new_path: 'moved.md',
        },
        storage as any,
      );

      expect(result.isError).toBe(false);
      expect(storage.getFile('moved.md')).toBe('Line 1\nUpdated line\nLine 3');
    });
  });

  describe('error handling', () => {
    it('should return error for missing path', async () => {
      const result = await editTool(
        {
          path: '',
          old_str: 'test',
          new_str: 'updated',
        },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('path');
    });

    it('should return error for non-existent file', async () => {
      const result = await editTool(
        {
          path: 'does-not-exist.md',
          old_str: 'test',
          new_str: 'updated',
        },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('not found');
    });

    it('should return error when no operation specified', async () => {
      storage.setFile('test.md', 'Content');

      const result = await editTool(
        {
          path: 'test.md',
        },
        storage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('operation');
    });

    it('should handle storage errors gracefully', async () => {
      const errorStorage = {
        getObject(): Promise<string | null> {
          return Promise.reject(new Error('Storage failure'));
        },
      };

      const result = await editTool(
        {
          path: 'test.md',
          old_str: 'test',
          new_str: 'updated',
        },
        errorStorage as any,
      );

      expect(result.isError).toBe(true);
      expect(result.content.toLowerCase()).toContain('error');
    });

    it('should validate old_str is provided when new_str is provided', async () => {
      storage.setFile('test.md', 'Content');

      const result = await editTool(
        {
          path: 'test.md',
          new_str: 'updated',
        },
        storage as any,
      );

      expect(result.isError).toBe(true);
    });
  });
});
