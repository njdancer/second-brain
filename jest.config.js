module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 72,      // OAuth discovery endpoints + Real GitHub API calls add error handling paths
      functions: 77,     // HTTP handlers + OAuth endpoints need integration tests
      lines: 80,         // Core logic well-covered, OAuth/discovery endpoints need e2e tests
      statements: 81     // Defensive error handling in OAuth + production API calls
    }
  },
  testMatch: [
    '**/test/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
