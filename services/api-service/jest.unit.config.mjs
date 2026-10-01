import { transform, transformIgnorePatterns } from './jest.transform.mjs';

/** @type {import('jest').Config} */
export default {
  rootDir: '.',
  testMatch: ['<rootDir>/**/*.spec.ts'],
  coverageReporters: ['json', 'lcov'],
  collectCoverageFrom: ['src/**/*.ts', '!src/migration/**'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  moduleNameMapper: {
    '^@api-service/(.*)$': '<rootDir>/$1',
  },
  transform,
  transformIgnorePatterns,
  randomize: true,
  verbose: true,
  reporters: [
    'jest-ci-spec-reporter',
    ['github-actions', { silent: false }],
    'summary',
  ],
};
