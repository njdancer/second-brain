/**
 * OAuth UI Handler
 * Handles GitHub authentication and authorization UI flow
 * Pattern based on Cloudflare's remote-mcp-github-oauth template
 */

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { Hono } from 'hono';
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
 * Create OAuth UI handler for GitHub authentication
 * This handles the user-facing OAuth flow (authorize + callback)
 * OAuthProvider handles the MCP token management (token endpoint, PKCE, etc.)
 */
export function createGitHubHandler() {
  const app = new Hono<{ Bindings: OAuthEnv }>();

  /**
   * Handle /oauth/authorize - Parse MCP OAuth request and redirect to GitHub
   */
  app.get('/authorize', async (c) => {
    try {
      // Parse the OAuth authorization request from MCP client (Claude.ai, MCP Inspector)
      const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

      console.log('OAuth authorize request:', {
        clientId: oauthReqInfo.clientId,
        redirectUri: oauthReqInfo.redirectUri,
        scope: oauthReqInfo.scope,
        state: oauthReqInfo.state,
        codeChallenge: oauthReqInfo.codeChallenge,
        codeChallengeMethod: oauthReqInfo.codeChallengeMethod,
      });

      // Validate client exists
      const client = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
      if (!client) {
        return c.text('Invalid client', 400);
      }

      // Encode the MCP OAuth request state to pass through GitHub auth
      // We'll decode it in the callback to complete the MCP authorization
      const stateParam = btoa(JSON.stringify(oauthReqInfo));

      // Redirect to GitHub OAuth
      const githubUrl = new URL('https://github.com/login/oauth/authorize');
      githubUrl.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID);
      githubUrl.searchParams.set('redirect_uri', `${new URL(c.req.url).origin}/oauth/callback`);
      githubUrl.searchParams.set('scope', 'read:user');
      githubUrl.searchParams.set('state', stateParam);

      console.log('Redirecting to GitHub:', githubUrl.toString());

      return Response.redirect(githubUrl.toString(), 302);
    } catch (error) {
      console.error('OAuth authorize error:', error);
      return c.text('Failed to initiate OAuth flow', 500);
    }
  });

  /**
   * Handle /oauth/callback - Process GitHub auth and complete MCP OAuth
   */
  app.get('/callback', async (c) => {
    try {
      const code = c.req.query('code');
      const stateParam = c.req.query('state');
      const error = c.req.query('error');

      // Handle GitHub OAuth errors
      if (error) {
        console.error('GitHub OAuth error:', error);
        return c.text(`GitHub authorization failed: ${error}`, 400);
      }

      if (!code || !stateParam) {
        return c.text('Missing code or state parameter', 400);
      }

      console.log('OAuth callback received');

      // Decode the original MCP OAuth request
      const oauthReqInfo = JSON.parse(atob(stateParam));
      console.log('Retrieved MCP auth request:', oauthReqInfo);

      // Exchange GitHub code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: c.env.GITHUB_CLIENT_ID,
          client_secret: c.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        console.error('GitHub token exchange failed:', tokenResponse.status);
        return c.text('Failed to exchange GitHub authorization code', 500);
      }

      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };
      if (tokenData.error || !tokenData.access_token) {
        console.error('GitHub token error:', tokenData.error);
        return c.text(`GitHub token error: ${tokenData.error}`, 400);
      }

      // Get GitHub user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json',
        },
      });

      if (!userResponse.ok) {
        console.error('GitHub user fetch failed:', userResponse.status);
        return c.text('Failed to fetch GitHub user info', 500);
      }

      const githubUser = await userResponse.json() as GitHubUser;
      console.log('GitHub user:', { id: githubUser.id, login: githubUser.login });

      // Check if user is authorized (allowlist)
      if (githubUser.id.toString() !== c.env.GITHUB_ALLOWED_USER_ID) {
        console.log('User not authorized:', githubUser.id);
        return c.text('Unauthorized user', 403);
      }

      console.log('User authorized, completing MCP OAuth flow');

      // Complete the MCP OAuth authorization using OAuthProvider
      // This creates the authorization code and redirect back to the MCP client
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
        },
      });

      console.log('MCP OAuth completed, redirecting to:', redirectTo);

      // Redirect back to MCP client with authorization code (includes PKCE validation)
      return Response.redirect(redirectTo, 302);
    } catch (error) {
      console.error('OAuth callback error:', error);
      return c.text('Failed to complete OAuth flow', 500);
    }
  });

  return app;
}

/**
 * Export the handler for OAuthProvider defaultHandler configuration
 */
export const GitHubHandler = createGitHubHandler();
