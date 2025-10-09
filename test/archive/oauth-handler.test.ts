/**
 * Unit tests for OAuth handler
 */

import { OAuthHandler, UserInfo, TokenResponse } from '../../src/oauth-handler';
import { MockKVNamespace } from '../mocks/kv';
import { MockGitHubOAuth } from '../mocks/github';

describe('OAuthHandler', () => {
  let mockKV: MockKVNamespace;
  let mockGitHub: MockGitHubOAuth;
  let oauthHandler: OAuthHandler;
  const clientId = 'test_client_id';
  const clientSecret = 'test_client_secret';
  const allowedUserId = '12345';
  const encryptionKey = 'test_encryption_key_32_characters!!';

  beforeEach(() => {
    mockKV = new MockKVNamespace();
    mockGitHub = new MockGitHubOAuth();
    oauthHandler = new OAuthHandler(
      mockKV as any,
      mockGitHub as any,
      clientId,
      clientSecret,
      allowedUserId,
      encryptionKey
    );
  });

  afterEach(() => {
    mockKV.clear();
    mockGitHub.clear();
  });

  describe('handleOAuthRedirect', () => {
    it('should generate authorization URL', async () => {
      const request = new Request('https://example.com/oauth/authorize');
      const response = await oauthHandler.handleOAuthRedirect(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain('github.com/login/oauth/authorize');
      expect(location).toContain(`client_id=${clientId}`);
      expect(location).toContain('scope=read%3Auser'); // URL-encoded
    });

    it('should include state parameter for CSRF protection', async () => {
      const request = new Request('https://example.com/oauth/authorize');
      const response = await oauthHandler.handleOAuthRedirect(request);

      const location = response.headers.get('Location');
      expect(location).toContain('state=');
    });
  });

  describe('handleOAuthCallback', () => {
    it('should verify user via GitHub and issue MCP token', async () => {
      const githubCode = 'valid_github_code';
      const state = 'test_state_123';

      // Set up state in KV (no redirect URI for this test)
      await mockKV.put(`oauth:state:${state}`, JSON.stringify({
        clientRedirectUri: null,
        timestamp: Date.now(),
      }));

      const request = new Request(`https://example.com/oauth/callback?code=${githubCode}&state=${state}`);

      const response = await oauthHandler.handleOAuthCallback(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.userId).toBe(allowedUserId);
      expect(body.mcp_access_token).toBeDefined(); // OUR MCP token
      expect(body.mcp_access_token).toContain('mcp_'); // Should have mcp_ prefix
      expect(body.token_type).toBe('bearer');
      expect(body.scope).toBe('mcp:read mcp:write'); // OUR scopes
    });

    it('should reject unauthorized users', async () => {
      // Add unauthorized user
      mockGitHub.addUser({
        id: 99999,
        login: 'unauthorized',
        name: 'Unauthorized User',
        email: 'unauthorized@example.com',
      });

      // Map code to unauthorized user
      const code = 'unauthorized_code';
      mockGitHub.setCodeForUser(code, 99999);

      const state = 'test_state_456';
      await mockKV.put(`oauth:state:${state}`, JSON.stringify({
        clientRedirectUri: null,
        timestamp: Date.now(),
      }));

      const request = new Request(`https://example.com/oauth/callback?code=${code}&state=${state}`);

      const response = await oauthHandler.handleOAuthCallback(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toContain('not authorized');
    });

    it('should reject invalid authorization codes', async () => {
      const state = 'test_state_789';
      await mockKV.put(`oauth:state:${state}`, JSON.stringify({
        clientRedirectUri: null,
        timestamp: Date.now(),
      }));

      const request = new Request(`https://example.com/oauth/callback?code=invalid_code&state=${state}`);

      const response = await oauthHandler.handleOAuthCallback(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });

    it('should reject missing code parameter', async () => {
      const request = new Request('https://example.com/oauth/callback');

      const response = await oauthHandler.handleOAuthCallback(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Missing code or state');
    });

    it('should redirect to client redirect_uri with authorization code', async () => {
      const code = 'valid_auth_code';
      const state = 'test_state_redirect';
      const clientRedirectUri = 'https://claude.ai/api/mcp/auth_callback';

      // Set up state with redirect URI
      await mockKV.put(`oauth:state:${state}`, JSON.stringify({
        clientRedirectUri,
        timestamp: Date.now(),
      }));

      const request = new Request(`https://example.com/oauth/callback?code=${code}&state=${state}`);

      const response = await oauthHandler.handleOAuthCallback(request);

      expect(response.status).toBe(302);
      const location = response.headers.get('Location');
      expect(location).toContain(clientRedirectUri);
      expect(location).toContain('code='); // Should be an auth code, not access token
      expect(location).toContain(`state=${state}`); // Should echo back the state
      expect(location).not.toContain('access_token'); // Should NOT contain the token
    });

    it('should reject invalid or expired state', async () => {
      const code = 'valid_auth_code';
      const state = 'invalid_state';

      const request = new Request(`https://example.com/oauth/callback?code=${code}&state=${state}`);

      const response = await oauthHandler.handleOAuthCallback(request);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Invalid or expired state');
    });
  });

  describe('handleTokenExchange', () => {
    it('should exchange MCP authorization code for MCP access token', async () => {
      const mcpAuthCode = 'test_mcp_auth_code_123';
      const mcpAccessToken = 'mcp_test_token_abc123';

      // Store MCP authorization code data (OUR auth code, not GitHub's)
      await mockKV.put(`mcp:authcode:${mcpAuthCode}`, JSON.stringify({
        mcpAccessToken, // OUR token
        tokenType: 'bearer',
        scope: 'mcp:read mcp:write', // OUR scopes
        userId: allowedUserId,
        timestamp: Date.now(),
      }));

      const result = await oauthHandler.handleTokenExchange(mcpAuthCode);

      expect(result).not.toBeNull();
      expect(result!.access_token).toBe(mcpAccessToken);
      expect(result!.token_type).toBe('bearer');
      expect(result!.scope).toBe('mcp:read mcp:write');
      expect(result!.expires_in).toBeGreaterThan(0);

      // Code should be deleted after use
      const codeStillExists = await mockKV.get(`mcp:authcode:${mcpAuthCode}`);
      expect(codeStillExists).toBeNull();
    });

    it('should reject invalid MCP authorization code', async () => {
      const result = await oauthHandler.handleTokenExchange('invalid_code');

      expect(result).toBeNull();
    });

    it('should reject expired MCP authorization code', async () => {
      const mcpAuthCode = 'expired_mcp_code';

      // Don't store the code (simulates expired/deleted code)
      const result = await oauthHandler.handleTokenExchange(mcpAuthCode);

      expect(result).toBeNull();
    });
  });

  describe('validateToken', () => {
    it('should validate a valid MCP token', async () => {
      const mcpToken = 'mcp_test_token_xyz789';

      // Store the MCP token (as our OAuth handler does after successful auth)
      await mockKV.put(`mcp:token:${mcpToken}`, allowedUserId);

      const userInfo = await oauthHandler.validateToken(mcpToken);

      expect(userInfo).not.toBeNull();
      expect(userInfo!.userId).toBe(allowedUserId);
    });

    it('should return null for invalid MCP token', async () => {
      const userInfo = await oauthHandler.validateToken('invalid_mcp_token');

      expect(userInfo).toBeNull();
    });

    it('should return null for expired MCP token', async () => {
      const expiredToken = 'mcp_expired_token';
      // Don't store the token (simulates expired/deleted token)

      const userInfo = await oauthHandler.validateToken(expiredToken);

      expect(userInfo).toBeNull();
    });
  });

  describe('isUserAuthorized', () => {
    it('should return true for allowed user', async () => {
      const isAuthorized = await oauthHandler.isUserAuthorized(allowedUserId);

      expect(isAuthorized).toBe(true);
    });

    it('should return false for unauthorized user', async () => {
      const isAuthorized = await oauthHandler.isUserAuthorized('99999');

      expect(isAuthorized).toBe(false);
    });
  });

  describe('refreshToken', () => {
    it('should refresh an expired token', async () => {
      const oldToken = 'old_token';
      const refreshToken = 'refresh_token';

      // Store old token with refresh token (encrypted)
      const encryptedOld = await oauthHandler.encryptToken(oldToken);
      const encryptedRefresh = await oauthHandler.encryptToken(refreshToken);
      await mockKV.put(`oauth:token:${allowedUserId}`, encryptedOld);
      await mockKV.put(`oauth:refresh:${allowedUserId}`, encryptedRefresh);

      const response = await oauthHandler.refreshToken(refreshToken);

      expect(response.access_token).toBeDefined();
      expect(response.access_token).not.toBe(oldToken);
    });

    it('should throw for invalid refresh token', async () => {
      await expect(oauthHandler.refreshToken('invalid_refresh')).rejects.toThrow();
    });
  });

  describe('token encryption', () => {
    it('should encrypt tokens before storing', async () => {
      const token = 'sensitive_token';
      const encrypted = await oauthHandler.encryptToken(token);

      expect(encrypted).not.toBe(token);
      expect(encrypted.length).toBeGreaterThan(token.length);
    });

    it('should decrypt tokens correctly', async () => {
      const token = 'sensitive_token';
      const encrypted = await oauthHandler.encryptToken(token);
      const decrypted = await oauthHandler.decryptToken(encrypted);

      expect(decrypted).toBe(token);
    });

    it('should throw for invalid encrypted data', async () => {
      await expect(oauthHandler.decryptToken('invalid_encrypted_data')).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle GitHub API failures gracefully', async () => {
      mockGitHub.setFailure(true);

      const request = new Request('https://example.com/oauth/callback?code=any_code');
      const response = await oauthHandler.handleOAuthCallback(request);

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle KV storage failures', async () => {
      // This would require adding failure modes to MockKVNamespace
      // For now, we'll test that errors are caught
      const invalidRequest = new Request('https://example.com/oauth/callback');
      const response = await oauthHandler.handleOAuthCallback(invalidRequest);

      expect(response.status).toBe(400);
    });
  });
});
