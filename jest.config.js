/* eslint-disable */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
};
