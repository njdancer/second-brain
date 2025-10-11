import { Logger, generateRequestId, type LogContext } from '../../src/logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with empty context', () => {
      const logger = new Logger();
      logger.info('test');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"test"')
      );
    });

    it('should create logger with initial context', () => {
      const logger = new Logger({ requestId: 'req-123', userId: 'user-456' });
      logger.info('test');

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.requestId).toBe('req-123');
      expect(logOutput.userId).toBe('user-456');
    });
  });

  describe('child()', () => {
    it('should inherit parent context', () => {
      const parent = new Logger({ requestId: 'req-123' });
      const child = parent.child({ userId: 'user-456' });

      child.info('test');

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.requestId).toBe('req-123');
      expect(logOutput.userId).toBe('user-456');
    });

    it('should override parent context with child context', () => {
      const parent = new Logger({ requestId: 'req-123', userId: 'user-old' });
      const child = parent.child({ userId: 'user-new' });

      child.info('test');

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.requestId).toBe('req-123');
      expect(logOutput.userId).toBe('user-new');
    });

    it('should support multiple levels of nesting', () => {
      const root = new Logger({ requestId: 'req-123' });
      const child1 = root.child({ userId: 'user-456' });
      const child2 = child1.child({ tool: 'read' });

      child2.info('test');

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.requestId).toBe('req-123');
      expect(logOutput.userId).toBe('user-456');
      expect(logOutput.tool).toBe('read');
    });
  });

  describe('log levels', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger({ requestId: 'req-123' });
    });

    it('should log DEBUG level', () => {
      logger.debug('debug message', { foo: 'bar' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('DEBUG');
      expect(logOutput.message).toBe('debug message');
      expect(logOutput.foo).toBe('bar');
    });

    it('should log INFO level', () => {
      logger.info('info message', { foo: 'bar' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
      expect(logOutput.message).toBe('info message');
      expect(logOutput.foo).toBe('bar');
    });

    it('should log WARN level', () => {
      logger.warn('warn message', { foo: 'bar' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
      expect(logOutput.message).toBe('warn message');
      expect(logOutput.foo).toBe('bar');
    });

    it('should log ERROR level with error object', () => {
      const error = new Error('Test error');
      logger.error('error message', error, { foo: 'bar' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.message).toBe('error message');
      expect(logOutput.error).toBe('Test error');
      expect(logOutput.stack).toBeDefined();
      expect(logOutput.foo).toBe('bar');
    });

    it('should log ERROR level without error object', () => {
      logger.error('error message', undefined, { foo: 'bar' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.message).toBe('error message');
      expect(logOutput.foo).toBe('bar');
    });
  });

  describe('JSON output format', () => {
    it('should output valid JSON', () => {
      const logger = new Logger({ requestId: 'req-123' });
      logger.info('test message', { userId: 'user-456' });

      expect(() => {
        JSON.parse(consoleLogSpy.mock.calls[0][0]);
      }).not.toThrow();
    });

    it('should include timestamp in ISO format', () => {
      const logger = new Logger();
      logger.info('test');

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.timestamp).toBeDefined();
      expect(() => new Date(logOutput.timestamp)).not.toThrow();
      expect(logOutput.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should include all expected fields', () => {
      const logger = new Logger({ requestId: 'req-123' });
      logger.info('test message', { userId: 'user-456', duration: 123 });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput).toMatchObject({
        timestamp: expect.any(String),
        level: 'INFO',
        message: 'test message',
        requestId: 'req-123',
        userId: 'user-456',
        duration: 123,
      });
    });

    it('should handle complex nested data', () => {
      const logger = new Logger();
      const complexData: LogContext = {
        requestId: 'req-123',
        metadata: {
          nested: {
            value: 'test',
          },
        },
        array: [1, 2, 3],
      };

      logger.info('complex test', complexData);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.metadata).toEqual({ nested: { value: 'test' } });
      expect(logOutput.array).toEqual([1, 2, 3]);
    });
  });

  describe('context propagation', () => {
    it('should merge context from constructor and log call', () => {
      const logger = new Logger({ requestId: 'req-123', userId: 'user-456' });
      logger.info('test', { tool: 'read', duration: 100 });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.requestId).toBe('req-123');
      expect(logOutput.userId).toBe('user-456');
      expect(logOutput.tool).toBe('read');
      expect(logOutput.duration).toBe(100);
    });

    it('should override constructor context with log call data', () => {
      const logger = new Logger({ requestId: 'req-old', userId: 'user-456' });
      logger.info('test', { requestId: 'req-new' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.requestId).toBe('req-new');
    });
  });

  describe('error handling', () => {
    it('should extract error message and stack', () => {
      const logger = new Logger();
      const error = new Error('Something went wrong');
      logger.error('Operation failed', error);

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.error).toBe('Something went wrong');
      expect(logOutput.stack).toBeDefined();
      expect(logOutput.stack).toContain('Error: Something went wrong');
    });

    it('should preserve custom error properties', () => {
      const logger = new Logger();
      const error = new Error('Custom error') as any;
      error.code = 'ERR_CUSTOM';

      logger.error('Operation failed', error, { customProp: 'value' });

      const logOutput = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logOutput.error).toBe('Custom error');
      expect(logOutput.customProp).toBe('value');
    });
  });
});

describe('generateRequestId', () => {
  it('should generate a valid UUID', () => {
    const requestId = generateRequestId();
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should generate unique IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    const id3 = generateRequestId();

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it('should generate IDs that can be used as context', () => {
    const requestId = generateRequestId();
    const logger = new Logger({ requestId });

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test');

    const logOutput = JSON.parse(spy.mock.calls[0][0]);
    expect(logOutput.requestId).toBe(requestId);

    spy.mockRestore();
  });
});
