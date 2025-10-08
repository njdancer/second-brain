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
      branches: 71,      // OAuth + debug logging add uncovered branches
      functions: 77,     // HTTP handlers + OAuth endpoints need integration tests
      lines: 80,         // Core logic well-covered, OAuth/discovery endpoints need e2e tests
      statements: 80     // Debug logging + defensive error handling
    }
  },
  testMatch: [
    '**/test/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
