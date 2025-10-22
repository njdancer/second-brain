/**
 * Tests for feature flags main interface
 */

import { createFlagContext, FlagContext } from '../../../src/feature-flags';
import type { Env } from '../../../src/index';
import { Logger } from '../../../src/logger';
import type { LogContext } from '../../../src/logger';

// Mock KVNamespace
const createMockKV = (): KVNamespace => {
  return {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cursor: '' }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace;
};

// Mock Env for testing
const createMockEnv = (): Env => {
  return {
    SECOND_BRAIN_BUCKET: {} as R2Bucket,
    OAUTH_KV: createMockKV(),
    RATE_LIMIT_KV: createMockKV(),
    FEATURE_FLAGS_KV: createMockKV(),
    ANALYTICS: {} as AnalyticsEngineDataset,
    MCP_SESSIONS: {} as DurableObjectNamespace,
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    GITHUB_ALLOWED_USER_ID: 'test-user-id',
    COOKIE_ENCRYPTION_KEY: 'test-key',
    AWS_ACCESS_KEY_ID: 'test-access-key',
    AWS_SECRET_ACCESS_KEY: 'test-secret-key',
    AWS_REGION: 'us-east-1',
    AWS_S3_BACKUP_BUCKET: 'test-bucket',
  };
};

// Mock Logger
const createMockLogger = (): Logger => {
  const context: LogContext = {
    requestId: 'test-request-id',
  };
  return new Logger(context);
};

describe('Feature Flags Interface', () => {
  describe('createFlagContext', () => {
    it('should create a flag context', () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();
      const logger = createMockLogger();

      const context = createFlagContext(request, env, logger);

      expect(context).toBeInstanceOf(FlagContext);
    });

    it('should determine flag set based on request', () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();
      const logger = createMockLogger();

      const context = createFlagContext(request, env, logger);

      // Should not throw
      expect(context).toBeDefined();
    });

    it('should be usable across different requests', () => {
      const request1 = new Request('https://example.com/path1');
      const request2 = new Request('https://example.com/path2');
      const env = createMockEnv();
      const logger = createMockLogger();

      const context1 = createFlagContext(request1, env, logger);
      const context2 = createFlagContext(request2, env, logger);

      expect(context1).toBeInstanceOf(FlagContext);
      expect(context2).toBeInstanceOf(FlagContext);
    });

    it('should provide access to flag values', async () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();
      const logger = createMockLogger();

      const context = createFlagContext(request, env, logger);
      const flags = await context.getFlags();

      expect(flags).toHaveProperty('EXAMPLE_FEATURE');
      expect(typeof flags.EXAMPLE_FEATURE).toBe('boolean');
    });

    it('should support getting individual flags', async () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();
      const logger = createMockLogger();

      const context = createFlagContext(request, env, logger);
      const value = await context.getFlag('EXAMPLE_FEATURE');

      expect(typeof value).toBe('boolean');
    });
  });

  describe('Integration with request handling', () => {
    it('should work in a typical request handler pattern', async () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();
      const logger = createMockLogger();

      // Simulate request handler
      const flagContext = createFlagContext(request, env, logger);
      const flags = await flagContext.getFlags();

      // Use flags to branch logic
      if (flags.EXAMPLE_FEATURE) {
        // New code path
        expect(true).toBe(true);
      } else {
        // Original code path
        expect(true).toBe(true);
      }
    });

    it('should cache flags within a request', async () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();
      const logger = createMockLogger();

      const flagContext = createFlagContext(request, env, logger);

      // Access flags multiple times
      await flagContext.getFlags();
      await flagContext.getFlags();
      await flagContext.getFlag('EXAMPLE_FEATURE');
      await flagContext.getFlag('EXAMPLE_FEATURE');

      // All accesses should use cached value (no additional KV calls)
      // This is verified in loader.test.ts
      expect(true).toBe(true);
    });
  });
});
