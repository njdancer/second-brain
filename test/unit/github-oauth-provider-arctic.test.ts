/**
 * Unit tests for ArcticGitHubOAuthProvider
 * Tests the production GitHub OAuth provider wrapper
 */

// Mock the Arctic library before importing the provider
jest.mock('arctic', () => ({
  GitHub: jest.fn().mockImplementation(() => ({
    createAuthorizationURL: jest.fn(),
    validateAuthorizationCode: jest.fn(),
  })),
}));

import { ArcticGitHubOAuthProvider } from '../../src/github-oauth-provider-arctic';
import { GitHub } from 'arctic';

describe('ArcticGitHubOAuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateAuthorizationCode', () => {
    it('should handle GitHub OAuth app response (no refresh_token, no expires_in)', async () => {
      // Mock tokens object that matches real GitHub OAuth app behavior:
      // - Returns access_token
      // - hasRefreshToken() returns false
      // - accessTokenExpiresAt() throws (no expires_in field)
      const mockTokens = {
        accessToken: jest.fn().mockReturnValue('mock_access_token'),
        hasRefreshToken: jest.fn().mockReturnValue(false),
        refreshToken: jest.fn().mockImplementation(() => {
          throw new Error("Missing or invalid 'refresh_token' field");
        }),
        accessTokenExpiresAt: jest.fn().mockImplementation(() => {
          throw new Error("Missing or invalid 'expires_in' field");
        }),
      };

      const mockGitHubInstance = {
        validateAuthorizationCode: jest.fn().mockResolvedValue(mockTokens),
        createAuthorizationURL: jest.fn(),
      };

      (GitHub as jest.Mock).mockImplementation(() => mockGitHubInstance);

      const provider = new ArcticGitHubOAuthProvider('client_id', 'client_secret', 'http://localhost/callback');

      // Should not throw, should return undefined for both optional fields
      const tokens = await provider.validateAuthorizationCode('test_code');

      expect(tokens).toEqual({
        accessToken: 'mock_access_token',
        refreshToken: undefined, // Not returned by GitHub OAuth apps
        expiresIn: undefined, // Not returned by GitHub OAuth apps
      });

      expect(mockGitHubInstance.validateAuthorizationCode).toHaveBeenCalledWith('test_code');
      expect(mockTokens.hasRefreshToken).toHaveBeenCalled();
      expect(mockTokens.refreshToken).not.toHaveBeenCalled(); // Should not call when hasRefreshToken is false
    });

    it('should include refresh token and expires_in when available (GitHub Apps)', async () => {
      // Mock tokens that return refresh token and expiry - simulates GitHub App behavior
      const mockTokens = {
        accessToken: jest.fn().mockReturnValue('mock_access_token'),
        hasRefreshToken: jest.fn().mockReturnValue(true),
        refreshToken: jest.fn().mockReturnValue('mock_refresh_token'),
        accessTokenExpiresAt: jest.fn().mockReturnValue(new Date(Date.now() + 3600000)),
      };

      const mockGitHubInstance = {
        validateAuthorizationCode: jest.fn().mockResolvedValue(mockTokens),
        createAuthorizationURL: jest.fn(),
      };

      (GitHub as jest.Mock).mockImplementation(() => mockGitHubInstance);

      const provider = new ArcticGitHubOAuthProvider('client_id', 'client_secret', 'http://localhost/callback');

      const tokens = await provider.validateAuthorizationCode('test_code');

      expect(tokens).toEqual({
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token', // Should include when available
        expiresIn: expect.any(Number), // Should include when available
      });

      expect(mockTokens.hasRefreshToken).toHaveBeenCalled();
      expect(mockTokens.refreshToken).toHaveBeenCalled(); // Should call when hasRefreshToken is true
    });

    it('should handle refresh token without expiry', async () => {
      // Edge case: GitHub App with refresh token but no expiry time
      const mockTokens = {
        accessToken: jest.fn().mockReturnValue('mock_access_token'),
        hasRefreshToken: jest.fn().mockReturnValue(true),
        refreshToken: jest.fn().mockReturnValue('mock_refresh_token'),
        accessTokenExpiresAt: jest.fn().mockImplementation(() => {
          throw new Error("Missing or invalid 'expires_in' field");
        }),
      };

      const mockGitHubInstance = {
        validateAuthorizationCode: jest.fn().mockResolvedValue(mockTokens),
        createAuthorizationURL: jest.fn(),
      };

      (GitHub as jest.Mock).mockImplementation(() => mockGitHubInstance);

      const provider = new ArcticGitHubOAuthProvider('client_id', 'client_secret', 'http://localhost/callback');

      const tokens = await provider.validateAuthorizationCode('test_code');

      expect(tokens).toEqual({
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        expiresIn: undefined, // Should be undefined when no expiry
      });
    });
  });

  describe('createAuthorizationURL', () => {
    it('should delegate to Arctic GitHub provider', () => {
      const mockGitHubInstance = {
        createAuthorizationURL: jest.fn().mockReturnValue(new URL('https://github.com/login/oauth/authorize')),
        validateAuthorizationCode: jest.fn(),
      };

      (GitHub as jest.Mock).mockImplementation(() => mockGitHubInstance);

      const provider = new ArcticGitHubOAuthProvider('client_id', 'client_secret', 'http://localhost/callback');

      const url = provider.createAuthorizationURL('test_state', ['read:user']);

      expect(mockGitHubInstance.createAuthorizationURL).toHaveBeenCalledWith('test_state', ['read:user']);
      expect(url.hostname).toBe('github.com');
    });
  });

  describe('getUserInfo', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should fetch user info from GitHub API', async () => {
      const mockUserData = {
        id: 12345,
        login: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockUserData,
      });

      const provider = new ArcticGitHubOAuthProvider('client_id', 'client_secret', 'http://localhost/callback');

      const user = await provider.getUserInfo('mock_access_token');

      expect(user).toEqual(mockUserData);
      expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/user', {
        headers: {
          Authorization: 'Bearer mock_access_token',
          Accept: 'application/json',
          'User-Agent': 'Second-Brain-MCP/1.0',
        },
      });
    });

    it('should throw on API error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
      });

      const provider = new ArcticGitHubOAuthProvider('client_id', 'client_secret', 'http://localhost/callback');

      await expect(provider.getUserInfo('invalid_token')).rejects.toThrow('GitHub API error: 401');
    });
  });
});
