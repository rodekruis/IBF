export default {
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
  moduleNameMapper: {
    '^@api-service/(.*)$': '<rootDir>/../services/api-service/$1',
    '^~/(.*)$': '<rootDir>/src/app/$1',
    '^~environment$': '<rootDir>/src/environments/environment',
    '^(_.*)\\.mjs$': '<rootDir>/$1.mjs',
    '^tailwind.config$': '<rootDir>/tailwind.config',
  },
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      {
        stringifyContentPathRegex: '\\.html$',
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
};
