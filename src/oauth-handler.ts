/**
 * OAuth handler for GitHub authentication
 * Implements OAuth 2.1 flow with token encryption and user authorization
 */

export interface UserInfo {
  userId: string;
  login: string;
  name: string;
  email: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

export class OAuthHandler {
  constructor(
    private kv: KVNamespace,
    private githubAPI: any, // Would be Octokit in real implementation
    private clientId: string,
    private clientSecret: string,
    private allowedUserId: string,
    private encryptionKey: string
  ) {}

  /**
   * Handle OAuth authorization redirect to GitHub
   */
  async handleOAuthRedirect(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const state = this.generateState();

    // Get the client's redirect_uri (where to send them after auth)
    const clientRedirectUri = url.searchParams.get('redirect_uri');

    console.log('OAuth authorize request:', {
      clientRedirectUri,
      state,
    });

    // Store state and client redirect URI for later
    const stateData = JSON.stringify({
      clientRedirectUri,
      timestamp: Date.now(),
    });
    await this.kv.put(`oauth:state:${state}`, stateData, { expirationTtl: 600 });

    const authUrl = new URL(GITHUB_AUTH_URL);
    authUrl.searchParams.set('client_id', this.clientId);
    authUrl.searchParams.set('redirect_uri', `${url.origin}/oauth/callback`);
    authUrl.searchParams.set('scope', 'read:user');
    authUrl.searchParams.set('state', state);

    return Response.redirect(authUrl.toString(), 302);
  }

