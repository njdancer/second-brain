/**
 * Unit tests for bootstrap system
 */

import type { R2Bucket } from '@cloudflare/workers-types';
import { bootstrapSecondBrain, shouldBootstrap } from '../../src/bootstrap';
import { StorageService } from '../../src/storage';
import { MockR2Bucket } from '../mocks/r2';

describe('Bootstrap System', () => {
  let storage: StorageService;
  let mockBucket: MockR2Bucket;

  beforeEach(() => {
    mockBucket = new MockR2Bucket();
    storage = new StorageService(mockBucket as any);
  });

  afterEach(() => {
    mockBucket.clear();
  });

  describe('shouldBootstrap', () => {
    it('should return true when README.md does not exist', async () => {
      const result = await shouldBootstrap(storage);
      expect(result).toBe(true);
    });

    it('should return false when README.md exists', async () => {
      await storage.putObject('README.md', '# Existing');
      const result = await shouldBootstrap(storage);
      expect(result).toBe(false);
    });

    it('should handle storage errors gracefully', async () => {
      const failingStorage = new StorageService({
        get: jest.fn().mockRejectedValue(new Error('Storage error')),
      } as any);

      await expect(shouldBootstrap(failingStorage)).rejects.toThrow('Storage error');
    });
  });

  describe('bootstrapSecondBrain', () => {
    it('should create all required PARA structure files', async () => {
      await bootstrapSecondBrain(storage);

      // Check all bootstrap files were created
      const readmeMd = await storage.getObject('README.md');
      const projectsReadme = await storage.getObject('projects/README.md');
      const areasReadme = await storage.getObject('areas/README.md');
      const resourcesReadme = await storage.getObject('resources/README.md');
      const archivesReadme = await storage.getObject('archives/README.md');

      expect(readmeMd).toContain('# My Second Brain');
      expect(readmeMd).toContain('BASB methodology');
      expect(readmeMd).toContain('PARA Structure');

      expect(projectsReadme).toContain('# Projects');
      expect(projectsReadme).toContain('defined goals and deadlines');

      expect(areasReadme).toContain('# Areas');
      expect(areasReadme).toContain('sustained attention');

      expect(resourcesReadme).toContain('# Resources');
      expect(resourcesReadme).toContain('reference material');

      expect(archivesReadme).toContain('# Archives');
      expect(archivesReadme).toContain('Inactive items');
    });

    it('should be idempotent - not overwrite existing files', async () => {
      // Create initial bootstrap
      await bootstrapSecondBrain(storage);

      // Modify a file
      const customContent = '# My Custom README\n\nCustom content';
      await storage.putObject('README.md', customContent);

      // Bootstrap again
      await bootstrapSecondBrain(storage);

      // Custom content should still be there (not overwritten)
      const readmeMd = await storage.getObject('README.md');
      expect(readmeMd).toBe(customContent);
    });

    it('should create files with proper markdown structure', async () => {
      await bootstrapSecondBrain(storage);

      const projectsReadme = await storage.getObject('projects/README.md');
      expect(projectsReadme).toContain('Examples:');
      expect(projectsReadme).toContain('- Launch new website');
    });

    it('should handle partial bootstrap (some files exist)', async () => {
      // Create only the main README
      await storage.putObject('README.md', '# Existing');

      // Bootstrap should create missing files
      await bootstrapSecondBrain(storage);

      const projectsReadme = await storage.getObject('projects/README.md');
      const areasReadme = await storage.getObject('areas/README.md');

      expect(projectsReadme).toContain('# Projects');
      expect(areasReadme).toContain('# Areas');

      // Existing file should not be overwritten
      const readmeMd = await storage.getObject('README.md');
      expect(readmeMd).toBe('# Existing');
    });

    it('should handle storage errors during bootstrap', async () => {
      // Set mock to always fail - storage will retry 3 times per operation and fail
      mockBucket.setFailure(true, Infinity);

      await expect(bootstrapSecondBrain(storage)).rejects.toThrow();
    });

    it('should include helpful getting started information', async () => {
      await bootstrapSecondBrain(storage);

      const readmeMd = await storage.getObject('README.md');
      expect(readmeMd).toContain('Getting Started');
      expect(readmeMd).toContain('Ask Claude');
    });

    it('should include PARA directory descriptions', async () => {
      await bootstrapSecondBrain(storage);

      const readmeMd = await storage.getObject('README.md');
      expect(readmeMd).toContain('projects/');
      expect(readmeMd).toContain('areas/');
      expect(readmeMd).toContain('resources/');
      expect(readmeMd).toContain('archives/');
    });
  });

  describe('full bootstrap workflow', () => {
    it('should only bootstrap once on empty storage', async () => {
      // First check - should bootstrap
      expect(await shouldBootstrap(storage)).toBe(true);

      // Bootstrap
      await bootstrapSecondBrain(storage);

      // Second check - should not bootstrap again
      expect(await shouldBootstrap(storage)).toBe(false);
    });

    it('should create exactly 5 files', async () => {
      await bootstrapSecondBrain(storage);

      const allFiles = await storage.listObjects();
      expect(allFiles.length).toBeGreaterThanOrEqual(5);

      // Check specific files exist
      const filePaths = allFiles.map((f) => f.key);
      expect(filePaths).toContain('README.md');
      expect(filePaths).toContain('projects/README.md');
      expect(filePaths).toContain('areas/README.md');
      expect(filePaths).toContain('resources/README.md');
      expect(filePaths).toContain('archives/README.md');
    });
  });
});
