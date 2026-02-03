/** @type {import('knip').KnipConfig} */
module.exports = {
  project: [
    'src/**/*.ts',
    '!src/migration/*.ts', // Migrations don't have an 'entry point'
  ],
  includeEntryExports: true,
  ignoreBinaries: [
    'open', // Default available on macOS
  ],
  ignoreDependencies: [
    // Known issues with devDependencies:
    '@automock/adapters.nestjs', // Auto-loaded by @automock/jest
    '@compodoc/compodoc', // Only used 'manually', see README.md
    'supertest', // Used in integration tests, but not directly imported
    'eslint-plugin-custom-rules', // Only imported in config, not in code
    'eslint-plugin-jest', // Only imported in config, not in code
  ],
  rules: {
    binaries: 'error',
    dependencies: 'error',
    devDependencies: 'error',
    exports: 'error',
    enumMembers: 'error',
    types: 'error',
    unlisted: 'error',
  },

  // Plugin-specific:
  jest: {
    config: 'jest.{integration,unit}.config.js',
  },
};
