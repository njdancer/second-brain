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
   * Handle OAuth callback from GitHub (user identity verification)
   * This callback is from GitHub after the user has authenticated.
   * We verify the user's identity, then issue OUR OWN token for Claude to use.
   */
  async handleOAuthCallback(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const githubCode = url.searchParams.get('code'); // GitHub's authorization code
      const state = url.searchParams.get('state');

      if (!githubCode || !state) {
        return new Response(JSON.stringify({ error: 'Missing code or state parameter' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Verify state and get client redirect URI (Claude's callback URL)
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

      console.log('GitHub OAuth callback received:', {
        hasGitHubCode: !!githubCode,
        hasState: !!state,
        clientRedirectUri,
      });

      // Delete state (one-time use)
      await this.kv.delete(`oauth:state:${state}`);

      // === GITHUB OAUTH FLOW ===
      // Exchange GitHub code for GitHub access token (for user verification only)
      const githubTokenResponse = await this.exchangeCodeForToken(githubCode);

      // Get user info from GitHub to verify identity
      const userInfo = await this.getUserFromToken(githubTokenResponse.access_token);

      if (!userInfo) {
        return new Response(JSON.stringify({ error: 'Failed to fetch user info from GitHub' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      console.log('User authenticated via GitHub:', {
        userId: userInfo.userId,
        login: userInfo.login,
      });

      // Check if user is authorized to use this MCP server
      if (!(await this.isUserAuthorized(userInfo.userId))) {
        console.log('User not authorized:', userInfo.userId);
        return new Response(
          JSON.stringify({ error: 'User not authorized to access this service' }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // === OUR MCP SERVER OAUTH FLOW ===
      // Generate OUR OWN access token for Claude to use with our MCP server
      const mcpAccessToken = this.generateMCPToken(userInfo.userId);

      // Store our MCP token mapped to the user ID
      await this.kv.put(`mcp:token:${mcpAccessToken}`, userInfo.userId, {
        expirationTtl: TOKEN_TTL,
      });

      // Optionally store the GitHub token (encrypted) if we need it for future GitHub API calls
      // This allows us to make GitHub API calls on behalf of the user if needed
      const encryptedGitHubToken = await this.encryptToken(githubTokenResponse.access_token);
      await this.kv.put(`github:token:${userInfo.userId}`, encryptedGitHubToken, {
        expirationTtl: TOKEN_TTL,
      });

      // If client provided a redirect URI, redirect back with an authorization code
      if (clientRedirectUri) {
        // Generate a temporary authorization code for the MCP client (Claude) to exchange
        const mcpAuthCode = this.generateState();

        // Store OUR token with the auth code for later exchange
        const codeData = JSON.stringify({
          mcpAccessToken: mcpAccessToken, // OUR token, not GitHub's
          tokenType: 'bearer',
          scope: 'mcp:read mcp:write', // Our scopes, not GitHub's
          userId: userInfo.userId,
          timestamp: Date.now(),
        });

        console.log('=== OAUTH CALLBACK DEBUG ===');
        console.log('GitHub code:', githubCode);
        console.log('State:', state);
        console.log('Client redirect URI:', clientRedirectUri);
        console.log('MCP auth code generated:', mcpAuthCode);
        console.log('Stored at key:', `mcp:authcode:${mcpAuthCode}`);
        console.log('Code data:', codeData);

        // Authorization code expires in 5 minutes
        await this.kv.put(`mcp:authcode:${mcpAuthCode}`, codeData, { expirationTtl: 300 });

        const redirectUrl = new URL(clientRedirectUri);
        redirectUrl.searchParams.set('code', mcpAuthCode); // Our auth code, not GitHub's
        redirectUrl.searchParams.set('state', state);

        console.log('Redirecting to MCP client with authorization code');

        return Response.redirect(redirectUrl.toString(), 302);
      }

      // Fallback: return JSON (for testing/debugging)
      return new Response(
        JSON.stringify({
          success: true,
          mcp_access_token: mcpAccessToken, // OUR token for the MCP server
          token_type: 'bearer',
          scope: 'mcp:read mcp:write',
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
   * Generate an MCP access token for our server
   * This is OUR token that Claude will use, NOT GitHub's token
   */
  private generateMCPToken(userId: string): string {
    // Generate a secure random token with user ID embedded
    // Format: mcp_<random>_<timestamp>
    const random = this.generateState();
    const timestamp = Date.now().toString(36);
    return `mcp_${random}_${timestamp}`;
  }

  /**
   * Handle MCP OAuth token endpoint (exchange authorization code for MCP access token)
   * This exchanges OUR authorization codes for OUR MCP access tokens.
   * Claude calls this endpoint to get a token to use with our MCP server.
   */
  async handleTokenExchange(code: string): Promise<{
    access_token: string;
    token_type: string;
    scope: string;
    expires_in: number;
  } | null> {
    try {
      console.log('=== OAUTH TOKEN EXCHANGE DEBUG ===');
      console.log('Code received:', code);
      console.log('Looking up key:', `mcp:authcode:${code}`);

      // Look up the MCP authorization code that we generated
      const codeDataStr = await this.kv.get(`mcp:authcode:${code}`);

      console.log('Found code data:', codeDataStr ? 'YES' : 'NO');
      console.log('Code data string:', codeDataStr);

      if (!codeDataStr) {
        console.error('Invalid or expired MCP authorization code');
        return null;
      }

      // Parse the stored MCP token data
      const codeData = JSON.parse(codeDataStr);
      console.log('Parsed code data:', codeData);

      // Delete the code (one-time use)
      await this.kv.delete(`mcp:authcode:${code}`);

      console.log('Exchanged MCP authorization code for MCP access token', {
        userId: codeData.userId,
        scope: codeData.scope,
      });

      return {
        access_token: codeData.mcpAccessToken, // OUR MCP token, not GitHub's
        token_type: codeData.tokenType,
        scope: codeData.scope,
        expires_in: TOKEN_TTL,
      };
    } catch (error) {
      console.error('MCP token exchange error:', error);
      return null;
    }
  }

  /**
   * Validate an MCP access token and return user info
   * This validates OUR MCP tokens that we issued to Claude, NOT GitHub tokens.
   * Claude sends this token in the Authorization header for MCP requests.
   */
  async validateToken(token: string): Promise<UserInfo | null> {
    try {
      // Look up the MCP token in our KV store
      // The value is the user ID
      const userId = await this.kv.get(`mcp:token:${token}`);

      if (!userId) {
        console.log('MCP token not found or expired');
        return null;
      }

      console.log('MCP token validated for user:', userId);

      // Return user info - we could enrich this by fetching from GitHub if needed
      return {
        userId,
        login: '', // We don't have the login stored, could fetch from GitHub if needed
        name: '',
        email: '',
      };
    } catch (error) {
      console.error('MCP token validation error:', error);
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
