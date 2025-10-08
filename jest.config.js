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
      branches: 76,      // Real GitHub API calls add error handling paths
      functions: 80,     // HTTP handlers need integration tests
      lines: 84,         // Core logic well-covered, real API paths need e2e tests
      statements: 84     // Defensive error handling in production API calls
    }
  },
  testMatch: [
    '**/test/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
