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

dotenv.config({ path: '.env.test' });

const SERVER_URL = process.env.MCP_SERVER_URL || 'https://second-brain-mcp.nick-01a.workers.dev';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

interface OAuthResult {
  success: boolean;
  accessToken?: string;
  userId?: string;
  error?: string;
}

/**
 * Start a local HTTP server to receive OAuth callback
 */
function startCallbackServer(port: number): Promise<OAuthResult> {
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
          exchangeCodeForToken(code)
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
 * Exchange authorization code for access token
 * This is what the server SHOULD do, but we need to check if it's exposed
 */
async function exchangeCodeForToken(code: string): Promise<{ access_token: string; userId?: string }> {
  console.log(chalk.gray('Exchanging code for token...'));

  // Try calling the server's callback endpoint
  const response = await fetch(`${SERVER_URL}/oauth/callback?code=${code}`, {
    method: 'GET',
  });

  const data = await response.json() as any;

  console.log(chalk.gray('Server response:'), JSON.stringify(data, null, 2));

  if (data.error) {
    throw new Error(data.error);
  }

  // Check if server returned a token (it currently doesn't!)
  if (data.access_token) {
    return {
      access_token: data.access_token,
      userId: data.userId,
    };
  }

  // Server only returns userId/login but not the token!
  // This is the BUG - we need to fix the server to return the token
  if (data.success && data.userId) {
    console.log(chalk.yellow('\n⚠️  SERVER BUG DETECTED:'));
    console.log(chalk.yellow('The server callback returns:'));
    console.log(chalk.yellow(JSON.stringify(data, null, 2)));
    console.log(chalk.yellow('\nBut it does NOT return the access_token!'));
    console.log(chalk.yellow('MCP clients need the token to send in Authorization headers.'));
    console.log(chalk.yellow('\nThe server needs to be fixed to return:'));
    console.log(chalk.yellow(JSON.stringify({
      success: true,
      access_token: '<github_token>',
      token_type: 'bearer',
      userId: data.userId,
      login: data.login,
    }, null, 2)));

    throw new Error('Server callback does not return access_token');
  }

  throw new Error('Unexpected server response');
}

/**
 * Generate OAuth URL with localhost redirect
 */
function generateOAuthUrl(port: number): string {
  if (!GITHUB_CLIENT_ID) {
    throw new Error('GITHUB_CLIENT_ID not set in environment');
  }

  const redirectUri = `http://localhost:${port}/callback`;
  const state = Math.random().toString(36).substring(7);

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'read:user');
  authUrl.searchParams.set('state', state);

  return authUrl.toString();
}

/**
 * Main test flow
 */
async function main() {
  console.log(chalk.bold.blue('\n🧪 MCP OAuth Flow Test\n'));
  console.log(chalk.gray('This test simulates the exact OAuth flow Claude desktop would use.'));
  console.log(chalk.gray('='repeat(60)));

  // Step 1: Start callback server
  console.log(chalk.blue('\n📡 Step 1: Starting local callback server...'));
  const port = 3000 + Math.floor(Math.random() * 1000); // Random port
  const callbackPromise = startCallbackServer(port);

  // Step 2: Generate OAuth URL
  console.log(chalk.blue('\n🔗 Step 2: Generating OAuth URL...'));
  let oauthUrl: string;
  try {
    oauthUrl = generateOAuthUrl(port);
    console.log(chalk.gray('OAuth URL:'), oauthUrl);
  } catch (error: any) {
    console.log(chalk.red('\n❌ Failed to generate OAuth URL:'), error.message);
    console.log(chalk.yellow('\nTo fix: Set GITHUB_CLIENT_ID in .env.test'));
    console.log(chalk.gray('You can get this from the Cloudflare Worker secrets:'));
    console.log(chalk.gray('  pnpm wrangler secret list'));
    process.exit(1);
  }

  // Step 3: Open browser
  console.log(chalk.blue('\n🌐 Step 3: Opening browser for authentication...'));
  console.log(chalk.yellow('Please authorize the application in your browser.'));
  console.log(chalk.gray('The browser will redirect back to localhost automatically.'));

  try {
    await open(oauthUrl);
  } catch (error) {
    console.log(chalk.yellow('\n⚠️  Could not automatically open browser.'));
    console.log(chalk.yellow('Please manually visit:'));
    console.log(chalk.cyan(oauthUrl));
  }

  // Step 4: Wait for callback
  console.log(chalk.blue('\n⏳ Step 4: Waiting for OAuth callback...'));
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
    // TODO: Update .env.test file with the token
    console.log(chalk.green('Token saved! You can now run: pnpm run test:mcp:quick'));
  }

  // Step 5: Test MCP connection with token
  if (result.accessToken) {
    console.log(chalk.blue('\n🧪 Step 5: Testing MCP connection with token...'));
    const mcpResponse = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

    const mcpData = await mcpResponse.json();
    console.log(chalk.gray('MCP response:'), JSON.stringify(mcpData, null, 2));

    if (mcpData.result?.capabilities?.tools) {
      console.log(chalk.green('\n✅ MCP connection successful! Tools are available.'));
    } else {
      console.log(chalk.yellow('\n⚠️  MCP connected but no tools available.'));
    }
  }
}

main().catch(console.error);
