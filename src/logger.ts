/**
 * Structured JSON logging for Cloudflare Workers
 *
 * Provides request correlation, context propagation, and integration with
 * Cloudflare Workers Logs for better observability.
 *
 * @example Basic Usage
 * ```typescript
 * import { Logger, generateRequestId } from './logger.js';
 *
 * // Create root logger with request ID
 * const requestId = generateRequestId();
 * const logger = new Logger({ requestId });
 *
 * // Log at different levels
 * logger.info('Request started', { method: 'POST', url: '/mcp' });
 * logger.debug('Extracting props from context');
 * logger.warn('Approaching rate limit', { current: 95, limit: 100 });
 *
 * // Create child logger with additional context
 * const userLogger = logger.child({ userId: '12345', githubLogin: 'user' });
 * userLogger.info('User authenticated');
 *
 * // Log errors with stack traces
 * try {
 *   // ... operation
 * } catch (error) {
 *   logger.error('Operation failed', error as Error, { operation: 'write' });
 * }
 *
 * // Track operation duration
 * const startTime = Date.now();
 * // ... operation
 * const duration = Date.now() - startTime;
 * logger.info('Operation completed', { duration });
 * ```
 *
 * @example Output Format
 * All logs are output as JSON for structured logging:
 * ```json
 * {
 *   "timestamp": "2025-10-11T12:34:56.789Z",
 *   "level": "INFO",
 *   "message": "User authenticated",
 *   "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
 *   "userId": "12345",
 *   "githubLogin": "user"
 * }
 * ```
 *
 * Error logs include stack traces:
 * ```json
 * {
 *   "timestamp": "2025-10-11T12:34:56.789Z",
 *   "level": "ERROR",
 *   "message": "Operation failed",
 *   "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
 *   "operation": "write",
 *   "error": "File not found",
 *   "stack": "Error: File not found\n    at write (src/tools/write.ts:42:10)\n    ..."
 * }
 * ```
 *
 * @example Best Practices
 * 1. **Always generate requestId at entry points** (mcp-api-handler, oauth-ui-handler)
 * 2. **Create child loggers for context propagation** (don't repeat context in every log call)
 * 3. **Include duration for performance tracking** (use Date.now() timestamps)
 * 4. **Log errors with stack traces** (use logger.error with Error object)
 * 5. **Use appropriate log levels** (DEBUG for verbose, INFO for normal, WARN for issues, ERROR for failures)
 */

export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  githubLogin?: string;
  tool?: string;
  duration?: number;
  method?: string;
  url?: string;
  status?: number;
  window?: string;
  limit?: number;
  [key: string]: any;
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export class Logger {
  constructor(private context: LogContext = {}) {}

  /**
   * Create a child logger that inherits parent context
   */
  child(context: LogContext): Logger {
    return new Logger({ ...this.context, ...context });
  }

  debug(message: string, data?: LogContext): void {
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: LogContext): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: LogContext): void {
    this.log('WARN', message, data);
  }

  error(message: string, error?: Error, data?: LogContext): void {
    this.log('ERROR', message, {
      ...data,
      error: error?.message,
      stack: error?.stack,
    });
  }

  private log(level: LogLevel, message: string, data?: LogContext): void {
    // JSON structured logging for Cloudflare Workers Logs
    const logObject = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...data,
    };

    // Use appropriate console method for the log level
    const consoleMethod = level === 'ERROR' ? console.error :
                         level === 'WARN' ? console.warn :
                         level === 'DEBUG' ? console.debug :
                         console.log;

    try {
      // Try to serialize the full object
      const jsonString = JSON.stringify(logObject);
      consoleMethod(jsonString);
    } catch (error) {
      // Fallback: log what we can + error info
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Logger serialization failed',
        originalMessage: message,
        originalLevel: level,
        serializationError: error instanceof Error ? error.message : String(error),
      }));
      // Also log the original message so it's not lost
      console.error(message, data);
    }
  }
}

/**
 * Generate a unique request ID for correlation
 * Uses crypto.randomUUID() for secure random generation
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
