# Second Brain MCP Implementation Plan

**Version:** 4.0
**Date:** October 9, 2025
**Status:** 🚨 OAuth Integration Issues - Claude.ai Cannot Connect
**Last Updated:** 2025-10-09 UTC

---

## Executive Summary

Model Context Protocol (MCP) server enabling Claude to function as a personal knowledge management assistant using Building a Second Brain (BASB) methodology. Deployed on Cloudflare Workers with R2 storage.

**Current Status (v1.2.3):**
- ✅ MCP server with 5 core tools (read, write, edit, glob, grep) - **DEPLOYED**
- ✅ Rate limiting, storage quotas, bootstrap system - **DEPLOYED**
- ✅ Comprehensive test coverage (304 tests passing) - **COMPLETE**
- ✅ OAuth authentication via GitHub - **IMPLEMENTED**
- ✅ OAuth 2.1 discovery endpoints - **DEPLOYED**
- ✅ OAuth token endpoint (/oauth/token) - **DEPLOYED**
- ✅ E2E testing with mock OAuth - **IMPLEMENTED**
- ❌ **CRITICAL ISSUE:** Claude.ai returns "Invalid authorization" error during OAuth flow

**Current Blocker:** OAuth flow fails when Claude tries to exchange authorization code for access token. Authorization code gets created and returned to Claude, but token exchange fails with "invalid_grant" error.

**Test Coverage:** 95.13% statements, 86.1% branches, 96.2% functions (304/304 tests passing)

---

## Project Status

### Completed Features (Phases 0-11)

**Infrastructure:**
- ✅ Cloudflare Workers deployment with GitHub Actions CI/CD
- ✅ R2 storage with quotas (10GB total, 10k files, 10MB per file)
- ✅ KV-based rate limiting (100/min, 1000/hr, 10000/day)
- ✅ Analytics Engine monitoring
- ✅ AWS S3 backup system (daily cron)

**MCP Protocol:**
- ✅ Streamable HTTP transport (protocol version 2024-11-05)
- ✅ Tool registration and execution (read, write, edit, glob, grep)
- ✅ Prompt system (capture-note, weekly-review, research-summary)
- ✅ Bootstrap system (creates PARA structure on first use)
- ✅ Session management

**Authentication:**
- ✅ GitHub OAuth 2.1 flow
- ✅ Token encryption and storage
- ✅ User authorization (allowlist)
- ✅ OAuth discovery endpoints (RFC 8414)
- ✅ Token endpoint for code exchange

**Testing:**
- ✅ 304 unit and integration tests
- ✅ E2E testing infrastructure
- ✅ Smoke tests for deployment verification
- ✅ Mock OAuth server for testing

**Deployment:**
- ✅ Production: https://second-brain-mcp.nick-01a.workers.dev
- ✅ GitHub Actions workflows (test, deploy, rollback)
- ✅ Automated smoke tests post-deployment

### Documentation

See `/specs` directory for complete technical documentation:
- [Architecture](./specs/architecture.md) - System design
- [API Reference](./specs/api-reference.md) - Tool specifications
- [Security](./specs/security.md) - Auth and authorization
- [Deployment](./specs/deployment.md) - Setup procedures
- [Testing](./specs/testing.md) - Test strategy

---

## Current Work

### Phase 12: OAuth Token Exchange Debugging (URGENT - Now)

**Objective:** Fix "Invalid authorization" error when Claude exchanges authorization code for access token

**Problem Analysis:**

From error URL: `claude.ai/api/mcp/auth_callback?code=8t4f5voansmgj5w67s&state=eha3oqqwu28mgj5w2xa`

**What Works:**
1. ✅ GitHub OAuth (user authenticates successfully)
2. ✅ Our /oauth/callback generates MCP authorization code
3. ✅ Redirect back to Claude with code and state

**What Fails:**
4. ❌ Claude calls /oauth/token to exchange code for token
5. ❌ Gets "Invalid authorization" error

**Testing Gap Identified:**

Our test suite has **CRITICAL GAPS** in OAuth testing:

1. **`test-mcp-with-oauth.ts`** - WRONG FLOW
   - Line 120: Exchanges code directly with GitHub (not our server!)
   - Line 253: Uses GitHub token with our MCP server
   - **Should:** Exchange MCP code with OUR /oauth/token endpoint

