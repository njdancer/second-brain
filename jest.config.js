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
      branches: 70,      // OAuth + GitHub API integration add uncovered branches
      functions: 77,     // HTTP handlers + OAuth endpoints need integration tests
      lines: 79,         // Core logic well-covered, debug logging lowers coverage slightly
      statements: 79     // Debug logging + defensive error handling
    }
  },
  testMatch: [
    '**/test/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
