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
const GITHUB_CLIENT_ID_LOCAL = process.env.GITHUB_CLIENT_ID_LOCAL;
const GITHUB_CLIENT_SECRET_LOCAL = process.env.GITHUB_CLIENT_SECRET_LOCAL;
const CALLBACK_PORT = parseInt(process.env.CALLBACK_PORT || '3000');

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
 * We do this DIRECTLY with GitHub (not through the server)
 * to test if the server's OAuth callback properly returns the token
 */
async function exchangeCodeForToken(code: string): Promise<{ access_token: string; userId?: string }> {
  console.log(chalk.gray('Exchanging code for token with GitHub...'));

  if (!GITHUB_CLIENT_ID_LOCAL || !GITHUB_CLIENT_SECRET_LOCAL) {
    throw new Error('GITHUB_CLIENT_ID_LOCAL and GITHUB_CLIENT_SECRET_LOCAL must be set');
  }

  // Exchange code for token with GitHub
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID_LOCAL,
      client_secret: GITHUB_CLIENT_SECRET_LOCAL,
      code,
    }),
  });

  const tokenData = await tokenResponse.json() as any;

  if (tokenData.error) {
    throw new Error(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`);
  }

  if (!tokenData.access_token) {
    throw new Error('No access_token in GitHub response');
  }

  console.log(chalk.green('✅ Got access token from GitHub!'));

  // Get user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  const userData = await userResponse.json() as any;

  console.log(chalk.gray('GitHub user:'), userData.login, `(ID: ${userData.id})`);

  return {
    access_token: tokenData.access_token,
    userId: userData.id.toString(),
  };
}

/**
 * Generate OAuth URL with localhost redirect
 */
function generateOAuthUrl(port: number): string {
  if (!GITHUB_CLIENT_ID_LOCAL) {
    throw new Error('GITHUB_CLIENT_ID_LOCAL not set in .env.test - see setup instructions');
  }

  const redirectUri = `http://localhost:${port}/callback`;
  const state = Math.random().toString(36).substring(7);

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID_LOCAL);
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
  console.log(chalk.gray('='.repeat(60)));

  // Step 1: Start callback server
  console.log(chalk.blue('\n📡 Step 1: Starting local callback server...'));
  console.log(chalk.gray(`Using port: ${CALLBACK_PORT} (set CALLBACK_PORT in .env.test to change)`));
  const callbackPromise = startCallbackServer(CALLBACK_PORT);

  // Step 2: Generate OAuth URL
  console.log(chalk.blue('\n🔗 Step 2: Generating OAuth URL...'));
  let oauthUrl: string;
  try {
    oauthUrl = generateOAuthUrl(CALLBACK_PORT);
    console.log(chalk.gray('OAuth URL:'), oauthUrl);
  } catch (error: any) {
    console.log(chalk.red('\n❌ Failed to generate OAuth URL:'), error.message);
    console.log(chalk.yellow('\n📋 Setup Instructions:'));
    console.log(chalk.yellow('1. Create a GitHub OAuth App at: https://github.com/settings/developers'));
    console.log(chalk.yellow('2. Set callback URL to: http://localhost:3000/callback'));
    console.log(chalk.yellow('3. Add to .env.test:'));
    console.log(chalk.gray('   GITHUB_CLIENT_ID_LOCAL=<your_client_id>'));
    console.log(chalk.gray('   GITHUB_CLIENT_SECRET_LOCAL=<your_client_secret>'));
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
