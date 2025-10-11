/**
 * OAuth UI Handler with Arctic
 * Handles GitHub authentication flow using Arctic library
 * Integrates with OAuthProvider for MCP token management
 * Direct Fetch API handler (no Hono)
 */

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { GitHub } from 'arctic';
import { MonitoringService } from './monitoring';
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
 * Handle /authorize - Parse MCP OAuth request and redirect to GitHub
 */
async function handleAuthorize(request: Request, env: OAuthEnv, logger: Logger): Promise<Response> {
  logger.info('OAuth authorize request started');

  try {
    // Parse the OAuth authorization request from MCP client
    const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);

    logger.info('OAuth request parsed', {
      clientId: oauthReqInfo.clientId,
      redirectUri: oauthReqInfo.redirectUri,
      scope: oauthReqInfo.scope,
      hasPkce: !!oauthReqInfo.codeChallenge,
    });

    // Validate client exists
    const client = await env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
    if (!client) {
      logger.warn('Invalid OAuth client', { clientId: oauthReqInfo.clientId });
      return new Response('Invalid client', { status: 400 });
    }

    // Initialize Arctic GitHub client
    const github = new GitHub(
      env.GITHUB_CLIENT_ID,
      env.GITHUB_CLIENT_SECRET,
      `${new URL(request.url).origin}/callback`
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
    return new Response('Failed to initiate OAuth flow', { status: 500 });
  }
}

/**
 * Handle /callback - Process GitHub auth and complete MCP OAuth
 */
async function handleCallback(request: Request, env: OAuthEnv, logger: Logger): Promise<Response> {
  logger.info('OAuth callback received');

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Handle GitHub OAuth errors
    if (error) {
      logger.error('GitHub OAuth error', new Error(error));
      return new Response(`GitHub authorization failed: ${error}`, { status: 400 });
    }

    if (!code || !state) {
      logger.warn('Missing OAuth callback parameters');
      return new Response('Missing code or state parameter', { status: 400 });
    }

    // Decode the original MCP OAuth request from state
    const oauthReqInfo = JSON.parse(atob(state));
    logger.debug('Retrieved MCP auth request from state');

    // Initialize Arctic GitHub client
    const github = new GitHub(
      env.GITHUB_CLIENT_ID,
      env.GITHUB_CLIENT_SECRET,
      `${url.origin}/callback`
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
      return new Response('Failed to fetch GitHub user info', { status: 500 });
    }

    const githubUser = await userResponse.json() as GitHubUser;
    const userLogger = logger.child({
      userId: githubUser.id.toString(),
      githubLogin: githubUser.login
    });

    userLogger.info('GitHub user authenticated');

    // Check if user is authorized (allowlist)
    if (githubUser.id.toString() !== env.GITHUB_ALLOWED_USER_ID) {
      userLogger.warn('User not in allowlist');

      // Record failed OAuth event
      const monitoring = new MonitoringService(env.ANALYTICS);
      await monitoring.recordOAuthEvent(githubUser.id.toString(), 'failure');

      return new Response('Unauthorized user', { status: 403 });
    }

    userLogger.info('User authorized, completing MCP OAuth flow');

    // Complete the MCP OAuth authorization using OAuthProvider
    // This creates the MCP authorization code and redirects back to the MCP client
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
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

    // Record successful OAuth event
    const monitoring = new MonitoringService(env.ANALYTICS);
    await monitoring.recordOAuthEvent(githubUser.id.toString(), 'success');

    // Redirect back to MCP client with authorization code (includes PKCE validation)
    return Response.redirect(redirectTo, 302);
  } catch (error) {
    logger.error('OAuth callback failed', error as Error);

    // Record failed OAuth event (with no user ID since auth failed)
    const monitoring = new MonitoringService(env.ANALYTICS);
    await monitoring.recordOAuthEvent(undefined, 'failure');

    return new Response(`Failed to complete OAuth flow: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
  }
}

/**
 * Main GitHub OAuth handler
 * Routes /authorize and /callback to appropriate handlers
 */
export async function githubOAuthHandler(
  request: Request,
  env: OAuthEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const requestId = generateRequestId();
  const logger = new Logger({ requestId });

  // Route based on pathname
  if (url.pathname === '/authorize') {
    return handleAuthorize(request, env, logger);
  }

  if (url.pathname === '/callback') {
    return handleCallback(request, env, logger);
  }

  logger.warn('Unknown OAuth route', { pathname: url.pathname });
  return new Response('Not Found', { status: 404 });
}

/**
 * Export the handler for OAuthProvider defaultHandler configuration
 */
export const GitHubHandler = {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    return githubOAuthHandler(request, env as OAuthEnv, ctx);
  }
};
