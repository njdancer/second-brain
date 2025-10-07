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
      branches: 78,      // Transport integration paths require e2e testing
      functions: 80,     // HTTP handlers need integration tests
      lines: 85,         // Core logic well-covered, integration paths pending
      statements: 85     // Realistic for integration code
    }
  },
  testMatch: [
    '**/test/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
