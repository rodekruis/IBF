import js from '@eslint/js';
import eslintComments from 'eslint-plugin-eslint-comments';
import n from 'eslint-plugin-n';
import prettier from 'eslint-plugin-prettier';
import promise from 'eslint-plugin-promise';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import typescript from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2021,
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
      ecmaVersion: 2021,
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
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...typescript.configs['stylistic-type-checked'].rules,
      ...eslintComments.configs.recommended.rules,
      ...promise.configs.recommended.rules,
      ...prettier.configs.recommended.rules,
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
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
      'n/no-process-env': 'error',
      'n/prefer-node-protocol': 'error',
      'object-shorthand': 'error',
      'promise/no-nesting': 'error',
      'promise/no-callback-in-promise': 'error',
      'promise/no-multiple-resolved': 'error',
      'promise/no-promise-in-callback': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/prefer-await-to-callbacks': 'error',
      'promise/prefer-await-to-then': 'error',
      'promise/valid-params': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^@?\\w'], ['^@api-service'], ['^@ibf-e2e'], ['^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    },
  },
];
