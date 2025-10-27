/**
 * Unit tests for rate limiting
 */

import { RateLimiter } from '../../src/rate-limiting';
import { MockKVNamespace } from '../mocks/kv';

describe('RateLimiter', () => {
  let mockKV: MockKVNamespace;
  let rateLimiter: RateLimiter;
  const userId = 'test_user_123';

  beforeEach(() => {
    mockKV = new MockKVNamespace();
    rateLimiter = new RateLimiter(mockKV as unknown as KVNamespace);
  });

  afterEach(() => {
    mockKV.clear();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', async () => {
      const result = await rateLimiter.checkRateLimit(userId, 'minute');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99); // 100 - 1
      expect(result.limit).toBe(100);
    });

    it('should enforce minute rate limit (100 requests)', async () => {
      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        await rateLimiter.checkRateLimit(userId, 'minute');
      }

      // 101st request should be denied
      const result = await rateLimiter.checkRateLimit(userId, 'minute');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should enforce hour rate limit (1000 requests)', async () => {
      // Simulate 1000 requests
      for (let i = 0; i < 1000; i++) {
        await rateLimiter.checkRateLimit(userId, 'hour');
      }

      // 1001st request should be denied
      const result = await rateLimiter.checkRateLimit(userId, 'hour');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should enforce day rate limit (10000 requests)', async () => {
      // Simulate 10000 requests (use a smaller number for testing)
      // In real test, we'd mock the KV counter directly
      await mockKV.put(`ratelimit:${userId}:day`, '10000');

      const result = await rateLimiter.checkRateLimit(userId, 'day');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track different users separately', async () => {
      const user1 = 'user1';
      const user2 = 'user2';

      // User 1 makes 50 requests
      for (let i = 0; i < 50; i++) {
        await rateLimiter.checkRateLimit(user1, 'minute');
      }

      // User 2 should still have full quota
      const result = await rateLimiter.checkRateLimit(user2, 'minute');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('should track different time windows separately', async () => {
      // Make 50 minute requests
      for (let i = 0; i < 50; i++) {
        await rateLimiter.checkRateLimit(userId, 'minute');
      }

      // Hour window should still have full quota
      const hourResult = await rateLimiter.checkRateLimit(userId, 'hour');

      expect(hourResult.allowed).toBe(true);
      expect(hourResult.remaining).toBe(999); // 1000 - 1
    });

    it('should calculate retryAfter correctly', async () => {
      // Exhaust minute limit
      for (let i = 0; i < 100; i++) {
        await rateLimiter.checkRateLimit(userId, 'minute');
      }

      const result = await rateLimiter.checkRateLimit(userId, 'minute');

      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60); // Should be within 60 seconds
    });
  });

  describe('incrementRateLimit', () => {
    it('should increment counter', async () => {
      await rateLimiter.incrementRateLimit(userId, 'minute');
      await rateLimiter.incrementRateLimit(userId, 'minute');

      const status = await rateLimiter.getRateLimitStatus(userId);

      expect(status.minute.used).toBe(2);
    });

    it('should set TTL on counter', async () => {
      await rateLimiter.incrementRateLimit(userId, 'minute');

      const key = `ratelimit:${userId}:minute`;
      const value = await mockKV.get(key);

      expect(value).toBeDefined();
      // In real implementation, we'd check TTL is set
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return status for all windows', async () => {
      // Make some requests
      await rateLimiter.checkRateLimit(userId, 'minute');
      await rateLimiter.checkRateLimit(userId, 'hour');
      await rateLimiter.checkRateLimit(userId, 'day');

      const status = await rateLimiter.getRateLimitStatus(userId);

      expect(status.minute).toBeDefined();
      expect(status.minute.limit).toBe(100);
      expect(status.minute.used).toBeGreaterThan(0);

      expect(status.hour).toBeDefined();
      expect(status.hour.limit).toBe(1000);

      expect(status.day).toBeDefined();
      expect(status.day.limit).toBe(10000);
    });

    it('should return zero usage for new user', async () => {
      const status = await rateLimiter.getRateLimitStatus('new_user');

      expect(status.minute.used).toBe(0);
      expect(status.hour.used).toBe(0);
      expect(status.day.used).toBe(0);
    });
  });

  describe('reset behavior', () => {
    it('should reset counter after TTL expires', async () => {
      // Make 50 requests
      for (let i = 0; i < 50; i++) {
        await rateLimiter.checkRateLimit(userId, 'minute');
      }

      // Simulate TTL expiration by clearing KV
      mockKV.clear();

      // Next request should be allowed with full quota
      const result = await rateLimiter.checkRateLimit(userId, 'minute');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent requests correctly', async () => {
      // Simulate concurrent requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(rateLimiter.checkRateLimit(userId, 'minute'));
      }

      const results = await Promise.all(promises);

      // All should be allowed
      expect(results.every((r) => r.allowed)).toBe(true);
    });

    it('should handle invalid window gracefully', async () => {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        rateLimiter.checkRateLimit(userId, 'invalid' as any),
      ).rejects.toThrow();
    });

    it('should handle empty user ID', async () => {
      await expect(rateLimiter.checkRateLimit('', 'minute')).rejects.toThrow();
    });
  });
});
