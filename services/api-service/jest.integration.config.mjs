import { transform, transformIgnorePatterns } from './jest.transform.mjs';

/** @type {import('jest').Config} */
export default {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  coverageReporters: ['json', 'lcov'],
  collectCoverageFrom: ['src/**/*.ts', '!src/migration/**'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  moduleNameMapper: {
    '^@api-service/(.*)$': '<rootDir>/$1',
  },
  moduleFileExtensions: ['js', 'ts'],
  transform,
  transformIgnorePatterns,
  testTimeout: 30_000,
  randomize: true,
  verbose: true,
  reporters: ['default', ['github-actions', { silent: false }], 'summary'],
  testEnvironmentOptions: {
    globalsCleanup: 'on',
  },
};
