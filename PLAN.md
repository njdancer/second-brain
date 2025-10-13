# Implementation Plan

**Project:** MCP Server for Building a Second Brain (BASB)
**Status:** 🎉 **PRODUCTION - Claude Integration Working!**
**Version:** v1.2.18 (tagged: `v1.2.18-claude-working`)
**Last Updated:** 2025-10-12

---

## 🎉 MILESTONE: Claude Desktop Integration Working!

**Confirmed Working (Manual Testing in Claude Desktop/Web):**
- ✅ OAuth 2.1 + PKCE flow complete and functional
- ✅ MCP initialize endpoint working
- ✅ **All 5 tools operational in Claude:**
  - `read` - File reading with range support
  - `write` - File creation/overwrite
  - `edit` - String replacement, move, rename, delete
  - `glob` - Pattern-based file search
  - `grep` - Regex content search
- ✅ **Prompts detected in Claude** (assumed functional)
- ✅ Session ID persistence working correctly
- ✅ Tools menu appearing and tools executing successfully

**Reference Tag:** `v1.2.18-claude-working` - Use this as stable reference if future changes break integration

---

## ⚠️ Critical Issue: Testing Infrastructure Inadequate

### The Problem

**We got lucky.** The server works, but our testing didn't catch multiple critical bugs:
1. Session ID mismatch (Worker vs Transport generating different IDs)
2. Race condition in response handling
3. Test script reporting "Session not found" as success

**Current Testing Situation:**

✅ **Unit Tests (278 tests, 85% coverage)** - These work well
- Test individual functions in isolation
- Good coverage of business logic
- Fast, reliable, comprehensive

❌ **Integration/E2E Tests** - Ad-hoc mess:
- `scripts/test-mcp-with-oauth.ts` - Requires browser interaction, times out, reported false positives
- `test/e2e/` - Some smoke tests that don't cover MCP protocol
- `test-session.sh` - Manual bash script
- **None of these reliably test the actual MCP protocol flow that Claude uses**

### Why This is Dangerous

1. **No automated way to verify Claude integration** - Manual testing only
2. **Can't refactor with confidence** - No tests defining correct behavior
3. **Testing boundary is wrong** - We're testing GitHub OAuth when we shouldn't care
4. **False confidence** - Tests pass but server was broken for weeks

---

## 📋 Phase 17: Proper Integration Test Suite (URGENT)

**Goal:** Build comprehensive integration tests around the working implementation **WITHOUT changing the working code**.

### Architecture Boundary

```
┌─────────────────────────────────────────┐
│  Our MCP Server                         │
│  ┌─────────────────┐  ┌──────────────┐ │
│  │ OAuth Provider  │  │ MCP Protocol │ │
│  │ (WE issue       │  │ (tools/      │ │
│  │  tokens)        │  │  prompts)    │ │
│  └────────┬────────┘  └──────────────┘ │
└───────────┼─────────────────────────────┘
            │
            │ ← TEST THIS BOUNDARY
            │    (Mock GitHub, Real MCP Client)
            │
    ┌───────▼────────┐
    │ GitHub OAuth   │ ← DON'T TEST THIS
    │ (External)     │   (Out of our control)
    └────────────────┘
```

### Requirements

1. **Mock GitHub OAuth Server** (for testing only)
   - Accepts OAuth authorize/callback requests
   - Returns predictable user data
   - No browser interaction required
   - Can be started/stopped programmatically

2. **Real MCP Client Library**
   - Supports OAuth 2.1 + PKCE (same as Claude)
   - Can connect to our server
   - Can send initialize, tools/list, tools/call requests
   - Handles session IDs correctly

3. **Integration Test Suite**
   - Start mock GitHub server
   - Start our MCP server (or use deployed dev environment)
   - MCP client initiates connection
   - OAuth flow completes automatically (via mock)
   - Client receives token
   - Client sends initialize, tools/list, tools/call
   - Verify responses match expected schema
   - Test all 5 tools + 3 prompts
   - Test error cases (rate limits, invalid paths, etc.)

