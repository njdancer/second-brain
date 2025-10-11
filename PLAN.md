# Implementation Plan

**Project:** MCP Server for Building a Second Brain (BASB)
**Status:** ✅ Production Ready - Phase 14 Complete
**Version:** v1.2.7
**Last Updated:** 2025-10-11

---

## Current Status

**Deployed:** 🔴 v1.2.7 BROKEN - Rejecting valid MCP GET requests
**CI/CD:** ✅ Operational (GitHub Actions, 37s test cycle)
**Test Coverage:** ✅ 258 tests, 79% coverage
**Architecture:** Direct Fetch API handlers, no frameworks
**Release Process:** ✅ Automated release script ready

**CRITICAL ISSUE - v1.2.7:**
Production is broken. The MCP handler incorrectly rejects GET requests with 405 Method Not Allowed.

**What went wrong:**
1. Production logs showed "Unexpected end of JSON input" errors from GET requests
2. Attempted fix in v1.2.7: Added method validation to reject non-POST requests
3. **This was wrong!** The MCP protocol uses:
   - **GET** - for SSE (Server-Sent Events) streaming
   - **POST** - for JSON-RPC messages
   - **DELETE** - for session termination
4. Claude desktop clients send GET requests for SSE streams, now all failing with 405

**Root cause:**
The actual bug was at `src/mcp-api-handler.ts:76` where we call `await request.json()`
unconditionally for ALL request methods. GET requests don't have bodies, causing the parse error.

**Correct fix needed:**
```typescript
// WRONG (current v1.2.7 - deployed):
if (request.method !== 'POST') {
  return new Response(/* 405 error */);
}

// CORRECT (what we need):
// Only parse JSON for POST requests
let body: any = undefined;
if (request.method === 'POST') {
  body = await request.json();
  const isInitialize = isInitializeRequest(body);
  // ... rest of POST-specific logic
}

// Then pass request through to transport.handleRequest()
// The transport knows how to handle GET (SSE), POST (JSON-RPC), DELETE (terminate)
await transport.handleRequest(request as any, nodeResponse as any, body);
```

**Why this matters:**
The `StreamableHTTPServerTransport` from MCP SDK is designed to handle all three methods:
- It has `handleGetRequest()` for SSE streaming
- It has `handlePostRequest()` for JSON-RPC
- It has `handleDeleteRequest()` for termination

We should NOT be filtering methods - we should let the transport handle routing.

**Recent Completions:**
- ✅ **v1.2.5:** Fixed method chaining in nodeResponse mock
- ✅ **v1.2.6:** Added /health endpoint for deployment verification
- 🔴 **v1.2.7:** BROKEN - Incorrectly rejects GET requests (needs immediate rollback/fix)

---

## URGENT: Phase 15A - Fix v1.2.7 MCP Method Handling

**Priority:** CRITICAL - Production is broken

### Tasks

1. **Revert v1.2.7 method validation**
   - Remove the `if (request.method !== 'POST')` check
   - This was the wrong fix

2. **Fix JSON parsing**
   - Only call `await request.json()` for POST requests
   - GET and DELETE don't have request bodies
   - Pass undefined body for non-POST to transport

3. **Update mcp-api-handler.ts logic:**
   ```typescript
   // Parse body only for POST requests
   let body: any = undefined;
   if (request.method === 'POST') {
     body = await request.json();
   }

   // Check initialization only for POST with body
   const isInitialize = body ? isInitializeRequest(body) : false;

   // Get or create transport based on session
   const transport = getOrCreateTransport(sessionId || undefined, isInitialize);

   // Let transport handle all methods (GET/POST/DELETE)
   await transport.handleRequest(request as any, nodeResponse as any, body);
   ```

4. **Test all methods work:**
   - POST with JSON-RPC (tool calls)
   - GET for SSE streaming (session management)
   - DELETE for session termination
   - Unauthenticated requests still blocked by OAuthProvider

5. **Deploy v1.2.8 with proper fix**

**Files to change:**
- `src/mcp-api-handler.ts` - Fix method handling and JSON parsing

**Rollback option:**
If fix takes time, rollback to v1.2.6:
```bash
git checkout v1.2.6
pnpm run deploy  # Manual emergency deployment
# Then fix properly and release v1.2.8
```

---

## Next Up: Phase 15 - Release & Deployment

**Goal:** Deploy v1.2.4 to production and verify functionality

### Tasks

**Release v1.2.4:**
- [ ] Run release script: `pnpm run release` (requires user interaction for CHANGELOG)
- [ ] Push release: `git push origin main --tags`
- [ ] Monitor GitHub Actions deployment
- [ ] Verify deployment successful

**Post-Deployment Verification:**
- [ ] Run E2E smoke tests against production: `pnpm run test:e2e:smoke`
- [ ] Check Cloudflare Logs for structured JSON output
- [ ] Verify OAuth flow works end-to-end
- [ ] Test all tools (read, write, edit, glob, grep)

**Polish (Optional):**
- [ ] Add storage quota warnings (MonitoringService)
- [ ] Review and update any stale documentation
- [ ] Clean up any remaining TODOs in code

**Commands:**
```bash
# Create release
pnpm run release        # Creates v1.2.4, commits, tags

# Deploy
git push origin main --tags  # Triggers GitHub Actions deployment

# Verify
pnpm run test:e2e:smoke     # Smoke tests against production
pnpm wrangler tail --format pretty  # Check logs
```

---

## Future Phases (Parking Lot)

### Phase 16: Storage Quota Warnings (Nice to Have)
Add proactive warnings when approaching storage limits:
- Warning at 80% of quota
- Alert at 90% of quota
- Graceful degradation near limits

### Phase 17: Response Adapter Extraction (Low Priority)
Extract Hono response adapter to separate module for better testability.

### Phase 18: Additional Monitoring (Future)
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
