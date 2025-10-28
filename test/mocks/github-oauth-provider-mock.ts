/**
 * Mock GitHub OAuth Provider for Testing
 * Simulates GitHub OAuth without external dependencies
 */

import type {
  GitHubOAuthProvider,
  GitHubTokens,
  GitHubUser,
} from '../../src/github-oauth-provider';

export interface MockGitHubConfig {
  baseUrl: string;
  userId: number;
  username: string;
  accessToken?: string;
}

/**
 * Mock GitHub OAuth provider for integration tests
 * Simulates GitHub OAuth flow without external dependencies
 */
export class MockGitHubOAuthProvider implements GitHubOAuthProvider {
  private config: MockGitHubConfig;
  private authCodes = new Map<string, string>(); // code -> state
  private accessToken: string;

  constructor(config: MockGitHubConfig) {
    this.config = config;
    this.accessToken = config.accessToken || `mock_github_token_${Date.now()}`;
  }

  createAuthorizationURL(state: string, scopes: string[]): URL {
    // Create a mock GitHub authorization URL
    // In tests, we'll intercept this and immediately generate a code
    const url = new URL(`${this.config.baseUrl}/login/oauth/authorize`);
    url.searchParams.set('client_id', 'mock_client_id');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', scopes.join(' '));

    // For testing, we immediately generate a code and store it
    const code = `mock_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.authCodes.set(code, state);

    // Include the code in a special parameter for test harness to extract
    url.searchParams.set('_test_code', code);

    return url;
  }

  validateAuthorizationCode(code: string): Promise<GitHubTokens> {
    // For E2E tests, accept any code that looks like a mock code
    // This works around the issue of provider instances not being shared
    // between requests in the Worker environment
    if (!code.startsWith('mock_code_')) {
      return Promise.reject(new Error('Invalid authorization code'));
    }

    // Note: In E2E tests, we can't validate the code against authCodes
    // because each request creates a new MockGitHubOAuthProvider instance.
    // This is acceptable for testing since we're testing the MCP server,
    // not GitHub's OAuth implementation.

    // IMPORTANT: Match EXACT GitHub OAuth app response
    // GitHub OAuth apps return:
    // - access_token (required)
    // - token_type (optional)
    // - scope (optional)
    // GitHub OAuth apps do NOT return:
    // - refresh_token (only GitHub Apps return this)
    // - expires_in (GitHub access tokens don't expire)
    return Promise.resolve({
      accessToken: this.accessToken,
      refreshToken: undefined, // Not returned by GitHub OAuth apps
      expiresIn: undefined, // Not returned by GitHub OAuth apps (tokens don't expire)
    });
  }

  getUserInfo(accessToken: string): Promise<GitHubUser> {
    // For E2E tests, accept any token that looks like a mock token
    // This works around the issue of provider instances not being shared
    if (!accessToken.startsWith('mock_github_token_')) {
      return Promise.reject(new Error('Invalid access token'));
    }

    return Promise.resolve({
      id: this.config.userId,
      login: this.config.username,
      name: `Test User ${this.config.userId}`,
      email: `${this.config.username}@example.com`,
    });
  }

  /**
   * Get the generated access token (for test assertions)
   */
  getAccessToken(): string {
    return this.accessToken;
  }

  /**
   * Extract test code from authorization URL
   * This is a test helper that wouldn't exist in real GitHub
   */
  extractTestCode(authUrl: URL): string {
    const code = authUrl.searchParams.get('_test_code');
    if (!code) {
      throw new Error('No test code in authorization URL');
    }
    return code;
  }
}
