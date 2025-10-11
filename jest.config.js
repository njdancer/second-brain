module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/archive/**',          // Exclude archived files from coverage
    '!src/oauth-handler.ts',    // Old OAuth implementation (to be removed)
    '!src/index.ts',            // OAuth library wrapper - requires integration tests
    '!src/oauth-ui-handler.ts', // Arctic integration - requires E2E OAuth flow
    '!src/mcp-api-handler.ts'   // OAuthProvider integration - requires E2E OAuth flow
  ],
  coverageThreshold: {
    global: {
      branches: 70,      // OAuth + GitHub API integration add uncovered branches
      functions: 77,     // HTTP handlers + OAuth endpoints need integration tests
      lines: 79,         // Core logic well-covered, debug logging lowers coverage slightly
      statements: 79     // Debug logging + defensive error handling
    }
  },
  testMatch: [
    '**/test/**/*.test.ts',
    '!**/test/archive/**'  // Exclude archived tests
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^cloudflare:workers$': '<rootDir>/test/mocks/cloudflare-workers.ts'
  }
};
