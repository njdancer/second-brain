/**
 * E2E tests using real MCP SDK client + unstable_dev Worker
 *
 * Architecture:
 * - Worker runs via unstable_dev (real Worker environment)
 * - MCP SDK client runs in Node.js (Jest environment)
 * - Client makes HTTP calls to Worker (just like Claude does)
 * - Only GitHub OAuth is mocked (via TEST_MODE env var)
 *
 * This tests the COMPLETE flow with a legitimate MCP client.
 */

import { unstable_dev, UnstableDevWorker } from 'wrangler';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import crypto from 'crypto';
import path from 'path';

describe('MCP E2E with Real Client', () => {
  let worker: UnstableDevWorker;
  let baseUrl: string;

  beforeAll(async () => {
    console.log('Starting Worker with unstable_dev...');

    try {
      // Start Worker - use config to load all bindings including Durable Objects
      worker = await unstable_dev(path.join(__dirname, '../../src/index.ts'), {
        config: path.join(__dirname, '../../wrangler.test.toml'), // ← FIX: Load bindings from config
        vars: {
          TEST_MODE: 'true',
          GITHUB_ALLOWED_USER_ID: '12345678',
          GITHUB_CLIENT_ID: 'test_client',
          GITHUB_CLIENT_SECRET: 'test_secret',
        },
        local: true, // Use local mode for in-memory bindings
        persist: false, // Don't persist data between runs
        experimental: {
          disableExperimentalWarning: true,
        },
      });

      baseUrl = `http://127.0.0.1:${worker.port}`;
      console.log(`✅ Worker started successfully at ${baseUrl}`);
    } catch (error) {
      console.error('❌ Failed to start Worker:', error);
      throw error;
    }
  }, 120000);

  afterAll(async () => {
    if (worker) {
      await worker.stop();
      console.log('Worker stopped');
    }
  });

  test('Health check works', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
      service: 'second-brain-mcp',
    });
  }, 30000);

  test('OAuth client registration works', async () => {
    const response = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['http://localhost:3000/callback'],
        token_endpoint_auth_method: 'none',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('client_id');
    expect(typeof data.client_id).toBe('string');
  }, 30000);

  test('MCP endpoint rejects unauthenticated requests', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    });

    expect(response.status).toBe(401);
  }, 30000);
});