### Implementation Plan

**Phase 17.1: Research & Setup** ✅ (Complete)
- [x] Research MCP client libraries (Node.js)
  - Found: `@modelcontextprotocol/sdk` v1.20.0 has `StreamableHTTPClientTransport`
  - Updated to v1.20.0
- [x] Refactor GitHub OAuth to be injectable
  - Created `GitHubOAuthProvider` interface
  - Created `ArcticGitHubOAuthProvider` for production
  - Created `MockGitHubOAuthProvider` for tests
  - Updated oauth-ui-handler to accept injected provider
  - All tests passing (278 tests)
- [x] Create mock GitHub OAuth provider
  - Implemented in `test/mocks/github-oauth-provider-mock.ts`
- [x] Create MCP client helper for tests
  - Implemented in `test/integration/mcp-client-helper.ts`
- [ ] Write integration tests using Miniflare
- [ ] Document how to run integration tests

**Phase 17.2: Core Integration Tests** (3-4 hours)
- [ ] Test: Full OAuth flow (register, authorize, token exchange)
- [ ] Test: MCP initialize (verify capabilities, serverInfo)
- [ ] Test: tools/list (verify all 5 tools present with correct schemas)
- [ ] Test: Each tool individually (read, write, edit, glob, grep)
- [ ] Test: prompts/list and prompts/get

**Phase 17.3: Edge Cases & Error Handling** (2-3 hours)
- [ ] Test: Rate limiting (minute, hour, day windows)
- [ ] Test: Session expiry and cleanup
- [ ] Test: Invalid tool parameters
- [ ] Test: Storage quota limits
- [ ] Test: Concurrent requests

**Phase 17.4: CI/CD Integration** (1-2 hours)
- [ ] Add to GitHub Actions workflow
- [ ] Run before deployment
- [ ] Automatic rollback on failure

### Success Criteria

- ✅ Integration tests run without browser interaction
- ✅ Tests complete in < 30 seconds
- ✅ Zero false positives (if tests pass, Claude integration works)
- ✅ Zero false negatives (if Claude works, tests pass)
- ✅ Can run locally and in CI/CD
- ✅ Covers all tools and prompts
- ✅ Tests the EXACT flow Claude uses

### Principles

1. **Minimal code changes** - The server works, don't break it
2. **Test the boundary** - Mock GitHub, real MCP client
3. **Define correct behavior** - Tests become the specification
4. **Fast feedback** - Tests should run quickly
5. **No manual steps** - Fully automated

---

## Parking Lot (Lower Priority)

### Durable Object Alarm Cleanup (Bug)
**Problem:** Alarms fire continuously every 5 minutes indefinitely, even after sessions are cleaned up.

**Root Cause (`src/mcp-session-do.ts`):**
1. Constructor schedules alarm on every DO instantiation (lines 39-45)
2. `alarm()` unconditionally reschedules itself (line 62)
3. `cleanup()` doesn't cancel alarms (missing `deleteAlarm()`)

**Result:** Zombie alarms for terminated sessions fire forever, polluting logs.

**Fix Required:**
- Only schedule alarms when session is active
- Cancel alarms in `cleanup()` method
- Don't reschedule after session timeout

**Priority:** Low (cosmetic log noise, no functional impact)

### Fix OAuth Test Script Timeout
The current script times out at step 8 (GET request). This is lower priority now that:
- Claude integration is confirmed working
- We'll replace this with proper integration tests

### Additional Monitoring
- Tool execution duration tracking
- Error rate monitoring
- Usage patterns analysis

---

## Current Status

**Deployed:** v1.2.13 (deployed but broken)
**CI/CD:** ✅ Operational (GitHub Actions, ~35s cycle time)
**Test Coverage:** ✅ 278 tests passing, 85.05% function coverage
**Architecture:** Durable Objects for stateful sessions, direct Fetch API handlers
**Release Process:** ✅ Automated release script working

