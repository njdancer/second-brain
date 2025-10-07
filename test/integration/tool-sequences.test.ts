/**
 * Integration tests for tool sequences
 * Tests the full lifecycle of operations: create → read → edit → delete
 */

import { StorageService } from '../../src/storage';
import { readTool } from '../../src/tools/read';
import { writeTool } from '../../src/tools/write';
import { editTool } from '../../src/tools/edit';
import { globTool } from '../../src/tools/glob';
import { grepTool } from '../../src/tools/grep';
import { MockR2Bucket } from '../mocks/r2';

describe('Integration: Tool Sequences', () => {
  let mockBucket: MockR2Bucket;
  let storage: StorageService;

  beforeEach(() => {
    mockBucket = new MockR2Bucket();
    storage = new StorageService(mockBucket as any);
  });

  afterEach(() => {
    mockBucket.clear();
  });

  describe('Full file lifecycle', () => {
    it('should create, read, edit, and delete a file', async () => {
      // 1. Create file with write tool
      const writeResult = await writeTool(
        { path: 'projects/test.md', content: '# Test Project\n\nInitial content' },
        storage
      );
      expect(writeResult.isError).toBe(false);

      // 2. Read the file back
      const readResult = await readTool(
        { path: 'projects/test.md' },
        storage
      );
      expect(readResult.isError).toBe(false);
      expect(readResult.content).toContain('# Test Project');
      expect(readResult.content).toContain('Initial content');

      // 3. Edit the file
      const editResult = await editTool(
        {
          path: 'projects/test.md',
          old_str: 'Initial content',
          new_str: 'Updated content with more details',
        },
        storage
      );
      expect(editResult.isError).toBe(false);

      // 4. Read again to verify edit
      const readResult2 = await readTool(
        { path: 'projects/test.md' },
        storage
      );
      expect(readResult2.content).toContain('Updated content with more details');
      expect(readResult2.content).not.toContain('Initial content');

      // 5. Delete the file
      const deleteResult = await editTool(
        { path: 'projects/test.md', delete: true },
        storage
      );
      expect(deleteResult.isError).toBe(false);

      // 6. Verify file is gone
      const readResult3 = await readTool(
        { path: 'projects/test.md' },
        storage
      );
      expect(readResult3.isError).toBe(true);
      expect(readResult3.content).toContain('File not found');
    });

    it('should create, move, and read from new location', async () => {
      // 1. Create file
      await writeTool(
        { path: 'projects/draft.md', content: '# Draft Document' },
        storage
      );

      // 2. Move to areas
      const moveResult = await editTool(
        {
          path: 'projects/draft.md',
          new_path: 'areas/ongoing.md',
        },
        storage
      );
      expect(moveResult.isError).toBe(false);

      // 3. Read from new location
      const readResult = await readTool(
        { path: 'areas/ongoing.md' },
        storage
      );
      expect(readResult.isError).toBe(false);
      expect(readResult.content).toContain('# Draft Document');

      // 4. Verify old location is gone
      const readOld = await readTool(
        { path: 'projects/draft.md' },
        storage
      );
      expect(readOld.isError).toBe(true);
    });
  });

  describe('Search and edit workflow', () => {
    it('should find files with glob, search content with grep, then edit', async () => {
      // Setup: Create multiple files
      await writeTool(
        { path: 'projects/project1.md', content: '# Project 1\n\nTODO: Complete task' },
        storage
      );
      await writeTool(
        { path: 'projects/project2.md', content: '# Project 2\n\nTODO: Review code' },
        storage
      );
      await writeTool(
        { path: 'areas/area1.md', content: '# Area 1\n\nTODO: Follow up' },
        storage
      );

      // 1. Find all markdown files in projects
      const globResult = await globTool(
        { pattern: 'projects/*.md' },
        storage
      );
      expect(globResult.isError).toBe(false);
      expect(globResult.content).toContain('project1.md');
      expect(globResult.content).toContain('project2.md');
      expect(globResult.content).not.toContain('area1.md');

      // 2. Search for TODO items
      const grepResult = await grepTool(
        { pattern: 'TODO:', path: 'projects/**' },
        storage
      );
      expect(grepResult.isError).toBe(false);
      expect(grepResult.content).toContain('TODO: Complete task');
      expect(grepResult.content).toContain('TODO: Review code');

      // 3. Edit one of the files to mark TODO as done
      const editResult = await editTool(
        {
          path: 'projects/project1.md',
          old_str: 'TODO: Complete task',
          new_str: 'DONE: Task completed',
        },
        storage
      );
      expect(editResult.isError).toBe(false);

      // 4. Verify the edit
      const verifyResult = await grepTool(
        { pattern: 'TODO:', path: 'projects/project1.md' },
        storage
      );
      expect(verifyResult.content).not.toContain('TODO: Complete task');

      const verifyDone = await grepTool(
        { pattern: 'DONE:', path: 'projects/project1.md' },
        storage
      );
      expect(verifyDone.content).toContain('DONE: Task completed');
    });
  });

  describe('Error handling in sequences', () => {
    it('should handle read of non-existent file', async () => {
      const readResult = await readTool(
        { path: 'nonexistent.md' },
        storage
      );
      expect(readResult.isError).toBe(true);
      expect(readResult.content).toContain('File not found');
    });

    it('should handle edit of non-existent string', async () => {
      // Create file
      await writeTool(
        { path: 'test.md', content: 'Some content' },
        storage
      );

      // Try to replace string that doesn't exist
      const editResult = await editTool(
        {
          path: 'test.md',
          old_str: 'Non-existent string',
          new_str: 'New content',
        },
        storage
      );
      expect(editResult.isError).toBe(true);
      expect(editResult.content).toContain('not found');
    });

    it('should handle move to existing path', async () => {
      // Create two files
      await writeTool(
        { path: 'file1.md', content: 'File 1' },
        storage
      );
      await writeTool(
        { path: 'file2.md', content: 'File 2' },
        storage
      );

      // Try to move file1 to file2 (which already exists)
      const moveResult = await editTool(
        {
          path: 'file1.md',
          new_path: 'file2.md',
        },
        storage
      );
      expect(moveResult.isError).toBe(true);
      expect(moveResult.content).toContain('already exists');
    });
  });

  describe('Concurrent operations', () => {
    it('should handle multiple writes to different files concurrently', async () => {
      const writes = [
        writeTool({ path: 'file1.md', content: 'Content 1' }, storage),
        writeTool({ path: 'file2.md', content: 'Content 2' }, storage),
        writeTool({ path: 'file3.md', content: 'Content 3' }, storage),
      ];

      const results = await Promise.all(writes);

      results.forEach((result) => {
        expect(result.isError).toBe(false);
      });

      // Verify all files were created
      const file1 = await readTool({ path: 'file1.md' }, storage);
      const file2 = await readTool({ path: 'file2.md' }, storage);
      const file3 = await readTool({ path: 'file3.md' }, storage);

      expect(file1.content).toContain('Content 1');
      expect(file2.content).toContain('Content 2');
      expect(file3.content).toContain('Content 3');
    });
  });

  describe('Complex workflows', () => {
    it('should support a weekly review workflow', async () => {
      // Setup: Create project notes
      await writeTool(
        {
          path: 'projects/active-project.md',
          content: '# Active Project\n\nStatus: In Progress\nNext: Review with team',
        },
        storage
      );

      // 1. Find all project files
      const projects = await globTool({ pattern: 'projects/*.md' }, storage);
      expect(projects.isError).toBe(false);

      // 2. Search for status indicators
      const statusSearch = await grepTool(
        { pattern: 'Status:', path: 'projects/**' },
        storage
      );
      expect(statusSearch.content).toContain('Status: In Progress');

      // 3. Update status
      await editTool(
        {
          path: 'projects/active-project.md',
          old_str: 'Status: In Progress',
          new_str: 'Status: Completed',
        },
        storage
      );

      // 4. Move completed project to archives
      const archiveResult = await editTool(
        {
          path: 'projects/active-project.md',
          new_path: 'archives/completed-project.md',
        },
        storage
      );
      expect(archiveResult.isError).toBe(false);

      // 5. Verify project is in archives
      const archived = await readTool({ path: 'archives/completed-project.md' }, storage);
      expect(archived.content).toContain('Status: Completed');
    });
  });
});
