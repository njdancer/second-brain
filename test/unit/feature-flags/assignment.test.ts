/**
 * Tests for flag set assignment functions
 */

import {
  determineFlagSet,
  DEFAULT_FLAG_SET_ID,
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
  describe('determineFlagSet', () => {
    it('should return DEFAULT_FLAG_SET_ID with no assignment functions', () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();

      const result = determineFlagSet(request, env);

      expect(result).toBe(DEFAULT_FLAG_SET_ID);
    });

    it('should return DEFAULT_FLAG_SET_ID if all functions return null', () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();

      const fn1: FlagSetAssignmentFn = () => null;
      const fn2: FlagSetAssignmentFn = () => null;

      const result = determineFlagSet(request, env, [fn1, fn2]);

      expect(result).toBe(DEFAULT_FLAG_SET_ID);
    });

    it('should return flag set from first matching assignment function', () => {
      const request = new Request('https://example.com');
      const env = createMockEnv();

      const fn1: FlagSetAssignmentFn = () => 'client:test';

      const result = determineFlagSet(request, env, [fn1]);

      expect(result).toBe('client:test');
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
        return 'env:production';
      };

      const fn3: FlagSetAssignmentFn = () => {
        calls.push(3);
        return 'should-not-reach';
      };

      const result = determineFlagSet(request, env, [fn1, fn2, fn3]);

      expect(result).toBe('env:production');
      expect(calls).toEqual([1, 2]); // fn3 should not be called
    });

    it('should support custom assignment logic based on request', () => {
      const env = createMockEnv();

      const assignByUserAgent: FlagSetAssignmentFn = (req) => {
        const userAgent = req.headers.get('user-agent');
        if (userAgent?.includes('TestClient')) return 'client:test';
        return null;
      };

      const testRequest = new Request('https://example.com', {
        headers: { 'user-agent': 'TestClient/1.0' },
      });
      const normalRequest = new Request('https://example.com', {
        headers: { 'user-agent': 'Mozilla/5.0' },
      });

      expect(determineFlagSet(testRequest, env, [assignByUserAgent])).toBe('client:test');
      expect(determineFlagSet(normalRequest, env, [assignByUserAgent])).toBe(DEFAULT_FLAG_SET_ID);
    });

    it('should support multiple assignment strategies', () => {
      const request = new Request('https://example.com/api');
      const env = createMockEnv();

      const assignByPath: FlagSetAssignmentFn = (req) => {
        const url = new URL(req.url);
        if (url.pathname.startsWith('/api')) return 'custom:api';
        return null;
      };

      const assignByDomain: FlagSetAssignmentFn = (req) => {
        const url = new URL(req.url);
        if (url.hostname.includes('staging')) return 'env:staging';
        return null;
      };

      const result = determineFlagSet(request, env, [assignByPath, assignByDomain]);

      expect(result).toBe('custom:api'); // First function matches
    });
  });

  describe('DEFAULT_FLAG_SET_ID', () => {
    it('should be defined', () => {
      expect(DEFAULT_FLAG_SET_ID).toBeDefined();
      expect(typeof DEFAULT_FLAG_SET_ID).toBe('string');
    });

    it('should be "default"', () => {
      expect(DEFAULT_FLAG_SET_ID).toBe('default');
    });
  });

  describe('FlagSetAssignmentFn type', () => {
    it('should accept valid assignment functions', () => {
      const validFn: FlagSetAssignmentFn = (_req, _env) => 'test';
      expect(typeof validFn).toBe('function');
    });

    it('should allow null return value', () => {
      const nullFn: FlagSetAssignmentFn = () => null;
      expect(nullFn(new Request('https://example.com'), createMockEnv())).toBeNull();
    });
  });
});
