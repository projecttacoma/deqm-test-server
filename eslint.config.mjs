// @ts-check

import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default defineConfig(
  globalIgnores(['build', 'ecqm-content*']),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
);
