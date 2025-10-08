/**
 * Jest configuration for E2E tests
 *
 * These tests run against the REAL deployed server, not mocks.
 * They verify production actually works.
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/test/e2e/**/*.e2e.ts'
  ],
  // E2E tests take longer
  testTimeout: 30000,
  // Don't run in parallel - they hit real API
  maxWorkers: 1,
  // Don't collect coverage - these are integration tests
  collectCoverage: false,
  // Verbose output for debugging
  verbose: true,
};