2. **`test/e2e/full-flow.e2e.ts`** - INCOMPLETE
   - Skips from OAuth discovery to using pre-existing token
   - No test of authorization code exchange
   - No test of complete OAuth flow

3. **NO TEST COVERS:**
   - /oauth/authorize → /oauth/callback → /oauth/token → authenticated request
   - The actual flow Claude uses

**Tasks:**

#### 12.1 Reproduce the Issue

- [x] Test /oauth/token endpoint directly ✅ (works with invalid code)
- [ ] Simulate complete OAuth flow from Claude's perspective
- [ ] Capture detailed logs during OAuth attempt
- [ ] Identify where the flow breaks

Possible Issues:
- Authorization code expiring too fast (5min TTL in src/oauth-handler.ts:168)
- Code format not recognized by Claude
- State parameter mismatch
- Missing required OAuth response fields
- Scope mismatch (mcp:read mcp:write vs read:user)

#### 12.2 Fix test-mcp-with-oauth.ts

**Current (WRONG):**
```typescript
// Exchanges code directly with GitHub
const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
  body: JSON.stringify({
    client_id: GITHUB_CLIENT_ID_LOCAL,
    code, // GitHub code
  }),
});

// Uses GitHub token with our server
const mcpResponse = await fetch(`${SERVER_URL}/mcp`, {
  headers: { 'Authorization': `Bearer ${tokenData.access_token}` }, // GitHub token!
});
```

**Should Be:**
```typescript
// 1. Start local callback server
// 2. Open /oauth/authorize in browser (gets redirect_uri)
// 3. User authenticates with GitHub
// 4. Capture authorization code from OUR callback
// 5. Exchange OUR code with OUR /oauth/token endpoint
// 6. Use OUR MCP token with /mcp endpoint
```

**Updated Flow:**
1. Start localhost:3000 callback server
2. Visit our /oauth/authorize?redirect_uri=http://localhost:3000/callback
3. Redirected to GitHub
4. GitHub redirects to our /oauth/callback
5. Our callback verifies GitHub user, generates MCP auth code
6. Redirects to http://localhost:3000/callback?code=MCP_CODE&state=STATE
7. Localhost server receives MCP code
8. **Exchange MCP code with our /oauth/token endpoint**
9. Get MCP access token
10. Use MCP token for /mcp requests

#### 12.3 Add E2E Test for Complete OAuth Flow

**New Test:** `test/e2e/full-oauth-flow.e2e.ts`

```typescript
describe('E2E: Complete OAuth Flow', () => {
  it('exchanges MCP authorization code for MCP access token', async () => {
    // 1. Start callback server on localhost
    const server = startCallbackServer(3000);

    // 2. Open OAuth URL with localhost redirect_uri
    const authUrl = `${SERVER_URL}/oauth/authorize?redirect_uri=http://localhost:3000/callback`;
    // Browser opens, user authenticates with GitHub

    // 3. Capture MCP authorization code from callback
    const { code, state } = await server.waitForCallback();

    // 4. Exchange MCP code for MCP token (THIS IS WHAT CLAUDE DOES)
    const tokenResponse = await fetch(`${SERVER_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=authorization_code&code=${code}`,
    });

    expect(tokenResponse.status).toBe(200);
    const tokens = await tokenResponse.json();
    expect(tokens.access_token).toBeDefined();
    expect(tokens.token_type).toBe('bearer');
    expect(tokens.scope).toBe('mcp:read mcp:write');

    // 5. Use MCP token for authenticated request
    const mcpResponse = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {} },
      }),
    });

    expect(mcpResponse.status).toBe(200);
    const mcpData = await mcpResponse.json();
    expect(mcpData.result.capabilities.tools).toBeDefined();
    expect(Object.keys(mcpData.result.capabilities.tools).length).toBeGreaterThan(0);
  });
});
```

#### 12.4 Debug Token Exchange Endpoint

Check `/oauth/token` endpoint (src/index.ts:108-143):
- [ ] Verify Content-Type parsing (application/x-www-form-urlencoded)
- [ ] Verify grant_type validation
- [ ] Verify code lookup in KV (`mcp:authcode:${code}`)
- [ ] Check code expiration (5min TTL)
- [ ] Verify response format matches OAuth 2.1 spec
- [ ] Add detailed logging for debugging

#### 12.5 Add Debug Logging ✅

Added comprehensive debug logging to track OAuth flow:

**src/oauth-handler.ts (handleOAuthCallback):**
- Logs GitHub code, state, client redirect URI
- Logs generated MCP auth code and KV key
- Logs code data being stored

**src/oauth-handler.ts (handleTokenExchange):**
- Logs code received and KV key lookup
- Logs whether code data was found
- Logs parsed code data

**src/index.ts (/oauth/token endpoint):**
- Logs request headers
- Logs parsed body, code, and grant type
- Logs token exchange result

All 304 tests passing with debug logging in place.

**Deliverables:**
- [ ] test-mcp-with-oauth.ts updated to test correct flow
- [ ] E2E test added for complete OAuth flow
- [ ] Debug logging added to OAuth endpoints
- [ ] Issue identified and fixed
- [ ] All OAuth tests passing
- [ ] Successfully connects from Claude.ai

**Success Criteria:**
- Claude.ai successfully exchanges authorization code for token
- Complete OAuth flow test passes
- Can connect and use MCP server from Claude.ai

**Status:** 🚧 IN PROGRESS - Debug logging deployed, ready for OAuth flow test

---

## Development Commands

```bash
# Testing
pnpm test                      # Run all tests
pnpm run test:watch            # Watch mode
pnpm run test:coverage         # Coverage report
pnpm run type-check            # TypeScript check

