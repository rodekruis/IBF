import js from '@eslint/js';
import eslintComments from 'eslint-plugin-eslint-comments';
import n from 'eslint-plugin-n';
import prettier from 'eslint-plugin-prettier';
import promise from 'eslint-plugin-promise';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import typescript from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import noRelativeImportPaths from 'eslint-plugin-no-relative-import-paths';
import customRules from './eslint-plugin-custom-rules/index.js';

export default [
  {
    ignores: ['dist/', 'tmp/', 'documentation/', 'coverage/', 'knip.config.js'],
  },
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
    },
    plugins: {
      'eslint-comments': eslintComments,
      n,
      prettier,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...eslintComments.configs.recommended.rules,
      ...n.configs.recommended.rules,
      ...prettier.configs.recommended.rules,
      'eslint-comments/no-unused-disable': 'error',
      'eslint-comments/require-description': 'error',
    },
  },
  {
    files: ['*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: true,
        tsconfigRootDir: new URL('.', import.meta.url).pathname,
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      'eslint-comments': eslintComments,
      promise,
      prettier,
      'simple-import-sort': simpleImportSort,
      n,
      'no-relative-import-paths': noRelativeImportPaths,
      'custom-rules': customRules,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...typescript.configs.stylistic.rules,
      ...eslintComments.configs.recommended.rules,
      ...promise.configs.recommended.rules,
      ...prettier.configs.recommended.rules,
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-parameter-properties': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      'eslint-comments/no-unused-disable': 'error',
      'eslint-comments/require-description': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['process', 'node:process'],
              importNames: ['env'],
              message: 'Import ENV-variables from env.ts only.',
            },
          ],
        },
      ],
      'object-shorthand': 'error',
      'promise/no-nesting': 'error',
      'promise/no-callback-in-promise': 'error',
      'promise/no-multiple-resolved': 'error',
      'promise/no-promise-in-callback': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/valid-params': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      'n/no-extraneous-import': [0],
      'n/no-missing-import': [0, { ignoreTypeImport: true }],
      'n/no-process-env': 'error',
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          ignores: ['Headers'],
        },
      ],
      'n/prefer-node-protocol': 'error',
      'no-relative-import-paths/no-relative-import-paths': [
        'warn',
        {
          prefix: '@api-service',
          rootDir: '.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ObjectExpression > .properties[key.name='where'] > .value > .properties:not(:has(CallExpression)), ObjectExpression > .properties[key.name='where'] > .value > .properties > .value > .properties:not(:has(CallExpression))",
          message:
            'Unsafe where condition, that can leak data. Use Equal() instead.',
        },
        {
          selector:
            "ObjectExpression > .properties[key.name='andWhere'] > .value > .properties:not(:has(CallExpression)), ObjectExpression > .properties[key.name='where'] > .value > .properties > .value > .properties:not(:has(CallExpression))",
          message:
            'Unsafe where condition, that can leak data. Use Equal() instead.',
        },
      ],
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^@?\\w'], ['^@api-service'], ['^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
    },
    overrides: [
      {
        files: ['*.entity.ts'],
        rules: {
          'custom-rules/typeorm-cascade-ondelete': 'error',
        },
      },
      {
        files: ['*.controller.ts'],
        rules: {
          'custom-rules/no-method-api-tags': 'error',
        },
      },
      {
        files: ['*.spec.ts', '*.test.ts'],
        rules: {
          // If you want to add Jest rules, import and spread them here
        },
      },
    ],
  },
];
