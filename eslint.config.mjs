// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Ignore generated files and dependencies only
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.wrangler/**',
      '*.config.js',
      '*.config.mjs',
    ],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      eslintConfigPrettier,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow unused vars/args that start with underscore (default doesn't have this)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // Enforce consistent type imports (not enabled by default)
      '@typescript-eslint/consistent-type-imports': 'error',
      // All other strict rules (no-explicit-any, no-unsafe-*, require-await)
      // are already "error" by default in recommendedTypeChecked
    },
  },
  {
    // Test-specific overrides - pragmatic type safety for tests
    files: ['test/**/*.ts'],
    rules: {
      // Warn but allow 'any' in tests for mock flexibility
      '@typescript-eslint/no-explicit-any': 'warn',
      // Warn but allow unsafe operations for mocks
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      // Allow sync functions that return promises (common in test mocks)
      '@typescript-eslint/require-await': 'off',
    },
  },
);
