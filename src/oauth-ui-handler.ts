/**
 * OAuth UI Handler with Arctic
 * Handles GitHub authentication flow using Arctic library
 * Integrates with OAuthProvider for MCP token management
 */

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { GitHub } from 'arctic';
import { Hono } from 'hono';
import { Logger, generateRequestId } from './logger';
import { Env } from './index';

/**
 * Extended environment with OAuth helpers injected by OAuthProvider
 */
interface OAuthEnv extends Env {
  OAUTH_PROVIDER: OAuthHelpers;
}

/**
 * GitHub user response
 */
interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
}

/**
 * Create OAuth UI handler for GitHub authentication using Arctic
 */
export function createGitHubHandler() {
  const app = new Hono<{ Bindings: OAuthEnv }>();

  /**
   * Handle /oauth/authorize - Parse MCP OAuth request and redirect to GitHub
   */
  app.get('/authorize', async (c) => {
    const requestId = generateRequestId();
    const logger = new Logger({ requestId });

    logger.info('OAuth authorize request started');

    try {
      // Parse the OAuth authorization request from MCP client
      const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

      logger.info('OAuth request parsed', {
        clientId: oauthReqInfo.clientId,
        redirectUri: oauthReqInfo.redirectUri,
        scope: oauthReqInfo.scope,
        hasPkce: !!oauthReqInfo.codeChallenge,
      });

      // Validate client exists
      const client = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
      if (!client) {
        logger.warn('Invalid OAuth client', { clientId: oauthReqInfo.clientId });
        return c.text('Invalid client', 400);
      }

      // Initialize Arctic GitHub client
      const github = new GitHub(
        c.env.GITHUB_CLIENT_ID,
        c.env.GITHUB_CLIENT_SECRET,
        `${new URL(c.req.url).origin}/callback`
      );

      // Generate state with MCP OAuth request encoded in it
      // Arctic generates cryptographically secure state
      const state = btoa(JSON.stringify(oauthReqInfo));

      // Create GitHub authorization URL with Arctic
      // Arctic automatically handles PKCE for the GitHub flow
      const authUrl = github.createAuthorizationURL(state, ['read:user']);

      logger.info('Redirecting to GitHub for authorization');

      return Response.redirect(authUrl.toString(), 302);
    } catch (error) {
      logger.error('OAuth authorize failed', error as Error);
      return c.text('Failed to initiate OAuth flow', 500);
    }
  });

  /**
   * Handle /oauth/callback - Process GitHub auth and complete MCP OAuth
   */
  app.get('/callback', async (c) => {
    const requestId = generateRequestId();
    const logger = new Logger({ requestId });

    logger.info('OAuth callback received');

    try {
      const code = c.req.query('code');
      const state = c.req.query('state');
      const error = c.req.query('error');

      // Handle GitHub OAuth errors
      if (error) {
        logger.error('GitHub OAuth error', new Error(error));
        return c.text(`GitHub authorization failed: ${error}`, 400);
      }

      if (!code || !state) {
        logger.warn('Missing OAuth callback parameters');
        return c.text('Missing code or state parameter', 400);
      }

      // Decode the original MCP OAuth request from state
      const oauthReqInfo = JSON.parse(atob(state));
      logger.debug('Retrieved MCP auth request from state');

      // Initialize Arctic GitHub client
      const github = new GitHub(
        c.env.GITHUB_CLIENT_ID,
        c.env.GITHUB_CLIENT_SECRET,
        `${new URL(c.req.url).origin}/callback`
      );

      // Validate callback and exchange code for tokens using Arctic
      // Arctic handles token exchange, validation, and refresh token management
      const tokens = await github.validateAuthorizationCode(code);

      logger.debug('GitHub tokens received');

      // Get GitHub user info using the access token
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken()}`,
          'Accept': 'application/json',
          'User-Agent': 'Second-Brain-MCP/1.0',
        },
      });

      if (!userResponse.ok) {
        logger.error('GitHub user fetch failed', new Error(`Status ${userResponse.status}`));
        return c.text('Failed to fetch GitHub user info', 500);
      }

      const githubUser = await userResponse.json() as GitHubUser;
      const userLogger = logger.child({
        userId: githubUser.id.toString(),
        githubLogin: githubUser.login
      });

      userLogger.info('GitHub user authenticated');

      // Check if user is authorized (allowlist)
      if (githubUser.id.toString() !== c.env.GITHUB_ALLOWED_USER_ID) {
        userLogger.warn('User not in allowlist');
        return c.text('Unauthorized user', 403);
      }

      userLogger.info('User authorized, completing MCP OAuth flow');

      // Complete the MCP OAuth authorization using OAuthProvider
      // This creates the MCP authorization code and redirects back to the MCP client
      const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReqInfo,
        userId: githubUser.id.toString(),
        scope: oauthReqInfo.scope,
        metadata: {
          githubLogin: githubUser.login,
          githubName: githubUser.name || githubUser.login,
          authorizedAt: Date.now(),
        },
        props: {
          userId: githubUser.id.toString(),
          githubLogin: githubUser.login,
          // Store GitHub access token for potential future use
          githubAccessToken: tokens.accessToken(),
        },
      });

      userLogger.info('MCP OAuth completed, redirecting to client');

      // Redirect back to MCP client with authorization code (includes PKCE validation)
      return Response.redirect(redirectTo, 302);
    } catch (error) {
      logger.error('OAuth callback failed', error as Error);
      return c.text(`Failed to complete OAuth flow: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  });

  return app;
}

/**
 * Export the handler for OAuthProvider defaultHandler configuration
 */
export const GitHubHandler = createGitHubHandler();
