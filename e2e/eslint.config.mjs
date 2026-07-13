import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import n from 'eslint-plugin-n';
import prettier from 'eslint-plugin-prettier';
import promise from 'eslint-plugin-promise';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'test-results/', 'playwright-report/', 'dist/'],
  },
  comments.recommended,
  {
    rules: {
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
      '@eslint-community/eslint-comments/require-description': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      n,
      prettier,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...n.configs.recommended.rules,
      ...prettier.configs.recommended.rules,
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: true,
        tsconfigRootDir: new URL('.', import.meta.url).pathname,
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      promise,
      prettier,
      'simple-import-sort': simpleImportSort,
      n,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...typescript.configs['stylistic-type-checked'].rules,
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
      'n/no-process-env': 'error',
      'n/prefer-node-protocol': 'error',
      'object-shorthand': 'error',
      'promise/prefer-await-to-then': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^@?\\w'], ['^@ibf-e2e'], ['^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    },
  },
];
