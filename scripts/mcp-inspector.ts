#!/usr/bin/env node

/**
 * Interactive MCP Inspector with OAuth Support
 *
 * Provides a command-line interface to:
 * 1. Authenticate via OAuth
 * 2. Browse available tools and prompts
 * 3. Execute tools interactively
 * 4. View JSON-RPC messages
 */

import http from 'http';
import { URL } from 'url';
import open from 'open';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import readline from 'readline';

dotenv.config({ path: '.env.test' });

const SERVER_URL = process.env.MCP_SERVER_URL || 'https://second-brain-mcp.nick-01a.workers.dev';
const CALLBACK_PORT = parseInt(process.env.CALLBACK_PORT || '3000');

interface OAuthResult {
  success: boolean;
  accessToken?: string;
  error?: string;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: any;
}

interface MCPSession {
  accessToken: string;
  sessionId?: string;
  tools: Tool[];
}

let session: MCPSession | null = null;

/**
 * OAuth flow (same as test-mcp-with-oauth.ts)
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
          res.end(`<html><body><h1>OAuth Error</h1><p>Error: ${error}</p></body></html>`);
          server.close();
          resolve({ success: false, error });
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>Success!</h1><p>You can close this window.</p><script>window.close();</script></body></html>`);
          server.close();

          exchangeCodeForToken(code)
            .then(token => resolve({ success: true, accessToken: token.access_token }))
            .catch(err => resolve({ success: false, error: err.message }));
          return;
        }

        res.writeHead(400);
        res.end('Missing code parameter');
        server.close();
        resolve({ success: false, error: 'Missing code parameter' });
      }
    });

    server.listen(port, () => {
      console.log(chalk.gray(`Callback server listening on http://localhost:${port}`));
    });

    setTimeout(() => {
      server.close();
      resolve({ success: false, error: 'Timeout waiting for OAuth callback' });
    }, 5 * 60 * 1000);
  });
}

async function exchangeCodeForToken(code: string): Promise<{ access_token: string }> {
  const tokenResponse = await fetch(`${SERVER_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: 'grant_type=authorization_code&code=' + encodeURIComponent(code),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
  }

  const tokenData = await tokenResponse.json() as any;

  if (tokenData.error || !tokenData.access_token) {
    throw new Error(`MCP OAuth error: ${tokenData.error_description || tokenData.error || 'No access token'}`);
  }

  return { access_token: tokenData.access_token };
}

function generateOAuthUrl(port: number): string {
  const redirectUri = `http://localhost:${port}/callback`;
  const authUrl = new URL(`${SERVER_URL}/oauth/authorize`);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  return authUrl.toString();
}

/**
 * Authenticate and initialize session
 */
