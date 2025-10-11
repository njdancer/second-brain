/**
 * Structured JSON logging for Cloudflare Workers
 *
 * Provides request correlation, context propagation, and integration with
 * Cloudflare Workers Logs for better observability.
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
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...data,
    }));
  }
}

/**
 * Generate a unique request ID for correlation
 * Uses crypto.randomUUID() for secure random generation
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