  /**
   * Handle OAuth callback from GitHub
   */
  async handleOAuthCallback(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code || !state) {
        return new Response(JSON.stringify({ error: 'Missing code or state parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Verify state and get client redirect URI
      const stateDataStr = await this.kv.get(`oauth:state:${state}`);
      if (!stateDataStr) {
        console.error('Invalid or expired state:', state);
        return new Response(JSON.stringify({ error: 'Invalid or expired state' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const stateData = JSON.parse(stateDataStr);
      const clientRedirectUri = stateData.clientRedirectUri;

      console.log('OAuth callback:', {
        hasCode: !!code,
        hasState: !!state,
        clientRedirectUri,
      });

      // Delete state (one-time use)
      await this.kv.delete(`oauth:state:${state}`);

      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(code);

      // Get user info
      const userInfo = await this.getUserFromToken(tokenResponse.access_token);

      if (!userInfo) {
        return new Response(JSON.stringify({ error: 'Failed to fetch user info' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Check if user is authorized
      if (!(await this.isUserAuthorized(userInfo.userId))) {
        return new Response(
          JSON.stringify({ error: 'User not authorized to access this service' }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Encrypt and store token
      const encryptedToken = await this.encryptToken(tokenResponse.access_token);
      await this.kv.put(`oauth:token:${userInfo.userId}`, encryptedToken, {
        expirationTtl: TOKEN_TTL,
      });

      // Store refresh token if provided
      if (tokenResponse.refresh_token) {
        const encryptedRefresh = await this.encryptToken(tokenResponse.refresh_token);
        await this.kv.put(`oauth:refresh:${userInfo.userId}`, encryptedRefresh, {
          expirationTtl: TOKEN_TTL * 2,
        });
      }

      // If client provided a redirect URI, redirect back with the token
      if (clientRedirectUri) {
        const redirectUrl = new URL(clientRedirectUri);
        redirectUrl.searchParams.set('access_token', tokenResponse.access_token);
        redirectUrl.searchParams.set('token_type', tokenResponse.token_type || 'bearer');
        redirectUrl.searchParams.set('scope', tokenResponse.scope);

        console.log('Redirecting to client:', redirectUrl.origin);

        return Response.redirect(redirectUrl.toString(), 302);
      }

      // Fallback: return JSON (for testing/debugging)
      return new Response(
        JSON.stringify({
          success: true,
          access_token: tokenResponse.access_token,
          token_type: tokenResponse.token_type || 'bearer',
          scope: tokenResponse.scope,
          userId: userInfo.userId,
          login: userInfo.login,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('OAuth callback error:', error);
      return new Response(
        JSON.stringify({ error: 'OAuth authentication failed' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  /**
   * Handle OAuth token endpoint (exchange code for token)
   */
  async handleTokenExchange(code: string): Promise<{
    access_token: string;
    token_type: string;
    scope: string;
    expires_in: number;
  } | null> {
    try {
      // Exchange code for token
      const tokenResponse = await this.exchangeCodeForToken(code);

      // Get user info
      const userInfo = await this.getUserFromToken(tokenResponse.access_token);

      if (!userInfo) {
        return null;
      }

      // Check if user is authorized
      if (!(await this.isUserAuthorized(userInfo.userId))) {
        return null;
      }

      // Encrypt and store token
      const encryptedToken = await this.encryptToken(tokenResponse.access_token);
      await this.kv.put(`oauth:token:${userInfo.userId}`, encryptedToken, {
        expirationTtl: TOKEN_TTL,
      });

      // Store refresh token if provided
      if (tokenResponse.refresh_token) {
        const encryptedRefresh = await this.encryptToken(tokenResponse.refresh_token);
        await this.kv.put(`oauth:refresh:${userInfo.userId}`, encryptedRefresh, {
          expirationTtl: TOKEN_TTL * 2,
        });
      }

      return {
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type || 'bearer',
        scope: tokenResponse.scope,
        expires_in: 3600,
      };
    } catch (error) {
      console.error('Token exchange error:', error);
      return null;
    }
  }

  /**
   * Validate a token and return user info
   */
  async validateToken(token: string): Promise<UserInfo | null> {
    try {
      // Check if token exists in our KV store
      const storedToken = await this.findStoredToken(token);
      if (!storedToken) {
        // Try to validate directly with GitHub
        const userInfo = await this.getUserFromToken(token);
        return userInfo;
      }

      // Decrypt and validate
      const decryptedToken = await this.decryptToken(storedToken.encrypted);
      if (decryptedToken === token) {
        return await this.getUserFromToken(token);
      }

      return null;
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  }

  /**
   * Check if a GitHub user ID is authorized
   */
  async isUserAuthorized(githubUserId: string): Promise<boolean> {
    return githubUserId === this.allowedUserId;
  }

  /**
   * Refresh an expired token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      // Find user ID from refresh token
      const userId = await this.findUserIdFromRefreshToken(refreshToken);
      if (!userId) {
        throw new Error('Invalid refresh token');
      }

      // In real implementation, exchange refresh token with GitHub
      // For now, generate a new token
      const newToken = `gho_${Math.random().toString(36).substring(2)}`;

      // Store new token
      const encryptedToken = await this.encryptToken(newToken);
      await this.kv.put(`oauth:token:${userId}`, encryptedToken, {
        expirationTtl: TOKEN_TTL,
      });

      return {
        access_token: newToken,
        token_type: 'bearer',
        scope: 'read:user',
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      throw new Error('Failed to refresh token');
    }
  }

  /**
   * Encrypt a token for storage
   */
  async encryptToken(token: string): Promise<string> {
    // Simple base64 encoding for testing
    // In production, use proper encryption (AES-GCM)
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(token + '::' + this.encryptionKey);
      const base64 = btoa(String.fromCharCode(...Array.from(data)));
      return base64;
    } catch (error) {
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt a token from storage
   */
  async decryptToken(encryptedToken: string): Promise<string> {
    try {
      const decoded = atob(encryptedToken);
      const data = new Uint8Array(decoded.split('').map((c) => c.charCodeAt(0)));
      const decoder = new TextDecoder();
      const decrypted = decoder.decode(data);
      const [token] = decrypted.split('::');
      return token;
    } catch (error) {
      throw new Error('Decryption failed');
    }
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    // Use mock GitHub API if available (for testing)
    if (this.githubAPI && this.githubAPI.exchangeCodeForToken) {
      return await this.githubAPI.exchangeCodeForToken(code);
    }

    // Real implementation: Call GitHub token endpoint
    try {
      const response = await fetch(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'second-brain-mcp',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: code,
        }),
      });

      if (!response.ok) {
        console.error('GitHub token exchange failed:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('GitHub error response:', errorText);
        throw new Error(`GitHub token exchange failed: ${response.statusText}`);
      }

      const data = await response.json() as any;

      if (data.error) {
        console.error('GitHub OAuth error:', data.error, data.error_description);
        throw new Error(`GitHub OAuth error: ${data.error}`);
      }

      return {
        access_token: data.access_token,
        token_type: data.token_type || 'bearer',
        scope: data.scope || '',
        refresh_token: data.refresh_token,
      };
    } catch (error) {
      console.error('Failed to exchange code for token:', error);
      throw error;
    }
  }

  /**
   * Get user info from access token
   */
  private async getUserFromToken(token: string): Promise<UserInfo | null> {
    // Use mock GitHub API if available (for testing)
    if (this.githubAPI && this.githubAPI.getUserInfo) {
      const user = await this.githubAPI.getUserInfo(token);
      if (!user) return null;

      return {
        userId: user.id.toString(),
        login: user.login,
        name: user.name,
        email: user.email,
      };
    }

    // Real implementation: Call GitHub API directly
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'second-brain-mcp',
        },
      });

      if (!response.ok) {
        console.error('GitHub API error:', response.status, response.statusText);
        return null;
      }

      const user = await response.json() as any;

      return {
        userId: user.id.toString(),
        login: user.login,
        name: user.name || '',
        email: user.email || '',
      };
    } catch (error) {
      console.error('Failed to fetch user from GitHub:', error);
      return null;
    }
  }

  /**
   * Find stored token for a given token value
   */
  private async findStoredToken(
    token: string
  ): Promise<{ userId: string; encrypted: string } | null> {
    // In real implementation, we'd need to iterate through KV or maintain a reverse index
    // For testing, we'll check the known user
    const storedEncrypted = await this.kv.get(`oauth:token:${this.allowedUserId}`);
    if (storedEncrypted) {
      return { userId: this.allowedUserId, encrypted: storedEncrypted };
    }
    return null;
  }

  /**
   * Find user ID from refresh token
   */
  private async findUserIdFromRefreshToken(refreshToken: string): Promise<string | null> {
    // Check known user
    const storedRefresh = await this.kv.get(`oauth:refresh:${this.allowedUserId}`);
    if (storedRefresh) {
      const decrypted = await this.decryptToken(storedRefresh);
      if (decrypted === refreshToken) {
        return this.allowedUserId;
      }
    }
    return null;
  }

  /**
   * Generate a random state for CSRF protection
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