async function authenticate(): Promise<boolean> {
  console.log(chalk.bold.blue('\n🔐 Authenticating with OAuth...\n'));

  const callbackPromise = startCallbackServer(CALLBACK_PORT);
  const oauthUrl = generateOAuthUrl(CALLBACK_PORT);

  console.log(chalk.gray('Opening browser...'));
  try {
    await open(oauthUrl);
  } catch {
    console.log(chalk.yellow('Please visit:'), chalk.cyan(oauthUrl));
  }

  const result = await callbackPromise;

  if (!result.success || !result.accessToken) {
    console.log(chalk.red('❌ Authentication failed:'), result.error);
    return false;
  }

  console.log(chalk.green('✅ Authenticated successfully!'));

  // Initialize MCP session
  console.log(chalk.gray('\nInitializing MCP session...'));
  const initResponse = await fetch(`${SERVER_URL}/mcp`, {
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
        clientInfo: { name: 'mcp-inspector', version: '1.0.0' },
      },
    }),
  });

  const initData = await initResponse.json() as any;
  const sessionId = initResponse.headers.get('mcp-session-id');

  if (initData.error) {
    console.log(chalk.red('❌ MCP initialization failed:'), initData.error.message);
    return false;
  }

  // Get tools list
  const toolsResponse = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${result.accessToken}`,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }),
  });

  const toolsData = await toolsResponse.json() as any;

  if (toolsData.error) {
    console.log(chalk.red('❌ Failed to fetch tools:'), toolsData.error.message);
    return false;
  }

  session = {
    accessToken: result.accessToken,
    sessionId: sessionId || undefined,
    tools: toolsData.result?.tools || [],
  };

  console.log(chalk.green(`✅ Session initialized with ${session.tools.length} tools`));
  return true;
}

/**
 * List available tools
 */
function listTools() {
  if (!session || session.tools.length === 0) {
    console.log(chalk.yellow('No tools available'));
    return;
  }

  console.log(chalk.bold.blue('\n📦 Available Tools:\n'));
  session.tools.forEach((tool, i) => {
    console.log(chalk.cyan(`${i + 1}. ${tool.name}`));
    console.log(chalk.gray(`   ${tool.description}`));

    if (tool.inputSchema?.properties) {
      const params = Object.keys(tool.inputSchema.properties);
      const required = tool.inputSchema.required || [];
      console.log(chalk.gray(`   Parameters: ${params.map(p => required.includes(p) ? chalk.white(p + '*') : p).join(', ')}`));
    }
    console.log();
  });
}

/**
 * Execute a tool
 */
async function executeTool(toolName: string, args: any) {
  if (!session) {
    console.log(chalk.red('❌ Not authenticated'));
    return;
  }

  console.log(chalk.gray('\nExecuting tool...'));
  console.log(chalk.gray('Request:'), JSON.stringify({ tool: toolName, args }, null, 2));

  const response = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.accessToken}`,
      ...(session.sessionId ? { 'mcp-session-id': session.sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  const data = await response.json() as any;

  console.log(chalk.gray('\nResponse:'));
  if (data.error) {
    console.log(chalk.red('Error:'), JSON.stringify(data.error, null, 2));
  } else {
    console.log(chalk.green('Result:'), JSON.stringify(data.result, null, 2));
  }
}

/**
 * Interactive prompt
 */
async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(chalk.cyan('\nmcp> '), async (input) => {
      const cmd = input.trim();

      if (cmd === 'exit' || cmd === 'quit') {
        console.log(chalk.gray('Goodbye!'));
        rl.close();
        process.exit(0);
      }

      if (cmd === 'help') {
        console.log(chalk.bold('\nCommands:'));
        console.log('  list              - List all available tools');
        console.log('  call <tool> <json> - Call a tool with JSON arguments');
        console.log('  help              - Show this help');
        console.log('  exit              - Exit inspector');
        prompt();
        return;
      }

      if (cmd === 'list') {
        listTools();
        prompt();
        return;
      }

      if (cmd.startsWith('call ')) {
        const parts = cmd.substring(5).split(' ', 1);
        const toolName = parts[0];
        const argsJson = cmd.substring(5 + toolName.length + 1);

        try {
          const args = argsJson ? JSON.parse(argsJson) : {};
          await executeTool(toolName, args);
        } catch (e) {
          console.log(chalk.red('Error parsing arguments:'), e instanceof Error ? e.message : String(e));
          console.log(chalk.gray('Usage: call <tool> <json>'));
          console.log(chalk.gray('Example: call read {"path": "test.md"}'));
        }
        prompt();
        return;
      }

      if (cmd) {
        console.log(chalk.yellow('Unknown command. Type "help" for available commands.'));
      }
      prompt();
    });
  };

  console.log(chalk.bold.green('\n🔍 MCP Inspector - Interactive Mode\n'));
  console.log(chalk.gray('Type "help" for available commands\n'));
  prompt();
}

/**
 * Main
 */
async function main() {
  console.log(chalk.bold.blue('🔍 MCP Inspector with OAuth\n'));
  console.log(chalk.gray('Server:'), SERVER_URL);
  console.log(chalk.gray('='.repeat(60)));

  const authenticated = await authenticate();

  if (!authenticated) {
    console.log(chalk.red('\n❌ Failed to authenticate'));
    process.exit(1);
  }

  listTools();
  await interactiveMode();
}

main().catch(console.error);
