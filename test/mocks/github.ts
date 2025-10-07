/**
 * Mock GitHub OAuth for testing
 */

export interface MockGitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
}

export class MockGitHubOAuth {
  private users: Map<string, MockGitHubUser> = new Map();
  private tokens: Map<string, { userId: number; expiresAt: number }> = new Map();
  private codesToUsers: Map<string, number> = new Map();
  private shouldFail: boolean = false;

  constructor() {
    // Add a default test user
    this.addUser({
      id: 12345,
      login: 'testuser',
      name: 'Test User',
      email: 'test@example.com',
    });
  }

  addUser(user: MockGitHubUser): void {
    this.users.set(user.id.toString(), user);
  }

  setCodeForUser(code: string, userId: number): void {
    this.codesToUsers.set(code, userId);
  }

  async exchangeCodeForToken(code: string): Promise<{
    access_token: string;
    token_type: string;
    scope: string;
  }> {
    if (this.shouldFail) {
      throw new Error('OAuth exchange failed');
    }

    if (code === 'invalid_code') {
      throw new Error('Invalid authorization code');
    }

    // Check if code is mapped to a specific user
    const userId = this.codesToUsers.get(code) || 12345; // Default test user

    // Generate a fake token
    const token = `gho_${Math.random().toString(36).substring(2)}`;
    const expiresAt = Date.now() + 3600000; // 1 hour from now

    this.tokens.set(token, { userId, expiresAt });

    return {
      access_token: token,
      token_type: 'bearer',
      scope: 'read:user',
    };
  }

  async getUserInfo(token: string): Promise<MockGitHubUser | null> {
    if (this.shouldFail) {
      throw new Error('Failed to fetch user info');
    }

    const tokenData = this.tokens.get(token);
    if (!tokenData) {
      return null;
    }

    // Check expiration
    if (tokenData.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return null;
    }

    return this.users.get(tokenData.userId.toString()) || null;
  }

  async validateToken(token: string): Promise<boolean> {
    const tokenData = this.tokens.get(token);
    if (!tokenData) {
      return false;
    }

    if (tokenData.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return false;
    }

    return true;
  }

  // Test helpers
  setFailure(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  revokeToken(token: string): void {
    this.tokens.delete(token);
  }

  clear(): void {
    this.users.clear();
    this.tokens.clear();
    this.codesToUsers.clear();
    this.shouldFail = false;
    // Re-add default user
    this.addUser({
      id: 12345,
      login: 'testuser',
      name: 'Test User',
      email: 'test@example.com',
    });
  }
}
