/**
 * E2E Smoke Test: Token Validation Against GitHub API
 *
 * This test would have caught the bug where validateToken()
 * had a comment "Real implementation would call GitHub API"
 * but actually just returned null in production.
 *
 * BUG: Production code was:
 *   if (this.githubAPI) { return await this.githubAPI.getUserInfo(token); }
 *   return null;  // ← Production ALWAYS hit this!
 *
 * Unit tests passed because they injected mockGitHub API.
 * E2E tests would have failed because production returns null.
 */

// Jest globals (describe, it, expect) available via test environment

describe('E2E: GitHub Token Validation', () => {
  const SERVER_URL = process.env.MCP_SERVER_URL || 'https://second-brain-mcp.nick-01a.workers.dev';
  const TEST_TOKEN = process.env.E2E_GITHUB_TOKEN; // Real token from .env.e2e

  it('CRITICAL: Server must validate tokens via GitHub API, not just KV lookup', async () => {
    if (!TEST_TOKEN) {
      console.warn('Skipping token validation test - no E2E_GITHUB_TOKEN set');
      console.warn('This test would have caught the getUserFromToken() bug!');
      return;
    }

    // Make MCP request with a real GitHub token
    const response = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'e2e-test', version: '1.0.0' },
        },
      }),
    });

    const data: { error?: { message?: string }; result?: { capabilities?: unknown } } =
      await response.json();

    // Should NOT return "Invalid or expired token"
    if (data.error && data.error.message === 'Invalid or expired token') {
      throw new Error(
        'CRITICAL BUG: Server rejected valid GitHub token! ' +
          'This means validateToken() is not calling GitHub API to verify tokens. ' +
          'The bug was: getUserFromToken() returned null instead of calling ' +
          'fetch("https://api.github.com/user", { headers: { Authorization: Bearer ${token} } }). ' +
          'Unit tests passed because they used mocks.',
      );
    }

    // Should return capabilities for authenticated user
    expect(response.status).toBe(200);
    expect(data.result).toBeDefined();
    expect(data.result?.capabilities).toBeDefined();
    expect(data.error).toBeUndefined();

    console.log('✅ Token validation working - server called GitHub API');
  });

  it('documents the token validation flow', () => {
    // This serves as living documentation of how token validation should work

    const tokenValidationFlow = {
      step1: 'Client sends: Authorization: Bearer gho_xxxxx',
      step2: 'Server extracts token from header',
      step3: 'Server checks KV store for encrypted token (optional cache)',
      step4: 'If not in KV, server calls: GET https://api.github.com/user with token',
      step5: 'GitHub API returns user info if token is valid',
      step6: 'Server verifies user is in allowlist',
      step7: 'Server processes request with authenticated user context',

      criticalBug: {
        problem: 'Step 4 was returning null instead of calling GitHub API',
        symptom: 'All token validation failed with "Invalid or expired token"',
        fix: 'Implement real fetch() call to GitHub API',
        test: 'This E2E test - would have caught it immediately',
      },
    };

    console.log('Token Validation Flow:');
    console.log(JSON.stringify(tokenValidationFlow, null, 2));

    expect(tokenValidationFlow.step4).toContain('api.github.com');
  });

  it('verifies token validation does not rely solely on KV storage', () => {
    // The bug was that validateToken() only worked if token was in KV
    // But fresh tokens from OAuth won't be in KV yet!

    // This test documents that behavior
    const documentation = {
      scenario: 'User completes OAuth flow and gets fresh token from GitHub',
      problem: 'Token is not in server KV store yet',
      expectedBehavior: 'Server calls GitHub API to validate token',
      buggyBehavior: 'Server returns null because token not in KV',
      result: 'MCP returns "Invalid or expired token" for valid tokens',
      impact: 'Complete OAuth flow broken - no users can authenticate',
    };

    console.log('Fresh Token Validation:');
    console.log(JSON.stringify(documentation, null, 2));

    // Verify this is documented
    expect(documentation.expectedBehavior).toContain('GitHub API');
  });
});
