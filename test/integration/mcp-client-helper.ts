/**
 * MCP Client Helper for Integration Tests
 *
 * Provides utilities to create an authenticated MCP client
 * for testing the complete OAuth + MCP flow.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import fetch from 'node-fetch';
import crypto from 'crypto';

export interface MCPClientConfig {
  serverUrl: string;
  githubAuthUrl?: string; // Base URL for GitHub OAuth (for our mock server)
  clientId?: string;
  accessToken?: string; // If provided, skip OAuth flow
}

export interface OAuthFlowResult {
  accessToken: string;
  sessionId?: string;
}

interface ClientRegistrationResponse {
  client_id: string;
  [key: string]: unknown;
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  [key: string]: unknown;
}

interface MCPResponse {
  jsonrpc: string;
  id?: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    [key: string]: unknown;
  };
}

/**
 * Helper class to manage MCP client with OAuth authentication
 */
export class MCPClientHelper {
  private client: Client | null = null;
  private config: MCPClientConfig;
  private accessToken: string | null = null;
  private sessionId: string | null = null;

  constructor(config: MCPClientConfig) {
    this.config = config;
    if (config.accessToken) {
      this.accessToken = config.accessToken;
    }
  }

  /**
   * Register a new OAuth client with the MCP server
   */
  async registerClient(redirectUri: string): Promise<string> {
    const response = await fetch(`${this.config.serverUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Client registration failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as ClientRegistrationResponse;
    return data.client_id;
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Perform complete OAuth flow and get access token
   * This simulates what Claude desktop does, but without browser interaction
   */
  async performOAuthFlow(mockGitHubUrl: string): Promise<OAuthFlowResult> {
    // Step 1: Register client
    const redirectUri = `${mockGitHubUrl}/callback`;
    const clientId = await this.registerClient(redirectUri);

    // Step 2: Generate PKCE parameters
    const { codeVerifier, codeChallenge } = this.generatePKCE();
    const state = crypto.randomBytes(32).toString('base64url');

    // Step 3: Build authorization URL (our /authorize endpoint)
    const authUrl = new URL(`${this.config.serverUrl}/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'read write');

    // Step 4: Follow the OAuth flow
    // In real testing, our server will redirect to mock GitHub,
    // which will immediately redirect back with a code
    const authResponse = await fetch(authUrl.toString(), {
      redirect: 'manual',
    });

    // Get the redirect location (should be GitHub's /login/oauth/authorize)
    const githubAuthUrl = authResponse.headers.get('location');
    if (!githubAuthUrl) {
      throw new Error('No redirect to GitHub auth URL');
    }

    // Step 5: Follow GitHub redirect (mock server will auto-redirect back)
    const githubResponse = await fetch(githubAuthUrl, {
      redirect: 'manual',
    });

    // Get callback redirect with authorization code
    const callbackUrl = githubResponse.headers.get('location');
    if (!callbackUrl) {
      throw new Error('No callback redirect from GitHub');
    }

    const callbackUrlParsed = new URL(callbackUrl);
    const authCode = callbackUrlParsed.searchParams.get('code');
    if (!authCode) {
      throw new Error('No authorization code in callback');
    }

    // Step 6: Follow the callback URL (this completes the GitHub→MCP flow)
    const callbackResponse = await fetch(callbackUrl, {
      redirect: 'manual',
    });

    // Our server should redirect to the MCP redirect_uri with MCP code
    const mcpCallbackUrl = callbackResponse.headers.get('location');
    if (!mcpCallbackUrl) {
      throw new Error('No MCP callback redirect');
    }

    const mcpCallbackParsed = new URL(mcpCallbackUrl);
    const mcpCode = mcpCallbackParsed.searchParams.get('code');
    if (!mcpCode) {
      throw new Error('No MCP authorization code in callback');
    }

    // Step 7: Exchange MCP code for MCP access token
    const tokenResponse = await fetch(`${this.config.serverUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: mcpCode,
        code_verifier: codeVerifier,
        client_id: clientId,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = (await tokenResponse.json()) as TokenResponse;

    if (!tokenData.access_token) {
      throw new Error('No access_token in token response');
    }

    this.accessToken = tokenData.access_token;

    return {
      accessToken: tokenData.access_token,
    };
  }

  /**
   * Send MCP initialize request and get session ID
   */
  async initialize(): Promise<{ capabilities: unknown; sessionId: string }> {
    if (!this.accessToken) {
      throw new Error('No access token. Call performOAuthFlow() first.');
    }

    const response = await fetch(`${this.config.serverUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'integration-test-client', version: '1.0.0' },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Initialize failed: ${response.status} ${errorText}`);
    }

    const sessionId = response.headers.get('mcp-session-id');
    if (!sessionId) {
      throw new Error('No mcp-session-id header in initialize response');
    }

    this.sessionId = sessionId;

    const data = (await response.json()) as MCPResponse;

    return {
      capabilities: (data.result as { capabilities?: unknown })?.capabilities,
      sessionId,
    };
  }

  /**
   * Send MCP request with session ID
   */
  async sendRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.accessToken) {
      throw new Error('No access token. Call performOAuthFlow() first.');
    }

    if (!this.sessionId) {
      throw new Error('No session ID. Call initialize() first.');
    }

    const response = await fetch(`${this.config.serverUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${this.accessToken}`,
        'mcp-session-id': this.sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as MCPResponse;

    if (data.error) {
      throw new Error(`MCP error: ${data.error.message || data.error.code}`);
    }

    return data.result;
  }

  /**
   * List available tools
   */
  async listTools(): Promise<unknown[]> {
    const result = (await this.sendRequest('tools/list')) as { tools?: unknown[] };
    return result.tools || [];
  }

  /**
   * Call a tool
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    return result;
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<unknown[]> {
    const result = (await this.sendRequest('prompts/list')) as { prompts?: unknown[] };
    return result.prompts || [];
  }

  /**
   * Get a prompt
   */
  async getPrompt(name: string, args: Record<string, string> = {}): Promise<unknown> {
    const result = await this.sendRequest('prompts/get', {
      name,
      arguments: args,
    });
    return result;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }
}
