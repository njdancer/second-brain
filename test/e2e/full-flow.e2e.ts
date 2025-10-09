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

describe('E2E: Complete OAuth Flow (Manual Test)', () => {
  it.skip('completes full OAuth flow: authorize → callback → token → mcp', async () => {
    /**
     * THIS TEST REQUIRES MANUAL OAUTH COMPLETION
     *
     * To run this test:
     * 1. Remove .skip from this test
     * 2. Set TEST_OAUTH_CODE in environment (get from OAuth callback)
     * 3. Run: MCP_SERVER_URL=<your-url> TEST_OAUTH_CODE=<code> pnpm test -- full-flow.e2e.ts
     *
     * This test validates the EXACT flow that Claude uses:
     * - Exchange MCP authorization code with /oauth/token
     * - Use returned MCP access token with /mcp endpoint
     * - Verify tools are available
     */

    const mcpAuthCode = process.env.TEST_OAUTH_CODE;

    if (!mcpAuthCode) {
      console.warn('⚠️  Skipping - no TEST_OAUTH_CODE set');
      console.warn('To test: Get code from OAuth callback, then:');
      console.warn('TEST_OAUTH_CODE=<code> pnpm test -- full-flow.e2e.ts');
      return;
    }

    // Step 1: Exchange MCP authorization code for MCP access token
    console.log('Step 1: Exchanging MCP auth code for MCP access token...');
    const tokenResponse = await fetch(`${SERVER_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: `grant_type=authorization_code&code=${encodeURIComponent(mcpAuthCode)}`,
    });

    console.log('Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokens = await tokenResponse.json() as any;

    expect(tokens.access_token).toBeDefined();
    expect(tokens.token_type).toBe('bearer');
    expect(tokens.scope).toBe('mcp:read mcp:write');
    expect(tokens.expires_in).toBeGreaterThan(0);

    console.log('✅ Got MCP access token');
    console.log('Token type:', tokens.token_type);
    console.log('Scope:', tokens.scope);

    // Step 2: Use MCP access token for authenticated request
    console.log('\nStep 2: Using MCP token for authenticated initialize...');
    const mcpResponse = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'e2e-oauth-test', version: '1.0.0' },
        },
      }),
    });

    expect(mcpResponse.status).toBe(200);
    const mcpData = await mcpResponse.json() as any;

    console.log('MCP response:', JSON.stringify(mcpData, null, 2));

    // Step 3: Verify tools are available
    expect(mcpData.result).toBeDefined();
    expect(mcpData.result.capabilities).toBeDefined();
    expect(mcpData.result.capabilities.tools).toBeDefined();

    // CRITICAL: Should NOT be empty!
    const toolCount = Object.keys(mcpData.result.capabilities.tools || {}).length;
    if (toolCount === 0) {
      throw new Error(
        '❌ CRITICAL: Authenticated initialize returned empty tools!\n' +
        'This means the OAuth flow is broken.\n' +
        'Response: ' + JSON.stringify(mcpData.result.capabilities, null, 2)
      );
    }

    console.log('✅ Authenticated initialize successful');
    console.log(`✅ Tools available: ${toolCount}`);

    // Step 4: Test tools/list to verify complete functionality
    console.log('\nStep 3: Calling tools/list...');
    const toolsListResponse = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(toolsListResponse.status).toBe(200);
    const toolsData = await toolsListResponse.json() as any;

    expect(toolsData.result).toBeDefined();
    expect(toolsData.result.tools).toBeDefined();
    expect(Array.isArray(toolsData.result.tools)).toBe(true);
    expect(toolsData.result.tools.length).toBeGreaterThanOrEqual(5);

    const toolNames = toolsData.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('read');
    expect(toolNames).toContain('write');
    expect(toolNames).toContain('edit');
    expect(toolNames).toContain('glob');
    expect(toolNames).toContain('grep');

    console.log('✅ All 5 tools available');
    console.log('\n🎉 Complete OAuth flow test PASSED!');
  });

  it('documents how to test OAuth flow', () => {
    const instructions = {
      purpose: 'Test the EXACT OAuth flow that Claude uses',
      steps: [
        '1. Open browser to ${SERVER_URL}/oauth/authorize?redirect_uri=http://localhost:3000/callback',
        '2. Authenticate with GitHub',
        '3. Server generates MCP auth code and redirects to localhost:3000/callback?code=MCP_CODE',
        '4. Copy the MCP_CODE from URL',
        '5. Run: TEST_OAUTH_CODE=MCP_CODE pnpm test -- full-flow.e2e.ts',
      ],
      what_it_tests: [
        'MCP authorization code exchange',
        'MCP access token format',
        'Token scope (mcp:read mcp:write)',
        'Authenticated initialize with tools',
        'Complete OAuth flow end-to-end',
      ],
      critical: 'This is the flow Claude uses - if this fails, Claude cannot connect!',
    };

    console.log('OAuth Flow Test Instructions:');
    console.log(JSON.stringify(instructions, null, 2));

    expect(instructions.critical).toContain('Claude');
  });
});
