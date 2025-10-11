/**
 * Global test setup
 * Silences console output during tests to prevent overwhelming GitHub Actions
 */

// Save original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.debug,
};

// Mock console methods to silence output during tests
// Use DEBUG=true environment variable to enable console output for debugging
const shouldLog = process.env.DEBUG === 'true';

global.console = {
  ...console,
  log: shouldLog ? originalConsole.log : jest.fn(),
  error: shouldLog ? originalConsole.error : jest.fn(),
  warn: shouldLog ? originalConsole.warn : jest.fn(),
  debug: shouldLog ? originalConsole.debug : jest.fn(),
};

// Make original console available for tests that explicitly need it
(global as any).__originalConsole = originalConsole;
