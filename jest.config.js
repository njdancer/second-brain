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
      branches: 85,      // 86.48% achieved (uncovered branches in placeholder endpoints)
      functions: 95,     // 96.2% achieved
      lines: 95,         // 95.17% achieved
      statements: 95     // 95.13% achieved
    }
  },
  testMatch: [
    '**/test/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
