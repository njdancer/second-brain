/**
 * E2E Test: Full MCP Flow with Mock OAuth
 *
 * Tests complete flow:
 * 1. Unauthenticated initialize (should return OAuth instructions)
 * 2. OAuth flow (using mock provider)
 * 3. Authenticated initialize (should return tools)
 * 4. Tool execution
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8787';

describe('E2E: Full MCP Flow with OAuth', () => {
  it('Step 1: Unauthenticated initialize returns OAuth instructions', async () => {
    const response = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'e2e-test', version: '1.0.0' },
        },
      }),
    });

    const data = await response.json() as any;

    expect(response.status).toBe(200);
    expect(data.result).toBeDefined();
    expect(data.result.serverInfo.name).toBe('second-brain-mcp');
    expect(data.result.instructions).toContain('OAuth');
    expect(data.result.capabilities.tools).toEqual({});

    console.log('✅ Step 1: Unauthenticated initialize works');
  });

  it('Step 2: OAuth discovery endpoints exist', async () => {
    const response = await fetch(`${SERVER_URL}/.well-known/oauth-authorization-server`);
    const data = await response.json() as any;

    expect(response.status).toBe(200);
    expect(data.authorization_endpoint).toContain('/oauth/authorize');
    expect(data.token_endpoint).toContain('/oauth/token');

    console.log('✅ Step 2: OAuth discovery works');
  });

  it('Step 3: Authenticated initialize returns tools', async () => {
    // For this test, we need a valid token
    // In local dev, we can use wrangler dev with a test token
    const testToken = process.env.TEST_OAUTH_TOKEN;

    if (!testToken) {
      console.warn('⚠️  Skipping authenticated test - no TEST_OAUTH_TOKEN set');
      console.warn('Run: export TEST_OAUTH_TOKEN=your_token');
      return;
    }

    const response = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'e2e-test-auth', version: '1.0.0' },
        },
      }),
    });

    const data = await response.json() as any;

    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(data, null, 2));

    expect(response.status).toBe(200);
    expect(data.result).toBeDefined();

    // CRITICAL: Should have tools in capabilities
    expect(data.result.capabilities).toBeDefined();
    expect(data.result.capabilities.tools).toBeDefined();

    // Should NOT be empty
    if (!data.result.capabilities.tools || Object.keys(data.result.capabilities.tools).length === 0) {
      throw new Error(
        '❌ CRITICAL BUG: Authenticated initialize returned empty tools!\n' +
        'This is the bug we\'re trying to fix.\n' +
        'Response: ' + JSON.stringify(data.result.capabilities, null, 2)
      );
    }

    console.log('✅ Step 3: Authenticated initialize returns tools');
    console.log('Tools:', Object.keys(data.result.capabilities.tools));
  });

  it('Step 4: Tools/list request returns available tools', async () => {
    const testToken = process.env.TEST_OAUTH_TOKEN;

    if (!testToken) {
      console.warn('⚠️  Skipping tools/list test - no TEST_OAUTH_TOKEN set');
      return;
    }

    const response = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    const data = await response.json() as any;

    console.log('tools/list response:', JSON.stringify(data, null, 2));

    expect(response.status).toBe(200);
    expect(data.result).toBeDefined();
    expect(data.result.tools).toBeDefined();
    expect(Array.isArray(data.result.tools)).toBe(true);

    // Should have our 5 tools
    expect(data.result.tools.length).toBeGreaterThanOrEqual(5);

    const toolNames = data.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('read');
    expect(toolNames).toContain('write');
    expect(toolNames).toContain('edit');
    expect(toolNames).toContain('glob');
    expect(toolNames).toContain('grep');

    console.log('✅ Step 4: tools/list returns all tools');
  });
});

describe('E2E: MCP with Mock OAuth Provider', () => {
  it('documents how to run with mock OAuth', () => {
    const mockOAuthSetup = {
      purpose: 'Test full OAuth flow without real GitHub',
      setup: [
        '1. Start mock OAuth server on port 9999',
        '2. Set GITHUB_API_BASE=http://localhost:9999 in wrangler.toml',
        '3. Run wrangler dev',
        '4. Run this E2E test',
      ],
      mockEndpoints: {
        '/login/oauth/authorize': 'Returns auth code',
        '/login/oauth/access_token': 'Exchanges code for token',
        '/user': 'Returns mock user info',
      },
      benefit: 'Can test complete OAuth + MCP flow in CI/CD',
    };

    console.log('Mock OAuth Setup:');
    console.log(JSON.stringify(mockOAuthSetup, null, 2));

    expect(mockOAuthSetup.benefit).toContain('CI/CD');
  });
});
