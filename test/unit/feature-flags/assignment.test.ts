/**
 * Tests for flag set assignment functions
 */

import {
  assignByEnvironment,
  determineFlagSet,
  DEFAULT_FLAG_SET_ID,
  ASSIGNMENT_FUNCTIONS,
  type FlagSetAssignmentFn,
} from '../../../src/feature-flags/assignment';
import type { Env } from '../../../src/index';

// Mock Env for testing
const createMockEnv = (): Env => {
  return {
    SECOND_BRAIN_BUCKET: {} as R2Bucket,
    OAUTH_KV: {} as KVNamespace,
    RATE_LIMIT_KV: {} as KVNamespace,
    FEATURE_FLAGS_KV: {} as KVNamespace,
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

describe('Flag Set Assignment Functions', () => {
  describe('assignByEnvironment', () => {
    it('should return production by default', () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();

      const result = assignByEnvironment(request, env);

      expect(result).toBe('production');
    });

    it('should be callable with any valid request', () => {
      const request = new Request('https://example.com/test');
      const env = createMockEnv();

      expect(() => assignByEnvironment(request, env)).not.toThrow();
    });
  });

  describe('determineFlagSet', () => {
    it('should return flag set from first matching assignment function', () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();

      const result = determineFlagSet(request, env);

      expect(result).toBe('production');
    });

    it('should return DEFAULT_FLAG_SET_ID if no functions match', () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();

      // Temporarily replace assignment functions with one that returns null
      const originalFunctions = [...ASSIGNMENT_FUNCTIONS];
      ASSIGNMENT_FUNCTIONS.length = 0;
      ASSIGNMENT_FUNCTIONS.push(() => null);

      const result = determineFlagSet(request, env);

      // Restore original functions
      ASSIGNMENT_FUNCTIONS.length = 0;
      ASSIGNMENT_FUNCTIONS.push(...originalFunctions);

      expect(result).toBe(DEFAULT_FLAG_SET_ID);
    });

    it('should try functions in order until one returns non-null', () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();

      const calls: number[] = [];

      const fn1: FlagSetAssignmentFn = () => {
        calls.push(1);
        return null;
      };

      const fn2: FlagSetAssignmentFn = () => {
        calls.push(2);
        return 'test-set';
      };

      const fn3: FlagSetAssignmentFn = () => {
        calls.push(3);
        return 'should-not-reach';
      };

      // Temporarily replace assignment functions
      const originalFunctions = [...ASSIGNMENT_FUNCTIONS];
      ASSIGNMENT_FUNCTIONS.length = 0;
      ASSIGNMENT_FUNCTIONS.push(fn1, fn2, fn3);

      const result = determineFlagSet(request, env);

      // Restore original functions
      ASSIGNMENT_FUNCTIONS.length = 0;
      ASSIGNMENT_FUNCTIONS.push(...originalFunctions);

      expect(result).toBe('test-set');
      expect(calls).toEqual([1, 2]); // fn3 should not be called
    });
  });

  describe('ASSIGNMENT_FUNCTIONS', () => {
    it('should have at least one assignment function', () => {
      expect(ASSIGNMENT_FUNCTIONS.length).toBeGreaterThan(0);
    });

    it('should include assignByEnvironment', () => {
      expect(ASSIGNMENT_FUNCTIONS).toContain(assignByEnvironment);
    });
  });

  describe('DEFAULT_FLAG_SET_ID', () => {
    it('should be defined', () => {
      expect(DEFAULT_FLAG_SET_ID).toBeDefined();
      expect(typeof DEFAULT_FLAG_SET_ID).toBe('string');
    });

    it('should be production', () => {
      expect(DEFAULT_FLAG_SET_ID).toBe('production');
    });
  });
});
