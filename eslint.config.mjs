// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Ignore generated files, dependencies, and test files
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.wrangler/**',
      'test/**',
      'scripts/**',
      '*.config.js',
      '*.config.mjs',
    ],
  },
  {
    files: ['src/**/*.ts'],
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
      // Allow unused vars that start with underscore
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // Allow explicit any (useful for testing and type guards)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Require consistent type imports (warning only for now)
      '@typescript-eslint/consistent-type-imports': 'warn',
      // Disable some overly strict rules
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      'no-control-regex': 'warn',
    },
  },
);
