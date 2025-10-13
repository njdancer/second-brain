/**
 * Arctic-based GitHub OAuth Provider (Production)
 * Uses Arctic library for real GitHub OAuth integration
 */

import { GitHub } from 'arctic';
import type {
  GitHubOAuthProvider,
  GitHubTokens,
  GitHubUser,
} from './github-oauth-provider';

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

    return {
      accessToken: tokens.accessToken(),
      refreshToken: tokens.refreshToken(),
      expiresIn: tokens.accessTokenExpiresAt()
        ? Math.floor((tokens.accessTokenExpiresAt()!.getTime() - Date.now()) / 1000)
        : undefined,
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

    const data = (await userResponse.json()) as GitHubUser;
    return data;
  }
}
