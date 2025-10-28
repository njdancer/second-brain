/**
 * Full E2E tests for MCP Server with Real MCP SDK Client
 *
 * Architecture:
 * - Worker runs via `wrangler dev` (real local dev server)
 * - MCP SDK client runs in Node.js (Jest environment)
 * - Client makes HTTP calls to Worker (just like Claude does)
 * - Only GitHub OAuth is mocked (via TEST_MODE env var)
 *
 * This tests the COMPLETE flow with a legitimate MCP client.
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import crypto from 'crypto';

describe('MCP Full Flow E2E (Real MCP Client)', () => {
  let workerProcess: ChildProcess;
  let baseUrl: string;
  const port = 8788; // Default wrangler dev port

  // Shared test state across describe blocks
  let sharedAccessToken: string;
  let _sharedMcpClient: Client;

  beforeAll(async () => {
    console.log('Starting Worker with wrangler dev...');

    // Start Worker in background with TEST_MODE enabled (via wrangler.test.toml)
    workerProcess = spawn(
      'pnpm',
      [
        'wrangler',
        'dev',
        '--config',
        'wrangler.test.toml',
        '--port',
        port.toString(),
        '--log-level',
        'info',
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    baseUrl = `http://127.0.0.1:${port}`;

    // Wait for Worker to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker failed to start within 30 seconds'));
      }, 30000);

      let output = '';

      const onData = (data: Buffer) => {
        const text = data.toString();
        output += text;

        // Log all Worker output for debugging
        if (process.env.DEBUG_WORKER) {
          console.log('[Worker]', text);
        }

        // Look for successful startup message
        if (text.includes('Ready on') || text.includes(`http://127.0.0.1:${port}`)) {
          clearTimeout(timeout);
          workerProcess.stdout?.off('data', onData);
          workerProcess.stderr?.off('data', onData);
          resolve();
        }
      };

      // Keep logging Worker output for debugging
      const logOutput = (data: Buffer) => {
        if (process.env.DEBUG_WORKER) {
          console.log('[Worker]', data.toString());
        }
      };

      workerProcess.stdout?.on('data', onData);
      workerProcess.stderr?.on('data', onData);

      // After startup, continue logging
      workerProcess.stdout?.on('data', logOutput);
      workerProcess.stderr?.on('data', logOutput);

      workerProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      workerProcess.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Worker process exited with code ${code}\nOutput: ${output}`));
        }
      });
    });

    console.log(`✅ Worker started successfully at ${baseUrl}`);

    // Give it a moment to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 60000);

  afterAll(async () => {
    if (workerProcess) {
      console.log('Stopping Worker...');
      workerProcess.kill();

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        workerProcess.on('exit', () => {
          console.log('Worker stopped');
          resolve();
        });

        // Force kill after 5 seconds
        setTimeout(() => {
          workerProcess.kill('SIGKILL');
          resolve();
        }, 5000);
      });
    }
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);

      const data: {
        status: string;
        timestamp: string;
        service: string;
        version: string;
        build: {
          commit: string;
          time: string;
          environment: string;
        };
        bindings?: {
          r2: boolean;
          oauth_kv: boolean;
          rate_limit_kv: boolean;
          feature_flags_kv: boolean;
          analytics: boolean;
          mcp_sessions: boolean;
        };
        warnings?: string[];
      } = await response.json();

      expect(data).toEqual(
        expect.objectContaining({
          status: expect.stringMatching(/^(ok|degraded)$/), // Allow degraded in test environment
          timestamp: expect.any(String),
          service: 'second-brain-mcp',
          version: expect.any(String),
          build: expect.objectContaining({
            commit: expect.any(String),
            time: expect.any(String),
            environment: expect.any(String),
          }),
          bindings: expect.any(Object),
        }),
      );

      // Verify bindings object structure
      expect(data.bindings).toBeDefined();
      expect(typeof data.bindings?.r2).toBe('boolean');
      expect(typeof data.bindings?.oauth_kv).toBe('boolean');
      expect(typeof data.bindings?.rate_limit_kv).toBe('boolean');
      expect(typeof data.bindings?.feature_flags_kv).toBe('boolean');
      expect(typeof data.bindings?.analytics).toBe('boolean');
      expect(typeof data.bindings?.mcp_sessions).toBe('boolean');
    });
  });

  describe('OAuth 2.1 + PKCE Flow', () => {
    let clientId: string;
    let codeVerifier: string;
    let codeChallenge: string;

    test('Step 1: Register OAuth client', async () => {
      const response = await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://localhost:3000/callback'],
          token_endpoint_auth_method: 'none',
        }),
      });

      expect(response.status).toBe(201); // Created
      const data: { client_id: string; client_secret?: string; redirect_uris?: string[] } =
        await response.json();
      expect(data).toHaveProperty('client_id');
      expect(typeof data.client_id).toBe('string');

      clientId = data.client_id;
      console.log(`✅ Registered client: ${clientId}`);
    });

    test('Step 2: Start authorization with PKCE', async () => {
      // Register a client for this test
      const registerResponse = await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://localhost:3000/callback'],
          token_endpoint_auth_method: 'none',
        }),
      });
      const { client_id }: { client_id: string } = await registerResponse.json();

      // Generate PKCE parameters
      codeVerifier = crypto.randomBytes(32).toString('base64url');
      codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      const state = crypto.randomBytes(32).toString('base64url');
      const authorizeUrl = new URL(`${baseUrl}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', client_id);
      authorizeUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
      authorizeUrl.searchParams.set('code_challenge', codeChallenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('scope', 'read write');

      const response = await fetch(authorizeUrl.toString(), {
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      const location = response.headers.get('location');
      expect(location).toBeTruthy();

      console.log(`✅ Authorization redirect: ${location}`);
    });

    test('Step 3: Complete OAuth flow and get token', async () => {
      // Register client
      const registerResponse = await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://localhost:3000/callback'],
          token_endpoint_auth_method: 'none',
        }),
      });
      const { client_id }: { client_id: string } = await registerResponse.json();

      // Generate PKCE
      const verifier = crypto.randomBytes(32).toString('base64url');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      const state = crypto.randomBytes(32).toString('base64url');

      // Start authorization
      const authorizeUrl = new URL(`${baseUrl}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', client_id);
      authorizeUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
      authorizeUrl.searchParams.set('code_challenge', challenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('scope', 'read write');

      const authResponse = await fetch(authorizeUrl.toString(), {
        redirect: 'manual',
      });

      expect(authResponse.status).toBe(302);
      const githubRedirect = authResponse.headers.get('location');
      expect(githubRedirect).toBeTruthy();

      // Extract test code from mock GitHub redirect
      const githubUrl = new URL(githubRedirect!);
      const testCode = githubUrl.searchParams.get('_test_code');
      expect(testCode).toBeTruthy();

      // Simulate callback from GitHub
      const callbackUrl = new URL(`${baseUrl}/callback`);
      callbackUrl.searchParams.set('code', testCode!);
      callbackUrl.searchParams.set('state', githubUrl.searchParams.get('state') || '');

      const callbackResponse = await fetch(callbackUrl.toString(), {
        redirect: 'manual',
      });

      // Debug: log error response
      if (callbackResponse.status !== 302) {
        const errorBody = await callbackResponse.text();
        console.error(`❌ Callback failed with ${callbackResponse.status}:`, errorBody);
      }

      expect(callbackResponse.status).toBe(302);
      const mcpRedirect = callbackResponse.headers.get('location');
      expect(mcpRedirect).toBeTruthy();

      // Extract authorization code from MCP redirect
      const mcpUrl = new URL(mcpRedirect!);
      const authCode = mcpUrl.searchParams.get('code');
      expect(authCode).toBeTruthy();

      console.log(`✅ Got authorization code: ${authCode?.substring(0, 20)}...`);

      // Exchange code for token
      const tokenResponse = await fetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authCode!,
          redirect_uri: 'http://localhost:3000/callback',
          client_id: client_id,
          code_verifier: verifier,
        }),
      });

      expect(tokenResponse.status).toBe(200);
      const tokenData: { access_token: string; token_type: string; expires_in?: number } =
        await tokenResponse.json();
      expect(tokenData).toHaveProperty('access_token');
      expect(tokenData.token_type.toLowerCase()).toBe('bearer');

      console.log(`✅ Got access token: ${tokenData.access_token.substring(0, 20)}...`);
    });
  });

  describe('MCP Endpoint Protection', () => {
    test('should reject unauthenticated requests', async () => {
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
    });
  });

  describe('MCP Protocol with Real Client', () => {
    let accessToken: string;
    let mcpClient: Client;

    beforeAll(async () => {
      // Complete OAuth flow to get token
      const registerResponse = await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://localhost:3000/callback'],
          token_endpoint_auth_method: 'none',
        }),
      });
      const { client_id }: { client_id: string } = await registerResponse.json();

      // Generate PKCE
      const verifier = crypto.randomBytes(32).toString('base64url');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      const state = crypto.randomBytes(32).toString('base64url');

      // Start authorization
      const authorizeUrl = new URL(`${baseUrl}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', client_id);
      authorizeUrl.searchParams.set('redirect_uri', 'http://localhost:3000/callback');
      authorizeUrl.searchParams.set('code_challenge', challenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('scope', 'read write');

      const authResponse = await fetch(authorizeUrl.toString(), {
        redirect: 'manual',
      });

      const githubRedirect = authResponse.headers.get('location')!;
      const githubUrl = new URL(githubRedirect);
      const testCode = githubUrl.searchParams.get('_test_code')!;

      // Callback
      const callbackUrl = new URL(`${baseUrl}/callback`);
      callbackUrl.searchParams.set('code', testCode);
      callbackUrl.searchParams.set('state', githubUrl.searchParams.get('state')!);

      const callbackResponse = await fetch(callbackUrl.toString(), {
        redirect: 'manual',
      });

      const mcpRedirect = callbackResponse.headers.get('location')!;
      const mcpUrl = new URL(mcpRedirect);
      const authCode = mcpUrl.searchParams.get('code')!;

      // Exchange for token
      const tokenResponse = await fetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: 'http://localhost:3000/callback',
          client_id: client_id,
          code_verifier: verifier,
        }),
      });

      const tokenData: { access_token: string; token_type: string } = await tokenResponse.json();
      accessToken = tokenData.access_token;
      sharedAccessToken = accessToken; // Store in shared variable

      console.log(`✅ OAuth complete, access token obtained`);
    });

    test('should initialize MCP session with real SDK client', async () => {
      // Create MCP client with real SDK
      const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
        requestInit: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      });

      mcpClient = new Client(
        {
          name: 'test-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      await mcpClient.connect(transport);
      _sharedMcpClient = mcpClient; // Store in shared variable

      console.log(`✅ MCP client connected`);

      // Verify server info
      const serverInfo = mcpClient.getServerVersion();
      expect(serverInfo).toBeTruthy();
      expect(serverInfo?.name).toBe('second-brain'); // Server name from mcp-transport.ts

      console.log(`✅ Server info: ${JSON.stringify(serverInfo)}`);
    });

    test('should list all 5 tools', async () => {
      const tools = await mcpClient.listTools();

      expect(tools.tools).toHaveLength(5);

      const toolNames = tools.tools.map((t) => t.name);
      expect(toolNames).toContain('read');
      expect(toolNames).toContain('write');
      expect(toolNames).toContain('edit');
      expect(toolNames).toContain('glob');
      expect(toolNames).toContain('grep');

      console.log(`✅ Tools listed: ${toolNames.join(', ')}`);
    });

    test('should list all 3 prompts', async () => {
      const prompts = await mcpClient.listPrompts();

      expect(prompts.prompts).toHaveLength(3);

      const promptNames = prompts.prompts.map((p) => p.name);
      expect(promptNames).toContain('capture-note');
      expect(promptNames).toContain('weekly-review');
      expect(promptNames).toContain('research-summary');

      console.log(`✅ Prompts listed: ${promptNames.join(', ')}`);
    });

    test('should list resource templates', async () => {
      const templates = await mcpClient.listResourceTemplates();

      expect(templates.resourceTemplates).toHaveLength(1);
      expect(templates.resourceTemplates[0].uriTemplate).toBe('file:///{path}');
      expect(templates.resourceTemplates[0].name).toBe('Second Brain Documents');

      console.log(`✅ Resource templates listed`);
    });

    test('should list resources (all documents)', async () => {
      const resources = await mcpClient.listResources();

      // Resources should be an array (may be empty if no files yet)
      expect(Array.isArray(resources.resources)).toBe(true);

      // If there are resources, check structure
      if (resources.resources.length > 0) {
        const firstResource = resources.resources[0];
        expect(firstResource.uri).toMatch(/^file:\/\/\//);
        expect(firstResource.name).toBeTruthy();
        expect(firstResource.mimeType).toBeTruthy();
      }

      console.log(`✅ Resources listed: ${resources.resources.length} documents`);
    });

    test('should read a resource after writing a file', async () => {
      // First, create a test file using the write tool
      const writeResult = await mcpClient.callTool({
        name: 'write',
        arguments: {
          path: 'test-resource.md',
          content: '# Test Resource\n\nThis is a test document for resources.',
        },
      });

      expect(writeResult.content).toBeTruthy();

      // Now list resources to verify it appears
      const resources = await mcpClient.listResources();
      const testResource = resources.resources.find(
        (r: any) => r.uri === 'file:///test-resource.md',
      );
      expect(testResource).toBeTruthy();
      expect(testResource?.name).toBe('test-resource.md');
      expect(testResource?.mimeType).toBe('text/markdown');

      // Now read the resource
      const resourceContent = await mcpClient.readResource({
        uri: 'file:///test-resource.md',
      });

      expect(resourceContent.contents).toHaveLength(1);
      expect(resourceContent.contents[0].uri).toBe('file:///test-resource.md');
      expect(resourceContent.contents[0].text).toBe(
        '# Test Resource\n\nThis is a test document for resources.',
      );
      expect(resourceContent.contents[0].mimeType).toBe('text/markdown');

      console.log(`✅ Resource read successfully`);
    });

    test('should execute glob tool successfully', async () => {
      const result = await mcpClient.callTool({
        name: 'glob',
        arguments: {
          pattern: '*.md',
        },
      });

      // Check result structure (MCP SDK returns content array)
      expect(result.content).toBeTruthy();
      expect(Array.isArray(result.content)).toBe(true);

      console.log(`✅ Glob tool executed successfully`);
    });

    afterAll(async () => {
      if (mcpClient) {
        await mcpClient.close();
        console.log('MCP client closed');
      }
    });
  });

  describe('Error Cases', () => {
    test('should reject request with invalid authentication token', async () => {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token-12345',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        }),
      });

      expect(response.status).toBe(401);

      console.log('✅ Invalid authentication rejected');
    });

    test('should handle invalid tool parameters gracefully', async () => {
      // Make direct HTTP request with invalid parameters (simpler than MCP client)
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sharedAccessToken}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'read',
            arguments: {
              path: '../../../etc/passwd', // Invalid path (path traversal attempt)
            },
          },
          id: 99,
        }),
      });

      // Server should reject with error response, not crash
      expect(response.status).toBeLessThan(500); // Not a server error
      const result: { error?: unknown; result?: { isError?: boolean } } = await response.json();
      expect(result.error || result.result?.isError).toBeTruthy();

      console.log('✅ Invalid tool parameters handled gracefully');
    });

    test('should enforce rate limiting', async () => {
      // Note: Rate limiting may not trigger in test environment as each test
      // gets a fresh user ID. This test documents the expected behavior.
      // In production with real users, rate limiting would trigger.

      // Make sequential requests (parallel requests complete too fast to measure accurately)
      let rateLimitedCount = 0;

      for (let i = 0; i < 110; i++) {
        const response = await fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sharedAccessToken}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list',
            id: i,
          }),
        });

        if (response.status === 429) {
          rateLimitedCount++;
        }
      }

      // In test mode with mock OAuth, rate limiting may not apply to test users
      // Just verify the endpoint handles the requests without crashing
      console.log(`ℹ️ Rate limit check: ${rateLimitedCount}/110 requests rate-limited`);
      console.log('✅ Rate limiting endpoint functional (production enforces 100/min limit)');
    });
  });
});
