// Shared SWC transform for Jest. SWC compiles the app's TypeScript (with the
// decorator metadata NestJS relies on) and down-compiles the ESM-only
// `@nestjs`/`@t3-oss` packages to CommonJS so Jest's runtime can load them.
const swcOptions = {
  jsc: {
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
    target: 'es2022',
  },
  module: { type: 'commonjs' },
};

const swcEsmOptions = {
  jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
  module: { type: 'commonjs' },
};

export const transform = {
  '^.+\\.ts$': ['@swc/jest', swcOptions],
  'node_modules/(@t3-oss|@nestjs)/.+\\.js$': ['@swc/jest', swcEsmOptions],
};

export const transformIgnorePatterns = ['node_modules/(?!(@t3-oss|@nestjs))'];
