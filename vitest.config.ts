import { defineWorkersProject, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersProject({
  test: {
    globals: true,
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.test.toml',
        },
        miniflare: {
          // Environment variables for test mode
          bindings: {
            TEST_MODE: 'true',
            GITHUB_ALLOWED_USER_ID: '12345678',
            GITHUB_CLIENT_ID: 'test_client_id',
            GITHUB_CLIENT_SECRET: 'test_client_secret',
          },
          compatibilityDate: '2024-09-23',
          compatibilityFlags: ['nodejs_compat'],
        },
        main: './src/index.ts',
      },
    },
  },
});
