/**
 * Mock GitHub OAuth Server for Integration Tests
 *
 * Provides a lightweight OAuth server that mimics GitHub's OAuth flow
 * without requiring browser interaction or real GitHub credentials.
 *
 * This allows us to test our OAuth CLIENT (GitHub auth) in isolation.
 */

import http from 'http';
import { URL } from 'url';

export interface MockGitHubConfig {
  port: number;
  userId: string;
  username: string;
  accessToken?: string; // If not provided, one will be generated
}

export class MockGitHubOAuthServer {
  private server: http.Server | null = null;
  private config: MockGitHubConfig;
  private authCodes = new Map<string, { clientId: string; redirectUri: string }>();

  constructor(config: MockGitHubConfig) {
    this.config = {
      ...config,
      accessToken: config.accessToken || `mock_github_token_${Date.now()}`,
    };
  }

  /**
   * Start the mock GitHub OAuth server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || '', `http://localhost:${this.config.port}`);

        // Handle authorization endpoint (GitHub's /login/oauth/authorize)
        if (url.pathname === '/login/oauth/authorize') {
          this.handleAuthorize(url, res);
          return;
        }

        // Handle token exchange endpoint (GitHub's /login/oauth/access_token)
        if (url.pathname === '/login/oauth/access_token' && req.method === 'POST') {
          this.handleTokenExchange(req, res);
          return;
        }

        // Handle user info endpoint (GitHub's /user)
        if (url.pathname === '/user' && req.method === 'GET') {
          this.handleUserInfo(req, res);
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      this.server.listen(this.config.port, () => {
        console.log(`Mock GitHub OAuth server listening on port ${this.config.port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the mock GitHub OAuth server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Handle GitHub authorization endpoint
   * Automatically redirects back with an authorization code
   */
  private handleAuthorize(url: URL, res: http.ServerResponse): void {
    const clientId = url.searchParams.get('client_id');
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');

    if (!clientId || !redirectUri) {
      res.writeHead(400);
      res.end('Missing required parameters');
      return;
    }

    // Generate authorization code
    const code = `mock_auth_code_${Date.now()}`;
    this.authCodes.set(code, { clientId, redirectUri });

    // Redirect back to redirect_uri with code and state
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }

    res.writeHead(302, { Location: redirectUrl.toString() });
    res.end();
  }

  /**
   * Handle GitHub token exchange endpoint
   * Exchanges authorization code for access token
   */
  private handleTokenExchange(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';

    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      const params = new URLSearchParams(body);
      const code = params.get('code');
      const clientId = params.get('client_id');
      const clientSecret = params.get('client_secret');

      if (!code || !clientId || !clientSecret) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid_request' }));
        return;
      }

      // Validate authorization code
      const authData = this.authCodes.get(code);
      if (!authData || authData.clientId !== clientId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }

      // Remove used code
      this.authCodes.delete(code);

      // Return access token
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: this.config.accessToken,
        token_type: 'bearer',
        scope: 'user:email',
      }));
    });
  }

  /**
   * Handle GitHub user info endpoint
   * Returns mock user data
   */
  private handleUserInfo(req: http.IncomingMessage, res: http.ServerResponse): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const token = authHeader.substring(7);
    if (token !== this.config.accessToken) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }

    // Return mock user data
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: this.config.userId,
      login: this.config.username,
      email: `${this.config.username}@example.com`,
    }));
  }

  /**
   * Get the base URL for this mock server
   */
  getBaseUrl(): string {
    return `http://localhost:${this.config.port}`;
  }
}
