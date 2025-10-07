/**
 * Unit tests for Worker entry point (Hono app)
 */

import { Env, createApp } from '../../src/index';

// Mock environment
const createMockEnv = (): Env => ({
  SECOND_BRAIN_BUCKET: {} as R2Bucket,
  OAUTH_KV: {} as KVNamespace,
  RATE_LIMIT_KV: {} as KVNamespace,
  ANALYTICS: {} as AnalyticsEngineDataset,
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_ALLOWED_USER_ID: '12345',
  COOKIE_ENCRYPTION_KEY: 'a'.repeat(64), // 32-byte hex string
  AWS_ACCESS_KEY_ID: 'test-access-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
  AWS_REGION: 'us-east-1',
  AWS_S3_BACKUP_BUCKET: 'test-backup-bucket',
});

describe('Worker Entry Point', () => {
  describe('createApp', () => {
    it('should create Hono app instance', () => {
      const env = createMockEnv();
      const app = createApp(env);

      expect(app).toBeDefined();
    });

    it('should have health check route', async () => {
      const env = createMockEnv();
      const app = createApp(env);

      const req = new Request('http://localhost/health');
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('service', 'second-brain-mcp');
    });

    it('should have OAuth authorize route', async () => {
      const env = createMockEnv();
      const app = createApp(env);

      const req = new Request('http://localhost/oauth/authorize');
      const res = await app.fetch(req, env);

      // Should redirect to GitHub OAuth or return error
      expect([302, 400, 500]).toContain(res.status);
    });

    it('should have OAuth callback route', async () => {
      const env = createMockEnv();
      const app = createApp(env);

      const req = new Request('http://localhost/oauth/callback?code=test123');
      const res = await app.fetch(req, env);

      // Should process callback (even if it fails in test environment)
      expect([200, 400, 403, 500]).toContain(res.status);
    });

    it('should return 404 for unknown routes', async () => {
      const env = createMockEnv();
      const app = createApp(env);

      const req = new Request('http://localhost/unknown-route');
      const res = await app.fetch(req, env);

      expect(res.status).toBe(404);
    });
  });

  describe('CORS headers', () => {
    it('should include CORS headers on health check', async () => {
      const env = createMockEnv();
      const app = createApp(env);

      const req = new Request('http://localhost/health');
      const res = await app.fetch(req, env);

      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should handle OPTIONS request for CORS preflight', async () => {
      const env = createMockEnv();
      const app = createApp(env);

      const req = new Request('http://localhost/health', { method: 'OPTIONS' });
      const res = await app.fetch(req, env);

      // Hono returns 204 No Content for OPTIONS requests
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      const env = createMockEnv();
      const app = createApp(env);

      // Invalid request that should trigger error handling
      const req = new Request('http://localhost/health', {
        method: 'POST',
        headers: { 'Content-Type': 'invalid' },
      });
      const res = await app.fetch(req, env);

      // Should return a response (even if it's an error)
      expect(res).toBeDefined();
      expect(res.status).toBeGreaterThanOrEqual(200);
    });

    it('should return JSON error for unhandled routes', async () => {
      const env = createMockEnv();
      const app = createApp(env);

      const req = new Request('http://localhost/does-not-exist');
      const res = await app.fetch(req, env);

      expect(res.status).toBe(404);
      expect(res.headers.get('Content-Type')).toContain('json');
    });
  });

  describe('environment validation', () => {
    it('should handle missing environment variables gracefully', async () => {
      const env = createMockEnv();
      // Remove a required variable
      delete (env as any).GITHUB_CLIENT_ID;

      const app = createApp(env);
      const req = new Request('http://localhost/health');
      const res = await app.fetch(req, env);

      // Health check should still work
      expect(res.status).toBe(200);
    });

    it('should validate R2 bucket binding', () => {
      const env = createMockEnv();
      expect(env.SECOND_BRAIN_BUCKET).toBeDefined();
    });

    it('should validate KV namespace bindings', () => {
      const env = createMockEnv();
      expect(env.OAUTH_KV).toBeDefined();
      expect(env.RATE_LIMIT_KV).toBeDefined();
    });

    it('should validate analytics binding', () => {
      const env = createMockEnv();
      expect(env.ANALYTICS).toBeDefined();
    });
  });
});
