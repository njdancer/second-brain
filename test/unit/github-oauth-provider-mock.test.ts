/**
 * Unit tests for MockGitHubOAuthProvider
 */

import { MockGitHubOAuthProvider } from '../mocks/github-oauth-provider-mock';

describe('MockGitHubOAuthProvider', () => {
  let provider: MockGitHubOAuthProvider;

  beforeEach(() => {
    provider = new MockGitHubOAuthProvider({
      baseUrl: 'http://localhost:3000',
      userId: 12345,
      username: 'testuser',
    });
  });

  describe('createAuthorizationURL', () => {
    test('should create authorization URL with state and scopes', () => {
      const state = 'test_state_123';
      const scopes = ['read:user', 'user:email'];

      const authUrl = provider.createAuthorizationURL(state, scopes);

      expect(authUrl.toString()).toContain('localhost:3000/login/oauth/authorize');
      expect(authUrl.searchParams.get('state')).toBe(state);
      expect(authUrl.searchParams.get('scope')).toBe('read:user user:email');
      expect(authUrl.searchParams.get('_test_code')).toBeTruthy();
    });

    test('should generate unique codes for each authorization', () => {
      const authUrl1 = provider.createAuthorizationURL('state1', ['read:user']);
      const authUrl2 = provider.createAuthorizationURL('state2', ['read:user']);

      const code1 = authUrl1.searchParams.get('_test_code');
      const code2 = authUrl2.searchParams.get('_test_code');

      expect(code1).toBeTruthy();
      expect(code2).toBeTruthy();
      expect(code1).not.toBe(code2);
    });
  });

  describe('validateAuthorizationCode', () => {
    test('should exchange valid code for tokens', async () => {
      const authUrl = provider.createAuthorizationURL('state', ['read:user']);
      const code = provider.extractTestCode(authUrl);

      const tokens = await provider.validateAuthorizationCode(code);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresIn', 3600);
      expect(typeof tokens.accessToken).toBe('string');
    });

    test('should reject invalid authorization code', async () => {
      await expect(
        provider.validateAuthorizationCode('invalid_code')
      ).rejects.toThrow('Invalid authorization code');
    });

    test('should allow code reuse (for E2E testing)', async () => {
      const authUrl = provider.createAuthorizationURL('state', ['read:user']);
      const code = provider.extractTestCode(authUrl);

      // Use code once
      const tokens1 = await provider.validateAuthorizationCode(code);
      expect(tokens1.accessToken).toBeTruthy();

      // Should allow reuse (for E2E tests where instances aren't shared)
      const tokens2 = await provider.validateAuthorizationCode(code);
      expect(tokens2.accessToken).toBeTruthy();
    });
  });

  describe('getUserInfo', () => {
    test('should return user info for valid token', async () => {
      const authUrl = provider.createAuthorizationURL('state', ['read:user']);
      const code = provider.extractTestCode(authUrl);
      const tokens = await provider.validateAuthorizationCode(code);

      const user = await provider.getUserInfo(tokens.accessToken);

      expect(user).toEqual({
        id: 12345,
        login: 'testuser',
        name: 'Test User 12345',
        email: 'testuser@example.com',
      });
    });

    test('should reject invalid access token', async () => {
      await expect(
        provider.getUserInfo('invalid_token')
      ).rejects.toThrow('Invalid access token');
    });
  });

  describe('extractTestCode', () => {
    test('should extract test code from authorization URL', () => {
      const authUrl = provider.createAuthorizationURL('state', ['read:user']);
      const code = provider.extractTestCode(authUrl);

      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });

    test('should throw error if no test code in URL', () => {
      const url = new URL('http://localhost:3000/authorize');

      expect(() => provider.extractTestCode(url)).toThrow('No test code');
    });
  });

  describe('custom access token', () => {
    test('should use provided access token', async () => {
      // Token must start with mock_github_token_ for validation
      const customToken = 'mock_github_token_custom_123';
      const customProvider = new MockGitHubOAuthProvider({
        baseUrl: 'http://localhost:3000',
        userId: 12345,
        username: 'testuser',
        accessToken: customToken,
      });

      const authUrl = customProvider.createAuthorizationURL('state', ['read:user']);
      const code = customProvider.extractTestCode(authUrl);
      const tokens = await customProvider.validateAuthorizationCode(code);

      expect(tokens.accessToken).toBe(customToken);

      const user = await customProvider.getUserInfo(customToken);
      expect(user.id).toBe(12345);
    });
  });
});
