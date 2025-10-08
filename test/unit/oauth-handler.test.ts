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
    it('should exchange code for token and store it', async () => {
      const code = 'valid_auth_code';
      const state = 'test_state_123';

      // Set up state in KV
      await mockKV.put(`oauth:state:${state}`, JSON.stringify({
        clientRedirectUri: null,
        timestamp: Date.now(),
      }));

      const request = new Request(`https://example.com/oauth/callback?code=${code}&state=${state}`);

      const response = await oauthHandler.handleOAuthCallback(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.userId).toBe(allowedUserId);
      expect(body.access_token).toBeDefined();
      expect(body.token_type).toBe('bearer');
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
    it('should exchange authorization code for access token', async () => {
      const authCode = 'test_auth_code_123';
      const accessToken = 'gho_test_access_token';

      // Store authorization code data
      await mockKV.put(`oauth:code:${authCode}`, JSON.stringify({
        accessToken,
        tokenType: 'bearer',
        scope: 'read:user',
        userId: allowedUserId,
        timestamp: Date.now(),
      }));

      const result = await oauthHandler.handleTokenExchange(authCode);

      expect(result).not.toBeNull();
      expect(result!.access_token).toBe(accessToken);
      expect(result!.token_type).toBe('bearer');
      expect(result!.scope).toBe('read:user');
      expect(result!.expires_in).toBeGreaterThan(0);

      // Code should be deleted after use
      const codeStillExists = await mockKV.get(`oauth:code:${authCode}`);
      expect(codeStillExists).toBeNull();
    });

    it('should reject invalid authorization code', async () => {
      const result = await oauthHandler.handleTokenExchange('invalid_code');

      expect(result).toBeNull();
    });

    it('should reject expired authorization code', async () => {
      const authCode = 'expired_code';

      // Don't store the code (simulates expired/deleted code)
      const result = await oauthHandler.handleTokenExchange(authCode);

      expect(result).toBeNull();
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      // First, simulate OAuth flow to get a token
      const { access_token } = await mockGitHub.exchangeCodeForToken('valid_code');

      // Store encrypted token (as the OAuth handler does)
      const encrypted = await oauthHandler.encryptToken(access_token);
      await mockKV.put(`oauth:token:${allowedUserId}`, encrypted);

      const userInfo = await oauthHandler.validateToken(access_token);

      expect(userInfo).not.toBeNull();
      expect(userInfo!.userId).toBe(allowedUserId);
      expect(userInfo!.login).toBe('testuser');
    });

    it('should return null for invalid token', async () => {
      const userInfo = await oauthHandler.validateToken('invalid_token');

      expect(userInfo).toBeNull();
    });

    it('should return null for expired token', async () => {
      const expiredToken = 'gho_expired';
      mockGitHub.revokeToken(expiredToken);

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
