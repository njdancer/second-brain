#!/usr/bin/env node

/**
 * MCP Client Test with Automatic OAuth Flow
 *
 * This implements the EXACT flow that Claude desktop would use:
 * 1. Starts local callback server on localhost
 * 2. Opens OAuth URL with localhost redirect_uri
 * 3. Captures authorization code automatically
 * 4. Exchanges code for token
 * 5. Uses token for MCP requests
 */

import http from 'http';
import { URL } from 'url';
import open from 'open';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

dotenv.config({ path: '.env.test' });

const SERVER_URL = process.env.MCP_SERVER_URL || 'https://second-brain-mcp.nick-01a.workers.dev';
const CALLBACK_PORT = parseInt(process.env.CALLBACK_PORT || '3000');

interface OAuthResult {
  success: boolean;
  accessToken?: string;
  userId?: string;
  error?: string;
}

interface OAuthContext {
  codeVerifier: string;
  clientId: string;
}

/**
 * Start a local HTTP server to receive OAuth callback
 */
function startCallbackServer(port: number, context: OAuthContext): Promise<OAuthResult> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>OAuth Error</h1>
                <p>Error: ${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          resolve({ success: false, error });
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Authorization Successful!</h1>
                <p>Authorization code received. Exchanging for access token...</p>
                <p>You can close this window.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);

          server.close();

          // Exchange code for token
          exchangeCodeForToken(code, context.codeVerifier, context.clientId)
            .then(token => resolve({ success: true, accessToken: token.access_token, userId: token.userId }))
            .catch(err => resolve({ success: false, error: err.message }));
          return;
        }

        res.writeHead(400);
        res.end('Missing code parameter');
        server.close();
        resolve({ success: false, error: 'Missing code parameter' });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(port, () => {
      console.log(chalk.gray(`Callback server listening on http://localhost:${port}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      resolve({ success: false, error: 'Timeout waiting for OAuth callback' });
    }, 5 * 60 * 1000);
  });
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // Generate random code verifier (43-128 characters, base64url)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');

  // Generate code challenge (SHA256 hash of verifier, base64url encoded)
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge };
}

/**
 * Generate random state parameter
 */
function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Save access token to .env.test file
 */
async function saveTokenToEnv(token: string): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.test');

  try {
    // Read existing .env.test content
    const content = await fs.readFile(envPath, 'utf-8');

    // Update GITHUB_OAUTH_TOKEN line
    const lines = content.split('\n');
    const updatedLines = lines.map(line => {
      if (line.startsWith('GITHUB_OAUTH_TOKEN=')) {
        return `GITHUB_OAUTH_TOKEN=${token}`;
      }
      return line;
    });

    // Write back to file
    await fs.writeFile(envPath, updatedLines.join('\n'), 'utf-8');
    console.log(chalk.green('✅ Token saved to .env.test'));
  } catch (error) {
    console.error(chalk.red('Failed to save token to .env.test:'), error);
    throw error;
  }
}

/**
 * Register a new OAuth client
 */
async function registerClient(redirectUri: string): Promise<{ client_id: string }> {
  console.log(chalk.gray('Registering OAuth client...'));

  const response = await fetch(`${SERVER_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none', // Public client (no secret)
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Client registration failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as any;
  console.log(chalk.green('✅ Client registered, ID:'), data.client_id);

  return { client_id: data.client_id };
}

/**
 * Exchange MCP authorization code for MCP access token
 * This is the CORRECT flow: exchange OUR code with OUR /token endpoint
 * (Not GitHub's token endpoint!)
 */
async function exchangeCodeForToken(code: string, codeVerifier: string, clientId: string): Promise<{ access_token: string; userId?: string }> {
  console.log(chalk.gray('Exchanging MCP authorization code for MCP access token...'));

  // Exchange MCP code for MCP token with OUR server (including PKCE code_verifier)
  const tokenResponse = await fetch(`${SERVER_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      code_verifier: codeVerifier,
      client_id: clientId,
    }).toString(),
  });

  console.log(chalk.gray('Token endpoint response status:'), tokenResponse.status);

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error(chalk.red('Token exchange failed:'), errorText);
    throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
  }

  const tokenData = await tokenResponse.json() as any;

  if (tokenData.error) {
    throw new Error(`MCP OAuth error: ${tokenData.error_description || tokenData.error}`);
  }

  if (!tokenData.access_token) {
    throw new Error('No access_token in MCP token response');
  }

  console.log(chalk.green('✅ Got MCP access token!'));
  console.log(chalk.gray('Token type:'), tokenData.token_type);
  console.log(chalk.gray('Scope:'), tokenData.scope);
  console.log(chalk.gray('Expires in:'), tokenData.expires_in, 'seconds');

  return {
    access_token: tokenData.access_token,
    userId: undefined, // We don't have userId from token response, will get it from MCP request
  };
}

/**
 * Generate OAuth URL with localhost redirect and PKCE parameters
 * This hits OUR /authorize endpoint, which redirects to GitHub
 */
function generateOAuthUrl(port: number, clientId: string, codeChallenge: string, state: string): string {
  const redirectUri = `http://localhost:${port}/callback`;

  // Call OUR /authorize endpoint with all required OAuth 2.1 parameters
  const authUrl = new URL(`${SERVER_URL}/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'read write');

  return authUrl.toString();
}

/**
 * Main test flow
 */
async function main() {
  console.log(chalk.bold.blue('\n🧪 MCP OAuth Flow Test\n'));
  console.log(chalk.gray('This test simulates the exact OAuth 2.1 + PKCE flow that Claude desktop would use.'));
  console.log(chalk.gray('='.repeat(60)));

  // Step 1: Register OAuth client
  console.log(chalk.blue('\n🔐 Step 1: Registering OAuth client...'));
  const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`;
  const { client_id: clientId } = await registerClient(redirectUri);

  // Step 2: Generate PKCE parameters
  console.log(chalk.blue('\n🔑 Step 2: Generating PKCE challenge...'));
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();
  console.log(chalk.gray('Code verifier:'), codeVerifier.substring(0, 20) + '...');
  console.log(chalk.gray('Code challenge:'), codeChallenge.substring(0, 20) + '...');
  console.log(chalk.gray('State:'), state.substring(0, 20) + '...');

  // Step 3: Start callback server
  console.log(chalk.blue('\n📡 Step 3: Starting local callback server...'));
  console.log(chalk.gray(`Using port: ${CALLBACK_PORT} (set CALLBACK_PORT in .env.test to change)`));
  const context: OAuthContext = { codeVerifier, clientId };
  const callbackPromise = startCallbackServer(CALLBACK_PORT, context);

  // Step 4: Generate OAuth URL
  console.log(chalk.blue('\n🔗 Step 4: Generating OAuth URL...'));
  const oauthUrl = generateOAuthUrl(CALLBACK_PORT, clientId, codeChallenge, state);
  console.log(chalk.gray('OAuth URL:'), oauthUrl);
  console.log(chalk.gray('This will redirect through our /authorize endpoint'));

  // Step 5: Open browser
  console.log(chalk.blue('\n🌐 Step 5: Opening browser for authentication...'));
  console.log(chalk.yellow('Please authorize the application in your browser.'));
  console.log(chalk.gray('The browser will redirect back to localhost automatically.'));

  try {
    await open(oauthUrl);
  } catch (error) {
    console.log(chalk.yellow('\n⚠️  Could not automatically open browser.'));
    console.log(chalk.yellow('Please manually visit:'));
    console.log(chalk.cyan(oauthUrl));
  }

  // Step 6: Wait for callback
  console.log(chalk.blue('\n⏳ Step 6: Waiting for OAuth callback...'));
  const result = await callbackPromise;

  if (!result.success) {
    console.log(chalk.red('\n❌ OAuth flow failed:'), result.error);
    process.exit(1);
  }

  console.log(chalk.green('\n✅ OAuth flow completed successfully!'));
  if (result.accessToken) {
    console.log(chalk.gray('Access token:'), result.accessToken.substring(0, 20) + '...');
    console.log(chalk.gray('User ID:'), result.userId);

    // Save to .env.test
    console.log(chalk.blue('\n💾 Saving token to .env.test...'));
    await saveTokenToEnv(result.accessToken);
    console.log(chalk.green('Token saved! You can now run: pnpm run test:mcp:quick'));
  }

  // Step 7: Test MCP connection with token
  if (result.accessToken) {
    console.log(chalk.blue('\n🧪 Step 7: Testing MCP initialize request...'));
    const mcpResponse = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${result.accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });

    const mcpData = await mcpResponse.json() as any;
    console.log(chalk.gray('MCP response:'), JSON.stringify(mcpData, null, 2));

    // Check for session ID header
    const sessionId = mcpResponse.headers.get('mcp-session-id');
    console.log(chalk.gray('\nSession ID from header:'), sessionId);

    if (!sessionId) {
      console.log(chalk.red('\n❌ ERROR: No mcp-session-id header in response!'));
      console.log(chalk.gray('Response headers:'), Object.fromEntries(mcpResponse.headers.entries()));
      process.exit(1);
    } else {
      console.log(chalk.green('✅ Session ID received in header'));
    }

    if (mcpData.result?.capabilities?.tools) {
      console.log(chalk.green('✅ MCP initialize successful! Tools are available.'));
    } else {
      console.log(chalk.yellow('⚠️  MCP connected but no tools available.'));
    }

    // Step 8: Test GET request with session ID (SSE endpoint)
    console.log(chalk.blue('\n🧪 Step 8: Testing GET /mcp with session ID...'));
    const getResponse = await fetch(`${SERVER_URL}/mcp`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${result.accessToken}`,
        'mcp-session-id': sessionId,
      },
    });

    console.log(chalk.gray('GET /mcp status:'), getResponse.status);

    if (getResponse.status === 400) {
      const errorData = await getResponse.json() as any;
      console.log(chalk.red('❌ ERROR: GET request failed:'), errorData);
      if (errorData.error?.message?.includes('Missing session ID')) {
        console.log(chalk.red('❌ Session ID was not properly recognized!'));
      }
      process.exit(1);
    } else {
      console.log(chalk.green('✅ GET /mcp request accepted with session ID'));
    }

    // Step 9: Test subsequent POST with session ID
    console.log(chalk.blue('\n🧪 Step 9: Testing subsequent POST with session ID...'));
    const listToolsResponse = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${result.accessToken}`,
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    if (listToolsResponse.status === 400) {
      const errorData = await listToolsResponse.json() as any;
      console.log(chalk.red('❌ ERROR: tools/list failed:'), errorData);
      process.exit(1);
    }

    const toolsData = await listToolsResponse.json() as any;
    console.log(chalk.gray('Tools response:'), JSON.stringify(toolsData, null, 2));

    // Check for JSON-RPC errors in the response
    if (toolsData.error) {
      console.log(chalk.red('❌ ERROR: tools/list returned error:'), toolsData.error);
      console.log(chalk.red('This means session ID was not properly recognized by transport!'));
      process.exit(1);
    }

    // Check that we got actual tools
    if (!toolsData.result?.tools || toolsData.result.tools.length === 0) {
      console.log(chalk.red('❌ ERROR: No tools returned in response!'));
      process.exit(1);
    }

    console.log(chalk.green(`✅ Subsequent POST with session ID successful - received ${toolsData.result.tools.length} tools`));

    console.log(chalk.bold.green('\n✨ All tests passed! MCP server is working correctly.'));
  }
}

main().catch(console.error);
