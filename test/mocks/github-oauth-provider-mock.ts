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

  async validateAuthorizationCode(code: string): Promise<GitHubTokens> {
    // Validate that code exists
    const state = this.authCodes.get(code);
    if (!state) {
      throw new Error('Invalid authorization code');
    }

    // Remove used code
    this.authCodes.delete(code);

    return {
      accessToken: this.accessToken,
      refreshToken: `mock_refresh_token_${Date.now()}`,
      expiresIn: 3600,
    };
  }

  async getUserInfo(accessToken: string): Promise<GitHubUser> {
    // Validate token
    if (accessToken !== this.accessToken) {
      throw new Error('Invalid access token');
    }

    return {
      id: this.config.userId,
      login: this.config.username,
      name: `Test User ${this.config.userId}`,
      email: `${this.config.username}@example.com`,
    };
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
