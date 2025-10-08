# E2E Tests - Testing Against Real Production

## Why These Tests Exist

Unit tests with mocks gave us false confidence. Production code had placeholder implementations (`return null`, "TODO: Real implementation") that passed all tests but failed in production.

**Problems We Missed:**
1. OAuth callback not returning `access_token` to client
2. `getUserFromToken()` returning `null` instead of calling GitHub API
3. No verification that deployed server actually works

**E2E tests solve this by:**
- Testing against the REAL deployed server
- Using REAL GitHub OAuth (with test account)
- NO MOCKS - if it fails here, it fails in production
- Running automatically after every deployment

## Test Categories

### 1. Deployment Smoke Tests (CRITICAL)
Run immediately after deployment, before marking deploy as successful.

- ✅ Server responds to requests
- ✅ OAuth URL generation works
- ✅ MCP initialize returns valid response
- ✅ Health check passes

**If these fail, deployment is rolled back automatically.**

### 2. OAuth Flow E2E
Tests complete OAuth flow with real GitHub account.

- ✅ OAuth redirect to GitHub works
- ✅ Callback receives authorization code
- ✅ Token exchange returns `access_token` ← Would have caught first bug
- ✅ Token validation with GitHub API works ← Would have caught second bug
- ✅ MCP requests with token succeed

### 3. MCP Protocol E2E
Tests all MCP operations against production.

- ✅ Unauthenticated initialize returns OAuth instructions
- ✅ Authenticated initialize returns capabilities
- ✅ tools/list returns all 5 tools
- ✅ tools/call executes successfully
- ✅ prompts/list returns all 3 prompts
- ✅ Rate limiting enforced
- ✅ Error handling correct

### 4. Integration Scenarios
Real-world user flows.

- ✅ New user: OAuth → Bootstrap → Create note → Read note
- ✅ Existing user: Reconnect → List files → Edit file
- ✅ Mobile flow: OAuth with localhost redirect
- ✅ Desktop flow: OAuth with server redirect

## Running E2E Tests

### Prerequisites

You need a GitHub test account for OAuth:

```bash
# .env.e2e (not committed)
E2E_GITHUB_USERNAME=second-brain-test-bot
E2E_GITHUB_PASSWORD=<password>
E2E_GITHUB_TOTP_SECRET=<2fa_secret>
MCP_SERVER_URL=https://second-brain-mcp.nick-01a.workers.dev
```

### Local Testing

```bash
# Test against production
pnpm run test:e2e

# Test against dev environment
pnpm run test:e2e:dev
```

### CI/CD Integration

E2E tests run in two places:

**1. Post-Deployment Verification**
```yaml
- name: Deploy to Production
  run: pnpm wrangler deploy

- name: E2E Smoke Tests
  run: pnpm run test:e2e:smoke

- name: Rollback if tests fail
  if: failure()
  run: pnpm wrangler rollback
```

**2. Nightly Full E2E Suite**
```yaml
# Every night at 2 AM
- cron: '0 2 * * *'
```

Catches regressions from:
- Cloudflare platform changes
- GitHub API changes
- Rate limiting issues
- Storage quota problems

## Test Structure

```
test/e2e/
├── smoke/           # Fast tests that run after every deploy
│   ├── health.e2e.ts
│   ├── oauth-url.e2e.ts
│   └── mcp-init.e2e.ts
├── oauth/           # Full OAuth flow tests
│   ├── complete-flow.e2e.ts
│   ├── token-validation.e2e.ts
│   └── error-cases.e2e.ts
├── mcp/             # MCP protocol tests
│   ├── tools.e2e.ts
│   ├── prompts.e2e.ts
│   └── rate-limiting.e2e.ts
├── scenarios/       # User workflow tests
│   ├── new-user.e2e.ts
│   ├── mobile.e2e.ts
│   └── desktop.e2e.ts
└── helpers/
    ├── github-oauth.ts   # Real GitHub login automation
    ├── mcp-client.ts     # Real MCP client
    └── assertions.ts     # Custom matchers
```

## Why We Need This

**Unit tests tell us:** "This code works in isolation with mocks"

**E2E tests tell us:** "This actually works in production"

Both are needed! But we were missing E2E tests, which meant:
- ❌ Deployed broken OAuth callback 3 times
- ❌ Never tested token validation in production
- ❌ False confidence from passing unit tests

With E2E tests:
- ✅ Catches production bugs before users see them
- ✅ Verifies actual deployed code works
- ✅ Tests real integrations (GitHub API, Cloudflare runtime)
- ✅ Can roll back bad deployments automatically

## Lessons Learned

### ❌ What Doesn't Work

```typescript
// Unit test
it('validates token', async () => {
  // Inject mock
  const handler = new OAuthHandler(kv, mockGitHub, ...);
  const user = await handler.validateToken('token');
  expect(user).toBeTruthy(); // ✅ PASSES
});

// Production code
async validateToken(token) {
  if (this.githubAPI) return await this.githubAPI.getUserInfo(token);
  return null; // ← PRODUCTION ALWAYS HITS THIS!
}
```

Unit test passes ✅ but production is broken ❌

### ✅ What Works

```typescript
// E2E test
it('validates real GitHub token', async () => {
  const token = await getTokenFromGitHub(); // Real OAuth
  const response = await fetch(`${PROD_URL}/mcp`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(response.status).toBe(200); // Would have FAILED ❌
});
```

Tests actual production code with real GitHub API.

## Next Steps

1. ✅ Implement smoke tests (run after every deploy)
2. ✅ Add OAuth flow E2E tests
3. ✅ Add MCP protocol E2E tests
4. ✅ Integrate with deployment pipeline
5. ✅ Set up nightly E2E suite
6. ✅ Add deployment rollback on E2E failure

**After this:** We'll catch production bugs BEFORE users do.
