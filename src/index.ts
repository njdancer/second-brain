/**
 * Cloudflare Worker entry point
 * Uses @cloudflare/workers-oauth-provider for OAuth 2.1 with PKCE
 * Pattern based on Cloudflare's remote-mcp-github-oauth template
 */

import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { GitHubHandler } from './oauth-ui-handler';
import { MCPHandler } from './mcp-api-handler';

/**
 * Environment bindings
 */
export interface Env {
  // R2 bucket bindings
  SECOND_BRAIN_BUCKET: R2Bucket;

  // KV namespace bindings
  OAUTH_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;

  // Analytics Engine binding
  ANALYTICS: AnalyticsEngineDataset;

  // Secrets
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_ALLOWED_USER_ID: string;
  COOKIE_ENCRYPTION_KEY: string;

  // AWS S3 backup configuration
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  AWS_S3_BACKUP_BUCKET: string;
}

/**
 * Export OAuthProvider instance
 * This handles:
 * - OAuth 2.1 authorization flow with PKCE
 * - Token issuance, refresh, and revocation
 * - Dynamic client registration
 * - OAuth discovery endpoints
 */
export default new OAuthProvider({
  // API handler for authenticated MCP requests
  // OAuthProvider validates tokens and injects user info into env.props
  apiRoute: '/mcp',
  apiHandler: MCPHandler as any,

  // Default handler for OAuth UI (GitHub authentication)
  // Handles /oauth/authorize and /oauth/callback endpoints
  defaultHandler: GitHubHandler as any,

  // OAuth endpoints (library manages these automatically with PKCE)
  authorizeEndpoint: '/oauth/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/register',

  // Token TTL configuration
  accessTokenTTL: 3600, // 1 hour
  refreshTokenTTL: 2592000, // 30 days

  // OAuth scopes (optional, for future extensions)
  scopesSupported: ['read', 'write'],
});

/**
 * NOTE: Scheduled handler (cron backups) has been disabled for now
 * to simplify the OAuth migration. Will be re-implemented as a separate
 * worker if needed. See PLAN.md for details.
 */
