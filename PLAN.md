# Implementation Plan

**Project:** MCP Server for Building a Second Brain (BASB)
**Status:** ✅ Production Ready - v1.2.8 Deployed
**Version:** v1.2.8
**Last Updated:** 2025-10-11

---

## Current Status

**Deployed:** ✅ v1.2.8 in production (MCP method handling fixed)
**CI/CD:** ✅ Operational (GitHub Actions, ~35s cycle time)
**Test Coverage:** ✅ 258 tests passing, 79% coverage
**Architecture:** Direct Fetch API handlers, no frameworks
**Release Process:** ✅ Automated release script working perfectly

**Recent Completions:**
- ✅ **v1.2.8:** Fixed critical MCP method handling bug
  - Removed incorrect POST-only restriction from v1.2.7
  - Only parse JSON body for POST requests
  - GET (SSE streaming) and DELETE (termination) now work correctly
  - Deployed successfully via GitHub Actions
- ✅ **v1.2.6:** Added /health endpoint for deployment verification
- 🔴 **v1.2.7:** Was broken (rejected GET requests) - now fixed in v1.2.8

**Known Issue:**
- 🔴 **Session persistence broken**: In-memory session storage doesn't work across stateless Worker instances
- GET requests with session IDs fail because sessions stored in one Worker aren't accessible in others
- Requires Durable Objects for proper stateful session management

---

## Phase 16 - Durable Objects Session Management (NEXT)

**Goal:** Fix session persistence by migrating to Cloudflare Durable Objects

**Why:** Cloudflare Workers are stateless. Each request can go to a different Worker instance, so in-memory `Map<sessionId, transport>` doesn't persist. The MCP `StreamableHTTPServerTransport` requires stateful sessions for SSE streaming and request continuity.

**Prerequisites:**
- [ ] Upgrade Cloudflare account to Workers Paid ($5/month)
- [ ] This enables Durable Objects across all projects (account-wide)

### Tasks

1. **Update wrangler.toml configuration:**
   - Add Durable Objects binding
   - Configure `MCP_SESSIONS` namespace
   - Update migrations if needed

2. **Create Durable Object class** (`src/mcp-session-do.ts`):
   - Implement `MCPSessionDurableObject` extends `DurableObject`
   - Hold `StreamableHTTPServerTransport` and `Server` instances
   - Implement `fetch()` method to handle MCP requests
   - Handle initialize, GET (SSE), POST (JSON-RPC), DELETE (terminate)
   - Implement session timeout/cleanup logic

3. **Update MCP API handler** (`src/mcp-api-handler.ts`):
   - Remove in-memory session Map
   - Extract session ID from header or generate for initialize
   - Get Durable Object stub: `env.MCP_SESSIONS.idFromName(sessionId)`
   - Forward entire request to Durable Object
   - Simplify to pure routing layer

4. **Refactor MCP transport** (`src/mcp-transport.ts`):
   - Move `getOrCreateTransport` logic into Durable Object
   - Keep `createMCPServerInstance` for Durable Object to use
   - Remove global session storage

5. **Update Env type** (`src/index.ts`):
   - Add `MCP_SESSIONS: DurableObjectNamespace` to Env interface

6. **Testing:**
   - Test initialize creates new Durable Object
   - Test GET with session ID routes to existing Durable Object
   - Test POST with session ID works across multiple requests
   - Test DELETE terminates session
   - Test session isolation (different sessions don't interfere)

7. **Local development:**
   - Update `wrangler dev` to support Durable Objects
   - Test with `pnpm run dev`

8. **Deployment:**
   - Deploy to development first: `pnpm run deploy:dev`
   - Verify sessions persist across requests
   - Deploy to production: `pnpm run release`

**Files to create:**
- `src/mcp-session-do.ts` - New Durable Object class

**Files to modify:**
- `wrangler.toml` - Add Durable Objects binding
- `src/index.ts` - Export Durable Object, update Env type
- `src/mcp-api-handler.ts` - Route to Durable Objects
- `src/mcp-transport.ts` - Remove global session storage

**Testing strategy:**
- Unit tests for Durable Object (mock Durable Object environment)
- Integration tests for session persistence
- E2E tests with actual Durable Objects in dev

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
