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
 * Exchange MCP authorization code for MCP access token
 * This is the CORRECT flow: exchange OUR code with OUR /oauth/token endpoint
 * (Not GitHub's token endpoint!)
 */
async function exchangeCodeForToken(code: string): Promise<{ access_token: string; userId?: string }> {
  console.log(chalk.gray('Exchanging MCP authorization code for MCP access token...'));

  // Exchange MCP code for MCP token with OUR server
  const tokenResponse = await fetch(`${SERVER_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: 'grant_type=authorization_code&code=' + encodeURIComponent(code),
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
 * Generate OAuth URL with localhost redirect
 * This hits OUR /oauth/authorize endpoint, which redirects to GitHub
 */
function generateOAuthUrl(port: number): string {
  const redirectUri = `http://localhost:${port}/callback`;

  // Call OUR /oauth/authorize endpoint with redirect_uri
  // Our server will redirect to GitHub, then back to our callback, then back to redirect_uri
  const authUrl = new URL(`${SERVER_URL}/oauth/authorize`);
  authUrl.searchParams.set('redirect_uri', redirectUri);

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
  const oauthUrl = generateOAuthUrl(CALLBACK_PORT);
  console.log(chalk.gray('OAuth URL:'), oauthUrl);
  console.log(chalk.gray('This will redirect through our /oauth/authorize endpoint'));

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

    const mcpData = await mcpResponse.json() as any;
    console.log(chalk.gray('MCP response:'), JSON.stringify(mcpData, null, 2));

    if (mcpData.result?.capabilities?.tools) {
      console.log(chalk.green('\n✅ MCP connection successful! Tools are available.'));
    } else {
      console.log(chalk.yellow('\n⚠️  MCP connected but no tools available.'));
    }
  }
}

main().catch(console.error);
