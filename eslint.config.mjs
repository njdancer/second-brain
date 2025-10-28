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
      // Allow 'any' in tests - it's intentional for mocks, not production code
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow unsafe operations in tests - we're deliberately using mocks
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Allow sync functions that return promises (common in test mocks)
      '@typescript-eslint/require-await': 'off',
    },
  },
);
