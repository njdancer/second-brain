/**
 * Arctic-based GitHub OAuth Provider (Production)
 * Uses Arctic library for real GitHub OAuth integration
 */

import { GitHub } from 'arctic';
import type { GitHubOAuthProvider, GitHubTokens, GitHubUser } from './github-oauth-provider';

/**
 * Production GitHub OAuth provider using Arctic library
 */
export class ArcticGitHubOAuthProvider implements GitHubOAuthProvider {
  private github: GitHub;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.github = new GitHub(clientId, clientSecret, redirectUri);
  }

  createAuthorizationURL(state: string, scopes: string[]): URL {
    return this.github.createAuthorizationURL(state, scopes);
  }

  async validateAuthorizationCode(code: string): Promise<GitHubTokens> {
    const tokens = await this.github.validateAuthorizationCode(code);

    // GitHub OAuth apps return limited fields compared to GitHub Apps:
    // - access_token (required)
    // - token_type (optional)
    // - scope (optional)
    // GitHub OAuth apps do NOT return:
    // - refresh_token (only GitHub Apps return this)
    // - expires_in (GitHub access tokens don't expire)
    //
    // Arctic's methods throw when fields are missing, so we check/handle gracefully

    return {
      accessToken: tokens.accessToken(),
      // Use hasRefreshToken() to check before calling refreshToken()
      refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : undefined,
      // GitHub OAuth apps don't return expires_in, so accessTokenExpiresAt() would throw
      // Wrap in try-catch since there's no hasExpiresIn() method
      expiresIn: (() => {
        try {
          const expiresAt = tokens.accessTokenExpiresAt();
          return Math.floor((expiresAt.getTime() - Date.now()) / 1000);
        } catch {
          // No expiry time (expected for GitHub OAuth apps)
          return undefined;
        }
      })(),
    };
  }

  async getUserInfo(accessToken: string): Promise<GitHubUser> {
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'Second-Brain-MCP/1.0',
      },
    });

    if (!userResponse.ok) {
      throw new Error(`GitHub API error: ${userResponse.status}`);
    }

    const data: unknown = await userResponse.json();
    return data as GitHubUser;
  }
}
