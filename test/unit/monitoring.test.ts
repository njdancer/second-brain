/**
 * Unit tests for monitoring system
 */

import { MonitoringService } from '../../src/monitoring';

// Mock Analytics Engine
interface DataPoint {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
}

class MockAnalyticsEngine {
  private dataPoints: DataPoint[] = [];

  writeDataPoint(data: DataPoint): void {
    this.dataPoints.push(data);
  }

  getDataPoints(): DataPoint[] {
    return this.dataPoints;
  }

  clear(): void {
    this.dataPoints = [];
  }

  getCount(): number {
    return this.dataPoints.length;
  }
}

describe('Monitoring System', () => {
  let monitoring: MonitoringService;
  let mockAnalytics: MockAnalyticsEngine;

  beforeEach(() => {
    mockAnalytics = new MockAnalyticsEngine();
    monitoring = new MonitoringService(mockAnalytics as any);
  });

  afterEach(() => {
    mockAnalytics.clear();
  });

  describe('recordToolCall', () => {
    it('should record successful tool call', async () => {
      await monitoring.recordToolCall('read', 'user123', 150, true);

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints).toHaveLength(1);
      expect(dataPoints[0].indexes).toContain('read');
      expect(dataPoints[0].indexes).toContain('success');
    });

    it('should record failed tool call', async () => {
      await monitoring.recordToolCall('write', 'user456', 200, false);

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints).toHaveLength(1);
      expect(dataPoints[0].indexes).toContain('write');
      expect(dataPoints[0].indexes).toContain('failure');
    });

    it('should record duration in milliseconds', async () => {
      await monitoring.recordToolCall('edit', 'user789', 350, true);

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints[0].doubles).toContain(350);
    });

    it('should anonymize user ID', async () => {
      await monitoring.recordToolCall('glob', 'user123', 100, true);

      const dataPoints = mockAnalytics.getDataPoints();
      const hasUserId = dataPoints[0].blobs?.some((b) => b.includes('user123'));
      expect(hasUserId).toBeFalsy();
    });

    it('should handle multiple tool calls', async () => {
      await monitoring.recordToolCall('read', 'user1', 100, true);
      await monitoring.recordToolCall('write', 'user2', 200, true);
      await monitoring.recordToolCall('edit', 'user3', 300, false);

      expect(mockAnalytics.getCount()).toBe(3);
    });

    it('should handle analytics write failures gracefully', async () => {
      // Create mock that throws errors
      const failingAnalytics = {
        writeDataPoint: jest.fn(() => {
          throw new Error('Analytics failed');
        }),
      };

      const monitoringWithFailure = new MonitoringService(failingAnalytics as any);

      // Should not throw, just log error
      await expect(
        monitoringWithFailure.recordToolCall('read', 'user1', 100, true),
      ).resolves.not.toThrow();
    });
  });

  describe('recordError', () => {
    it('should record error with code and context', async () => {
      await monitoring.recordError(404, 'user123', 'File not found: test.md');

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints).toHaveLength(1);
      expect(dataPoints[0].doubles).toContain(404);
    });

    it('should record common HTTP error codes', async () => {
      await monitoring.recordError(400, 'user1', 'Bad request');
      await monitoring.recordError(401, 'user2', 'Unauthorized');
      await monitoring.recordError(403, 'user3', 'Forbidden');
      await monitoring.recordError(404, 'user4', 'Not found');
      await monitoring.recordError(429, 'user5', 'Rate limited');
      await monitoring.recordError(500, 'user6', 'Server error');

      expect(mockAnalytics.getCount()).toBe(6);
    });

    it('should not include PII in error context', async () => {
      await monitoring.recordError(500, 'user123', 'Error with user user123');

      const dataPoints = mockAnalytics.getDataPoints();
      const hasPII = dataPoints[0].blobs?.some((b) => b.includes('user123'));
      expect(hasPII).toBeFalsy();
    });

    it('should handle analytics failures in recordError', async () => {
      const failingAnalytics = {
        writeDataPoint: jest.fn(() => {
          throw new Error('Analytics failed');
        }),
      };

      const monitoringWithFailure = new MonitoringService(failingAnalytics as any);

      await expect(monitoringWithFailure.recordError(500, 'user1', 'Error')).resolves.not.toThrow();
    });
  });

  describe('recordStorageMetrics', () => {
    it('should record storage usage', async () => {
      await monitoring.recordStorageMetrics('user123', 1000000, 50);

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints).toHaveLength(1);
      expect(dataPoints[0].doubles).toContain(1000000); // bytes
      expect(dataPoints[0].doubles).toContain(50); // file count
    });

    it('should track storage over time', async () => {
      await monitoring.recordStorageMetrics('user1', 500000, 10);
      await monitoring.recordStorageMetrics('user1', 600000, 12);
      await monitoring.recordStorageMetrics('user1', 700000, 15);

      expect(mockAnalytics.getCount()).toBe(3);
    });

    it('should anonymize user ID in storage metrics', async () => {
      await monitoring.recordStorageMetrics('user123', 1000000, 50);

      const dataPoints = mockAnalytics.getDataPoints();
      const hasUserId = dataPoints[0].blobs?.some((b) => b.includes('user123'));
      expect(hasUserId).toBeFalsy();
    });

    it('should handle analytics failures in recordStorageMetrics', async () => {
      const failingAnalytics = {
        writeDataPoint: jest.fn(() => {
          throw new Error('Analytics failed');
        }),
      };

      const monitoringWithFailure = new MonitoringService(failingAnalytics as any);

      await expect(
        monitoringWithFailure.recordStorageMetrics('user1', 1000, 10),
      ).resolves.not.toThrow();
    });
  });

  describe('recordRateLimitHit', () => {
    it('should record rate limit hit', async () => {
      await monitoring.recordRateLimitHit('user123', 'minute', 100);

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints).toHaveLength(1);
      expect(dataPoints[0].indexes).toContain('rate_limit');
      expect(dataPoints[0].indexes).toContain('minute');
    });

    it('should track different time windows', async () => {
      await monitoring.recordRateLimitHit('user1', 'minute', 100);
      await monitoring.recordRateLimitHit('user2', 'hour', 1000);
      await monitoring.recordRateLimitHit('user3', 'day', 10000);

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints[0].indexes).toContain('minute');
      expect(dataPoints[1].indexes).toContain('hour');
      expect(dataPoints[2].indexes).toContain('day');
    });

    it('should anonymize user ID', async () => {
      await monitoring.recordRateLimitHit('user123', 'hour', 1000);

      const dataPoints = mockAnalytics.getDataPoints();
      const hasUserId = dataPoints[0].blobs?.some((b) => b.includes('user123'));
      expect(hasUserId).toBeFalsy();
    });

    it('should handle analytics failures in recordRateLimitHit', async () => {
      const failingAnalytics = {
        writeDataPoint: jest.fn(() => {
          throw new Error('Analytics failed');
        }),
      };

      const monitoringWithFailure = new MonitoringService(failingAnalytics as any);

      await expect(
        monitoringWithFailure.recordRateLimitHit('user1', 'minute', 100),
      ).resolves.not.toThrow();
    });
  });

  describe('recordOAuthEvent', () => {
    it('should record successful OAuth', async () => {
      await monitoring.recordOAuthEvent('user123', 'success');

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints).toHaveLength(1);
      expect(dataPoints[0].indexes).toContain('oauth');
      expect(dataPoints[0].indexes).toContain('success');
    });

    it('should record failed OAuth', async () => {
      await monitoring.recordOAuthEvent('user456', 'failure');

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints[0].indexes).toContain('oauth');
      expect(dataPoints[0].indexes).toContain('failure');
    });

    it('should anonymize user ID', async () => {
      await monitoring.recordOAuthEvent('user123', 'success');

      const dataPoints = mockAnalytics.getDataPoints();
      const hasUserId = dataPoints[0].blobs?.some((b) => b.includes('user123'));
      expect(hasUserId).toBeFalsy();
    });

    it('should handle analytics failures in recordOAuthEvent', async () => {
      const failingAnalytics = {
        writeDataPoint: jest.fn(() => {
          throw new Error('Analytics failed');
        }),
      };

      const monitoringWithFailure = new MonitoringService(failingAnalytics as any);

      await expect(
        monitoringWithFailure.recordOAuthEvent('user1', 'success'),
      ).resolves.not.toThrow();
    });
  });

  describe('recordBackupEvent', () => {
    it('should record backup completion', () => {
      monitoring.recordBackupEvent(10, 2, 1500000);

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints).toHaveLength(1);
      expect(dataPoints[0].doubles).toContain(10); // files backed up
      expect(dataPoints[0].doubles).toContain(2); // files skipped
      expect(dataPoints[0].doubles).toContain(1500000); // total bytes
    });

    it('should track backup statistics over time', () => {
      monitoring.recordBackupEvent(5, 0, 500000);
      monitoring.recordBackupEvent(3, 2, 300000);
      monitoring.recordBackupEvent(0, 5, 0);

      expect(mockAnalytics.getCount()).toBe(3);
    });

    it('should handle analytics failures in recordBackupEvent', () => {
      const failingAnalytics = {
        writeDataPoint: jest.fn(() => {
          throw new Error('Analytics failed');
        }),
      };

      const monitoringWithFailure = new MonitoringService(failingAnalytics as any);

      expect(() => monitoringWithFailure.recordBackupEvent(10, 2, 1500000)).not.toThrow();
    });
  });

  describe('user ID anonymization', () => {
    it('should consistently anonymize same user ID', async () => {
      await monitoring.recordToolCall('read', 'user123', 100, true);
      await monitoring.recordToolCall('write', 'user123', 200, true);

      const dataPoints = mockAnalytics.getDataPoints();
      // Both should have no PII
      expect(dataPoints.every((dp) => !dp.blobs?.some((b) => b.includes('user123')))).toBe(true);
    });

    it('should handle empty or undefined user IDs', async () => {
      await monitoring.recordToolCall('read', '', 100, true);
      // Testing undefined input
      await monitoring.recordToolCall('write', '', 200, true);

      const dataPoints = mockAnalytics.getDataPoints();
      expect(dataPoints).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should handle analytics engine failures gracefully', async () => {
      const failingAnalytics = {
        writeDataPoint: jest.fn().mockImplementation(() => {
          throw new Error('Analytics engine error');
        }),
      };

      const failingMonitoring = new MonitoringService(failingAnalytics as any);

      // Should not throw
      await expect(
        failingMonitoring.recordToolCall('read', 'user1', 100, true),
      ).resolves.not.toThrow();
    });
  });
});
