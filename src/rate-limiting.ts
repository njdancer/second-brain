/**
 * Rate limiting implementation using KV storage
 * Enforces per-user rate limits across multiple time windows
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number;
}

export interface WindowStatus {
  limit: number;
  used: number;
  remaining: number;
}

export interface RateLimitStatus {
  minute: WindowStatus;
  hour: WindowStatus;
  day: WindowStatus;
}

export type TimeWindow = 'minute' | 'hour' | 'day';

const RATE_LIMITS: Record<TimeWindow, number> = {
  minute: 100,
  hour: 1000,
  day: 10000,
};

const WINDOW_SECONDS: Record<TimeWindow, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
};

export class RateLimiter {
  constructor(private kv: KVNamespace) {}

  /**
   * Check if a request should be allowed based on rate limits
   * Automatically increments the counter if allowed
   */
  async checkRateLimit(userId: string, window: TimeWindow): Promise<RateLimitResult> {
    this.validateInputs(userId, window);

    const limit = RATE_LIMITS[window];
    const key = this.getKey(userId, window);

    // Get current count
    const currentStr = await this.kv.get(key);
    const current = currentStr ? parseInt(currentStr, 10) : 0;

    // Check if limit exceeded
    if (current >= limit) {
      const retryAfter = this.calculateRetryAfter(key);
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfter,
      };
    }

    // Increment counter
    await this.incrementRateLimit(userId, window);

    return {
      allowed: true,
      limit,
      remaining: limit - current - 1,
    };
  }

  /**
   * Increment the rate limit counter for a user and window
   */
  async incrementRateLimit(userId: string, window: TimeWindow): Promise<void> {
    this.validateInputs(userId, window);

    const key = this.getKey(userId, window);
    const ttl = WINDOW_SECONDS[window];

    // Get current value
    const currentStr = await this.kv.get(key);
    const current = currentStr ? parseInt(currentStr, 10) : 0;

    // Increment and store with TTL
    await this.kv.put(key, (current + 1).toString(), { expirationTtl: ttl });
  }

  /**
   * Get the current rate limit status for a user across all windows
   */
  async getRateLimitStatus(userId: string): Promise<RateLimitStatus> {
    if (!userId || userId.trim().length === 0) {
      throw new Error('Invalid user ID');
    }

    const status: RateLimitStatus = {
      minute: await this.getWindowStatus(userId, 'minute'),
      hour: await this.getWindowStatus(userId, 'hour'),
      day: await this.getWindowStatus(userId, 'day'),
    };

    return status;
  }

  /**
   * Get status for a specific window
   */
  private async getWindowStatus(userId: string, window: TimeWindow): Promise<WindowStatus> {
    const key = this.getKey(userId, window);
    const limit = RATE_LIMITS[window];

    const currentStr = await this.kv.get(key);
    const used = currentStr ? parseInt(currentStr, 10) : 0;

    return {
      limit,
      used,
      remaining: Math.max(0, limit - used),
    };
  }

  /**
   * Calculate how long until the rate limit resets
   */
  private calculateRetryAfter(key: string): number {
    // In a real implementation, we'd get the TTL from KV
    // For now, return a reasonable default based on the key
    if (key.includes(':minute')) {
      return 60;
    } else if (key.includes(':hour')) {
      return 3600;
    } else {
      return 86400;
    }
  }

  /**
   * Generate KV key for rate limit counter
   */
  private getKey(userId: string, window: TimeWindow): string {
    return `ratelimit:${userId}:${window}`;
  }

  /**
   * Validate inputs
   */
  private validateInputs(userId: string, window: TimeWindow): void {
    if (!userId || userId.trim().length === 0) {
      throw new Error('Invalid user ID');
    }

    if (!['minute', 'hour', 'day'].includes(window)) {
      throw new Error(`Invalid time window: ${window}`);
    }
  }
}
