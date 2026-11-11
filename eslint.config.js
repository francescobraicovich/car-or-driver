import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    // Generated data and research artefacts are not linted.
    ignores: [
      'node_modules/**',
      'tmp/**',
      'data/**',
      'research/forecast/heads-candidate.js',
      // Archived experiments retain the exact source used by their fit reports.
      'research/current-form/**',
      'research/simplification/**',
      'research/stable-ratings/**',
      'research/temporal-graph/**',
      'research/prediction-markets/**',
      // Preserved builder: its exact bytes fingerprint the archived 3D assets.
      'tools/build-stage-models.mjs',
      'dist/**',
      'site/vendor/**',
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
];
