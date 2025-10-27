/**
 * OAuth UI Handler with Injectable GitHub Provider
 * Handles GitHub authentication flow
 * Integrates with OAuthProvider for MCP token management
 * Direct Fetch API handler (no Hono)
 */

import type { OAuthHelpers, AuthRequest } from '@cloudflare/workers-oauth-provider';
import { MonitoringService } from './monitoring';
import { Logger, generateRequestId } from './logger';
import type { Env } from './index';
import type { GitHubOAuthProvider } from './github-oauth-provider';
import { VERSION_INFO, getVersionString } from './version';

/**
 * Extended environment with OAuth helpers injected by OAuthProvider
 */
interface OAuthEnv extends Env {
  OAUTH_PROVIDER: OAuthHelpers;
  GITHUB_OAUTH?: GitHubOAuthProvider; // Optional injected provider for tests
  TEST_MODE?: string; // Optional test mode flag
}

/**
 * Create GitHub OAuth provider from environment
 * Lazy-loaded to avoid importing Arctic in tests
 * Uses MockGitHubOAuthProvider if TEST_MODE=true
 */
async function createGitHubProvider(env: OAuthEnv, request: Request): Promise<GitHubOAuthProvider> {
  const url = new URL(request.url);

  // Use mock provider in test mode (for E2E tests)
  if (env.TEST_MODE === 'true') {
    const { MockGitHubOAuthProvider } = await import('../test/mocks/github-oauth-provider-mock');
    return new MockGitHubOAuthProvider({
      baseUrl: url.origin,
      userId: parseInt(env.GITHUB_ALLOWED_USER_ID),
      username: 'testuser',
    });
  }

  // Use real Arctic provider in production
  const { ArcticGitHubOAuthProvider } = await import('./github-oauth-provider-arctic');
  return new ArcticGitHubOAuthProvider(
    env.GITHUB_CLIENT_ID,
    env.GITHUB_CLIENT_SECRET,
    `${url.origin}/callback`,
  );
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

    // Get GitHub OAuth provider (injected for tests, or create from env)
    const github = env.GITHUB_OAUTH || (await createGitHubProvider(env, request));

    // Generate state with MCP OAuth request encoded in it
    const state = btoa(JSON.stringify(oauthReqInfo));

    // Create GitHub authorization URL
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
    const oauthReqInfo = JSON.parse(atob(state)) as AuthRequest;
    logger.debug('Retrieved MCP auth request from state');

    // Get GitHub OAuth provider (injected for tests, or create from env)
    const github = env.GITHUB_OAUTH || (await createGitHubProvider(env, request));

    // Validate callback and exchange code for tokens
    const tokens = await github.validateAuthorizationCode(code);

    logger.debug('GitHub tokens received');

    // Get GitHub user info using the access token
    const githubUser = await github.getUserInfo(tokens.accessToken);
    const userLogger = logger.child({
      userId: githubUser.id.toString(),
      githubLogin: githubUser.login,
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
      scope: Array.isArray(oauthReqInfo.scope)
        ? oauthReqInfo.scope
        : typeof oauthReqInfo.scope === 'string'
          ? [oauthReqInfo.scope]
          : [],
      metadata: {
        githubLogin: githubUser.login,
        githubName: githubUser.name || githubUser.login,
        authorizedAt: Date.now(),
      },
      props: {
        userId: githubUser.id.toString(),
        githubLogin: githubUser.login,
        // Store GitHub access token for potential future use
        githubAccessToken: tokens.accessToken,
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

    return new Response(
      `Failed to complete OAuth flow: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 },
    );
  }
}

/**
 * Main GitHub OAuth handler
 * Routes /authorize and /callback to appropriate handlers
 */
export async function githubOAuthHandler(
  request: Request,
  env: OAuthEnv,
  _ctx: ExecutionContext,
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

  if (url.pathname === '/health') {
    // Verify all critical bindings are accessible
    const bindings = {
      r2: false,
      oauth_kv: false,
      rate_limit_kv: false,
      feature_flags_kv: false,
      analytics: false,
      mcp_sessions: false,
    };

    const warnings: string[] = [];

    try {
      // Check R2 bucket (list operation is lightweight)
      await env.SECOND_BRAIN_BUCKET.list({ limit: 1 });
      bindings.r2 = true;
    } catch {
      warnings.push('R2 bucket not accessible');
    }

    try {
      // Check KV namespaces (get operation is lightweight)
      await env.OAUTH_KV.get('__health_check__');
      bindings.oauth_kv = true;
    } catch {
      warnings.push('OAUTH_KV not accessible');
    }

    try {
      await env.RATE_LIMIT_KV.get('__health_check__');
      bindings.rate_limit_kv = true;
    } catch {
      warnings.push('RATE_LIMIT_KV not accessible');
    }

    try {
      await env.FEATURE_FLAGS_KV.get('__health_check__');
      bindings.feature_flags_kv = true;
    } catch {
      warnings.push('FEATURE_FLAGS_KV not accessible');
    }

    try {
      // Check Analytics Engine binding exists
      if (env.ANALYTICS) {
        bindings.analytics = true;
      } else {
        warnings.push('ANALYTICS binding not configured');
      }
    } catch {
      warnings.push('ANALYTICS not accessible');
    }

    try {
      // Check Durable Objects binding exists
      if (env.MCP_SESSIONS) {
        bindings.mcp_sessions = true;
      } else {
        warnings.push('MCP_SESSIONS binding not configured');
      }
    } catch {
      warnings.push('MCP_SESSIONS not accessible');
    }

    const allBindingsHealthy = Object.values(bindings).every((b) => b);

    return new Response(
      JSON.stringify({
        status: allBindingsHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        service: 'second-brain-mcp',
        version: getVersionString(),
        build: {
          commit: VERSION_INFO.commit !== '__COMMIT_SHA__' ? VERSION_INFO.commit : 'dev',
          time:
            VERSION_INFO.buildTime !== '__BUILD_TIME__'
              ? VERSION_INFO.buildTime
              : new Date().toISOString(),
          environment:
            VERSION_INFO.environment !== '__ENVIRONMENT__'
              ? VERSION_INFO.environment
              : 'development',
        },
        bindings,
        warnings: warnings.length > 0 ? warnings : undefined,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  logger.warn('Unknown OAuth route', { pathname: url.pathname });
  return new Response('Not Found', { status: 404 });
}

/**
 * Export the handler for OAuthProvider defaultHandler configuration
 */
export const GitHubHandler = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    return githubOAuthHandler(request, env as OAuthEnv, ctx);
  },
};