**Recent Deployments:**
- ⚠️ **v1.2.13:** Fixed rate limit double-increment bug, improved test coverage (BUT MCP endpoint still broken)
- ⚠️ **v1.2.12:** Enhanced structured logging (BUT MCP endpoint still broken)
- ⚠️ **v1.2.9-11:** Durable Objects migration (BUT never validated MCP endpoint actually works)

**The Problem:**
We've been deploying code with unit tests passing, but never validated the actual MCP protocol works end-to-end with real clients. The OAuth test script exists to catch this, but it's incomplete.

---

## Phase 16 - Durable Objects Session Management ✅ **COMPLETE**

**Goal:** Fix session persistence by migrating to Cloudflare Durable Objects

**Status:** ✅ Deployed to production as v1.2.9

### Completed Tasks

✅ **All tasks complete** - v1.2.9 deployed successfully
- Created MCPSessionDurableObject class with full session lifecycle management
- Configured wrangler.toml with Durable Objects bindings and migrations
- Updated mcp-api-handler.ts to route all requests to Durable Objects
- Cleaned up mcp-transport.ts (removed in-memory session storage)
- Added comprehensive test suite for Durable Object class
- Created cloudflare:workers mock for testing
- All tests passing (263/263) with 85.33% coverage
- Type checking passing
- Development environment deployed and tested
- Production deployment via GitHub Actions successful

### Implementation Details

**Files Created:**
- `src/mcp-session-do.ts` - Durable Object class with session management
- `test/unit/mcp-session-do.test.ts` - Comprehensive test suite
- `test/mocks/cloudflare-workers.ts` - Mock for testing

**Files Modified:**
- `wrangler.toml` - Added Durable Objects binding and migrations
- `src/index.ts` - Exported Durable Object, updated Env type
- `src/mcp-api-handler.ts` - Routes to Durable Object stubs
- `src/mcp-transport.ts` - Removed global session storage
- `jest.config.js` - Added module mapper for cloudflare:workers

### Results

✅ Sessions persist across Worker instances
✅ 30-minute session timeout with automatic cleanup
✅ Free tier compatible (100k requests/day)
✅ Test coverage increased from 79% to 85.33%
✅ All CI/CD checks passing
✅ Production deployment successful

---

## Future Phases (Parking Lot)

### Phase 17: Storage Quota Warnings (Nice to Have)
Add proactive warnings when approaching storage limits:
- Warning at 80% of quota
- Alert at 90% of quota
- Graceful degradation near limits

### Phase 18: Response Adapter Extraction (Low Priority)
Extract response adapter to separate module for better testability.

### Phase 19: Additional Monitoring (Future)
- Tool execution duration tracking
- Error rate monitoring
- Usage patterns analysis

---

## Key References

**Specs:**
- [Architecture](specs/architecture.md) - System design
- [Implementation](specs/implementation.md) - Module details
- [Security](specs/security.md) - OAuth architecture
- [Testing](specs/testing.md) - Test strategy

**Critical Files:**
- `src/index.ts` - OAuthProvider root handler
- `src/oauth-ui-handler.ts` - GitHub OAuth (Arctic)
- `src/mcp-api-handler.ts` - Authenticated MCP endpoint
- `src/logger.ts` - Structured logging
- `test/setup.ts` - Console suppression for CI

**Git History:**
See commit log for detailed phase completion notes and rationale.

---

## Development Workflow

1. Check PLAN.md for next task
2. Write tests first (TDD)
3. Implement feature
4. Run `pnpm test` (must pass)
5. Run `pnpm run type-check` (must pass)
6. Update PLAN.md status
7. Commit (include PLAN.md update)
8. Push to GitHub (triggers CI/CD)

**Deploy:** Always via GitHub Actions (never `pnpm deploy`)

---

**Note:** This document focuses on upcoming work. For historical details, see git commit history and specs/ directory.
