/**
 * Tests for feature flag loader
 */

import { loadFlags, FlagContext } from '../../../src/feature-flags/loader';
import type { Env } from '../../../src/index';
import { Logger } from '../../../src/logger';
import type { LogContext } from '../../../src/logger';

// Mock KVNamespace with test helpers
interface MockKVNamespace extends KVNamespace {
  setStore: (key: string, value: string) => void;
  clearStore: () => void;
}

const createMockKV = (): MockKVNamespace => {
  const store = new Map<string, string>();

  return {
    get: jest.fn(async (key: string) => {
      return store.get(key) || null;
    }),
    put: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    list: jest.fn(),
    getWithMetadata: jest.fn(),
    setStore: (key: string, value: string) => {
      store.set(key, value);
    },
    clearStore: () => {
      store.clear();
    },
  } as unknown as MockKVNamespace;
};

// Mock Env for testing
const createMockEnv = (featureFlagsKV: KVNamespace): Env => {
  return {
    SECOND_BRAIN_BUCKET: {} as R2Bucket,
    OAUTH_KV: {} as KVNamespace,
    RATE_LIMIT_KV: {} as KVNamespace,
    FEATURE_FLAGS_KV: featureFlagsKV,
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

describe('Feature Flag Loader', () => {
  let mockKV: MockKVNamespace;
  let env: Env;
  let logger: Logger;

  beforeEach(() => {
    mockKV = createMockKV();
    env = createMockEnv(mockKV);
    logger = createMockLogger();
  });

  describe('loadFlags', () => {
    it('should load flags from KV when available', async () => {
      // Set up KV with flag values
      const flagSetKey = 'flagset:env:production';
      const flagSetValue = JSON.stringify({
        EXAMPLE_FEATURE: true,
      });
      mockKV.setStore(flagSetKey, flagSetValue);

      const flags = await loadFlags(env, 'production', logger);

      expect(flags).toHaveProperty('EXAMPLE_FEATURE');
      expect(flags.EXAMPLE_FEATURE).toBe(true);
    });

    it('should return schema defaults when KV is empty', async () => {
      const flags = await loadFlags(env, 'production', logger);

      expect(flags).toHaveProperty('EXAMPLE_FEATURE');
      expect(flags.EXAMPLE_FEATURE).toBe(false); // Schema default
    });

    it('should handle invalid JSON gracefully', async () => {
      // Set invalid JSON in KV
      const flagSetKey = 'flagset:env:production';
      mockKV.setStore(flagSetKey, 'invalid json{');

      const flags = await loadFlags(env, 'production', logger);

      // Should fall back to schema defaults
      expect(flags.EXAMPLE_FEATURE).toBe(false);
    });

    it('should validate flag values against schemas', async () => {
      // Set invalid flag value in KV
      const flagSetKey = 'flagset:env:production';
      const flagSetValue = JSON.stringify({
        EXAMPLE_FEATURE: 'invalid', // Should be boolean
      });
      mockKV.setStore(flagSetKey, flagSetValue);

      const flags = await loadFlags(env, 'production', logger);

      // Should fall back to schema default for invalid flag
      expect(flags.EXAMPLE_FEATURE).toBe(false);
    });

    it('should merge KV flags with schema defaults', async () => {
      // Set partial flag set in KV (missing some flags)
      const flagSetKey = 'flagset:env:production';
      const flagSetValue = JSON.stringify({
        // EXAMPLE_FEATURE not set
      });
      mockKV.setStore(flagSetKey, flagSetValue);

      const flags = await loadFlags(env, 'production', logger);

      // Should use schema default for missing flag
      expect(flags.EXAMPLE_FEATURE).toBe(false);
    });

    it('should handle KV errors gracefully', async () => {
      // Mock KV.get to throw an error
      const errorKV = {
        get: jest.fn(async () => {
          throw new Error('KV error');
        }),
      } as unknown as KVNamespace;

      const errorEnv = createMockEnv(errorKV);

      const flags = await loadFlags(errorEnv, 'production', logger);

      // Should fall back to schema defaults
      expect(flags.EXAMPLE_FEATURE).toBe(false);
    });

    it('should ignore unknown flags in KV', async () => {
      // Set flag set with unknown flag
      const flagSetKey = 'flagset:env:production';
      const flagSetValue = JSON.stringify({
        EXAMPLE_FEATURE: true,
        UNKNOWN_FLAG: 'should-be-ignored',
      });
      mockKV.setStore(flagSetKey, flagSetValue);

      const flags = await loadFlags(env, 'production', logger);

      // Known flag should be loaded
      expect(flags.EXAMPLE_FEATURE).toBe(true);

      // Unknown flag should not be in the result
      expect('UNKNOWN_FLAG' in flags).toBe(false);
    });
  });

  describe('FlagContext', () => {
    it('should create a flag context', () => {
      const context = new FlagContext(env, 'production', logger);

      expect(context).toBeInstanceOf(FlagContext);
    });

    it('should load flags on first access', async () => {
      const context = new FlagContext(env, 'production', logger);

      const flags = await context.getFlags();

      expect(flags).toHaveProperty('EXAMPLE_FEATURE');
    });

    it('should cache flags across multiple accesses', async () => {
      // Set up KV with flag values
      const flagSetKey = 'flagset:env:production';
      const flagSetValue = JSON.stringify({
        EXAMPLE_FEATURE: true,
      });
      mockKV.setStore(flagSetKey, flagSetValue);

      const context = new FlagContext(env, 'production', logger);

      // First access
      const flags1 = await context.getFlags();
      expect(flags1.EXAMPLE_FEATURE).toBe(true);

      // Modify KV (should not affect cached value)
      mockKV.setStore(
        flagSetKey,
        JSON.stringify({
          EXAMPLE_FEATURE: false,
        }),
      );

      // Second access (should return cached value)
      const flags2 = await context.getFlags();
      expect(flags2.EXAMPLE_FEATURE).toBe(true); // Still true from cache

      // Verify KV was only called once
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockKV.get).toHaveBeenCalledTimes(1);
    });

    it('should get individual flag values', async () => {
      const context = new FlagContext(env, 'production', logger);

      const value = await context.getFlag('EXAMPLE_FEATURE');

      expect(typeof value).toBe('boolean');
      expect(value).toBe(false); // Schema default
    });

    it('should support multiple flag contexts independently', async () => {
      // Set up different flag sets in KV
      mockKV.setStore(
        'flagset:env:production',
        JSON.stringify({
          EXAMPLE_FEATURE: false,
        }),
      );

      mockKV.setStore(
        'flagset:env:development',
        JSON.stringify({
          EXAMPLE_FEATURE: true,
        }),
      );

      const prodContext = new FlagContext(env, 'production', logger);
      const devContext = new FlagContext(env, 'development', logger);

      const prodFlags = await prodContext.getFlags();
      const devFlags = await devContext.getFlags();

      expect(prodFlags.EXAMPLE_FEATURE).toBe(false);
      expect(devFlags.EXAMPLE_FEATURE).toBe(true);
    });
  });
});