# Development
pnpm run dev                   # Local dev server
pnpm run deploy:dev            # Deploy to development

# Deployment
git push origin main           # Triggers GitHub Actions CI
gh workflow run deploy.yml -f environment=production

# E2E Testing
pnpm run test:e2e:smoke        # Quick smoke tests
pnpm run test:mcp              # Full MCP client test

# OAuth Testing
pnpm run test:mcp:oauth        # Test OAuth flow
```

---

## Risk Management

### Current Risks

**Risk 1: OAuth Flow Complexity**
- **Impact:** CRITICAL (blocks all usage)
- **Probability:** HIGH (currently failing)
- **Mitigation:** Comprehensive E2E testing, detailed logging
- **Status:** Active - debugging in progress

**Risk 2: Test Coverage Gaps**
- **Impact:** HIGH (false confidence in code quality)
- **Probability:** MEDIUM (identified gaps in OAuth testing)
- **Mitigation:** Add E2E tests for complete flows, avoid mocks for critical paths
- **Status:** Addressing in Phase 12

**Risk 3: Authorization Code Expiration**
- **Impact:** MEDIUM (users experience intermittent failures)
- **Probability:** LOW (5min TTL should be sufficient)
- **Mitigation:** Monitor token exchange timing, adjust TTL if needed
- **Status:** Monitoring

---

## Success Criteria

### MVP Definition

**Must Have (Production-Ready):**
- [x] All 5 tools functional
- [x] OAuth authentication implemented
- [x] Rate limiting enforced
- [x] Storage quotas enforced
- [x] Bootstrap on first use
- [x] Automated daily backups
- [x] 95%+ test coverage (95.13% achieved)
- [x] Deployed to production
- [x] Documented
- [ ] **BLOCKER:** Claude.ai can successfully connect

**Acceptance Criteria:**
1. ❌ Claude.ai connector dialog shows "Connected" status (FAILING)
2. ❌ Can execute all tools from Claude.ai (BLOCKED)
3. ❌ Can use all prompts from Claude.ai (BLOCKED)
4. ✅ Rate limits apply correctly
5. ✅ Storage quota checks work
6. ✅ Bootstrap runs on first connection

---

## References

### Key Files for Current Work

- `/src/oauth-handler.ts` - OAuth flow implementation (lines 71-204: callback, 223-259: token exchange)
- `/src/index.ts` - Token endpoint (lines 108-143)
- `/scripts/test-mcp-with-oauth.ts` - OAuth testing script (needs fixing)
- `/test/e2e/full-flow.e2e.ts` - E2E test suite (needs OAuth flow test)

### Documentation

- [specs/security.md](./specs/security.md) - OAuth flow documentation
- [specs/testing.md](./specs/testing.md) - Testing strategy
- [specs/deployment.md](./specs/deployment.md) - Deployment procedures
- [CLAUDE.md](./CLAUDE.md) - Instructions for Claude Code

### External References

- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- [OAuth 2.1 Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07)
- [RFC 8414 - OAuth Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)

---

**Last Updated:** 2025-10-09 - Added comprehensive debug logging to OAuth flow, ready for testing
