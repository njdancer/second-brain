/**
 * Monitoring and metrics collection for Cloudflare Analytics Engine
 * Tracks tool usage, errors, storage, rate limits, and OAuth events
 */

// Cloudflare Analytics Engine bindings (available in Workers environment)
export interface AnalyticsEngineDataset {
  writeDataPoint(data: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }): void;
}

export class MonitoringService {
  constructor(private analytics: AnalyticsEngineDataset) {}

  /**
   * Record a tool call with duration and success status
   * @param toolName Name of the tool (read, write, edit, glob, grep)
   * @param userId User ID (will be anonymized)
   * @param duration Duration in milliseconds
   * @param success Whether the tool call succeeded
   */
  async recordToolCall(
    toolName: string,
    userId: string | undefined,
    duration: number,
    success: boolean
  ): Promise<void> {
    try {
      const anonymizedUserId = await this.anonymizeUserId(userId);

      this.analytics.writeDataPoint({
        indexes: ['tool_call', toolName, success ? 'success' : 'failure'],
        doubles: [duration],
        blobs: [anonymizedUserId],
      });
    } catch (error) {
      // Silent failure - monitoring should never break the app
      console.error('Failed to record tool call:', error);
    }
  }

  /**
   * Record an error with HTTP status code and context
   * @param errorCode HTTP status code (400, 404, 500, etc.)
   * @param userId User ID (will be anonymized)
   * @param context Error context (will be sanitized to remove PII)
   */
  async recordError(
    errorCode: number,
    userId: string | undefined,
    context: string
  ): Promise<void> {
    try {
      const anonymizedUserId = await this.anonymizeUserId(userId);
      const sanitizedContext = this.sanitizeContext(context, userId);

      this.analytics.writeDataPoint({
        indexes: ['error', errorCode.toString()],
        doubles: [errorCode],
        blobs: [anonymizedUserId, sanitizedContext],
      });
    } catch (error) {
      console.error('Failed to record error:', error);
    }
  }

  /**
   * Record storage usage metrics
   * @param userId User ID (will be anonymized)
   * @param totalBytes Total storage used in bytes
   * @param fileCount Number of files
   */
  async recordStorageMetrics(
    userId: string | undefined,
    totalBytes: number,
    fileCount: number
  ): Promise<void> {
    try {
      const anonymizedUserId = await this.anonymizeUserId(userId);

      this.analytics.writeDataPoint({
        indexes: ['storage_metrics'],
        doubles: [totalBytes, fileCount],
        blobs: [anonymizedUserId],
      });
    } catch (error) {
      console.error('Failed to record storage metrics:', error);
    }
  }

  /**
   * Record rate limit hit
   * @param userId User ID (will be anonymized)
   * @param window Time window (minute, hour, day)
   * @param limit The limit that was hit
   */
  async recordRateLimitHit(
    userId: string | undefined,
    window: string,
    limit: number
  ): Promise<void> {
    try {
      const anonymizedUserId = await this.anonymizeUserId(userId);

      this.analytics.writeDataPoint({
        indexes: ['rate_limit', window],
        doubles: [limit],
        blobs: [anonymizedUserId],
      });
    } catch (error) {
      console.error('Failed to record rate limit hit:', error);
    }
  }

  /**
   * Record OAuth authentication event
   * @param userId User ID (will be anonymized)
   * @param status 'success' or 'failure'
   */
  async recordOAuthEvent(
    userId: string | undefined,
    status: 'success' | 'failure'
  ): Promise<void> {
    try {
      const anonymizedUserId = await this.anonymizeUserId(userId);

      this.analytics.writeDataPoint({
        indexes: ['oauth', status],
        blobs: [anonymizedUserId],
      });
    } catch (error) {
      console.error('Failed to record OAuth event:', error);
    }
  }

  /**
   * Record backup completion event
   * @param filesBackedUp Number of files backed up
   * @param filesSkipped Number of files skipped
   * @param totalBytes Total bytes backed up
   */
  recordBackupEvent(
    filesBackedUp: number,
    filesSkipped: number,
    totalBytes: number
  ): void {
    try {
      this.analytics.writeDataPoint({
        indexes: ['backup'],
        doubles: [filesBackedUp, filesSkipped, totalBytes],
      });
    } catch (error) {
      console.error('Failed to record backup event:', error);
    }
  }

  /**
   * Anonymize user ID using SHA-256 hash
   * Returns a consistent hash for the same user ID
   * Uses Web Crypto API (available in Cloudflare Workers)
   * @param userId User ID to anonymize
   * @returns Hashed user ID (first 16 characters)
   */
  private async anonymizeUserId(userId: string | undefined): Promise<string> {
    if (!userId || userId.trim() === '') {
      return 'anonymous';
    }

    // Use Web Crypto API (available in Cloudflare Workers)
    const encoder = new TextEncoder();
    const data = encoder.encode(userId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16);
  }

  /**
   * Sanitize context string to remove PII
   * @param context Context string
   * @param userId User ID to remove
   * @returns Sanitized context
   */
  private sanitizeContext(context: string, userId: string | undefined): string {
    let sanitized = context;

    // Remove user ID if present
    if (userId && userId.trim() !== '') {
      sanitized = sanitized.replace(new RegExp(userId, 'g'), '[USER]');
    }

    // Truncate to 200 characters
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200) + '...';
    }

    return sanitized;
  }
}
