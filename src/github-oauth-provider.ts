/**
 * GitHub OAuth Provider Interface
 * Abstracts GitHub OAuth integration for testability
 */

/**
 * OAuth tokens returned by GitHub
 */
export interface GitHubTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

/**
 * GitHub user information
 */
export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
}

/**
 * GitHub OAuth Provider interface
 * Abstracts the OAuth flow to allow for testing with mocks
 */
export interface GitHubOAuthProvider {
  /**
   * Create authorization URL that user will visit
   * @param state - Opaque state parameter to pass through OAuth flow
   * @param scopes - GitHub OAuth scopes to request
   * @returns Authorization URL to redirect user to
   */
  createAuthorizationURL(state: string, scopes: string[]): URL;

  /**
   * Validate authorization code and exchange for tokens
   * @param code - Authorization code from callback
   * @returns Access token and optional refresh token
   */
  validateAuthorizationCode(code: string): Promise<GitHubTokens>;

  /**
   * Get user information using access token
   * @param accessToken - GitHub access token
   * @returns User information from GitHub
   */
  getUserInfo(accessToken: string): Promise<GitHubUser>;
}
