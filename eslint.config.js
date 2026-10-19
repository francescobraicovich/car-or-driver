import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    // Generated data and research artefacts are not linted.
    ignores: [
      'node_modules/**',
      'data/**',
      'research/**',
      'dist/**',
      'site/vendor/**',
      'packages/core/src/elo-forecast-heads.js',
      'packages/core/src/state-space/forecast-heads.js',
      'packages/core/src/presets/tuned-*.js',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // The BOM regex ﻿ is written escaped in source but flagged by some parsers.
      'no-irregular-whitespace': ['error', { skipRegExps: true, skipStrings: true, skipComments: true }],
    },
  },
  {
    files: ['site/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['tests/worker-test-shim.mjs'],
    languageOptions: { globals: { self: 'writable' } },
  },
  {
    files: ['site/js/build-worker.js'],
    languageOptions: { globals: { ...globals.worker } },
  },
];
