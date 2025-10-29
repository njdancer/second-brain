# Implementation Plan

**Project:** MCP Server for Building a Second Brain (BASB)
**Status:** 🎉 **PRODUCTION - Claude Integration Working!**
**Last Updated:** 2025-10-29

**Recent Changes:**
- ✅ Fixed production deployment version calculation (Issue #24, PR #25)
- ✅ Implemented MCP Resources (Phase 19.1) - all documents exposed as resources
- ✅ All major implementation phases complete (Phases 16-19)

---

## System Status

**Production:** ✅ Working (v25.1.0)
- OAuth 2.1 + PKCE flow operational
- All 5 tools working: read, write, edit, glob, grep
- Resources exposed and accessible via file:/// URIs
- Prompts detected in Claude (capture-note, weekly-review, research-summary)
- Session persistence via Durable Objects

**CI/CD:** ✅ Operational
- Development: Auto-deploys on main commits
- Production: Manual trigger via GitHub Actions
- Version: Auto-determined from git tags (YEAR.RELEASE.HOTFIX format)
- Tags created after successful deployment
- Automatic rollback on health check failure
- Hotfix workflow operational

**Tests:** ✅ Passing
- 325 tests total, 85% coverage
- Unit tests: Comprehensive coverage of all modules
- E2E tests: 9 automated tests validating full OAuth + MCP flow
- Integration tests: Tool sequences and behavior verification

**Reference Tag:** `v1.2.18-claude-working` - Use this as stable reference if future changes break integration

---

## Current Phase: Maintenance & Minor Issues

**Goal:** Address low-priority bugs and future enhancements as needed

**Status:** Monitoring production, no urgent work

### Known Issues (Low Priority)

#### 1. Durable Object Alarm Cleanup
**Problem:** Alarms fire continuously every 5 minutes indefinitely, even after sessions are cleaned up.

**Impact:** Low - cosmetic log noise only, no functional impact

**Root Cause:** (src/mcp-session-do.ts)
- Constructor schedules alarm on every DO instantiation (lines 39-45)
- `alarm()` unconditionally reschedules itself (line 62)
- `cleanup()` doesn't cancel alarms (missing `deleteAlarm()`)

**Fix Required:**
- Only schedule alarms when session is active
- Cancel alarms in `cleanup()` method
- Don't reschedule after session timeout

**Tasks:**
- [ ] Modify constructor to conditionally schedule alarms
- [ ] Add `deleteAlarm()` call to `cleanup()` method
- [ ] Add flag to prevent rescheduling after timeout
- [ ] Add test coverage for alarm lifecycle
- [ ] Deploy and verify logs are clean

#### 2. OAuth Test Script Timeout
**Problem:** `scripts/test-mcp-with-oauth.ts` times out at browser interaction step

**Impact:** Low - E2E tests now provide automated validation

**Status:** Deprioritized - may remove script entirely since E2E tests cover this

**Options:**
- Remove script (E2E tests are sufficient)
- Fix timeout issues (requires browser automation)
- Keep as manual testing tool (document the timeout)

---

## Parking Lot (Future Work)

### Monitoring Enhancements
When production usage increases:
- Tool execution duration tracking
- Error rate monitoring by tool type
- Usage patterns analysis
- Storage quota warnings at 80%/90%

### Testing Improvements
Optional test coverage expansion:
- Session expiry tests (sessions don't currently expire, so deferred)
- Concurrent request tests (verify race conditions)
- Load testing (understand Durable Object limits)

### Feature Ideas
Not currently planned:
- Export/import functionality for second brain
- Backup to multiple cloud providers
- Collaboration features (shared second brains)
- Mobile app integration
- Advanced search with full-text indexing

---

## Completed Major Phases

All implementation complete. See git history for detailed phase information:

- **Phase 16:** Durable Objects session management ✅
- **Phase 17:** E2E integration test suite ✅
- **Phase 18:** CI/CD pipeline compliance ✅
  - 18.1: Critical fixes (deployment flow, version tracking)
  - 18.2: High priority features (hotfix workflow, rollback, feature flags)
  - 18.3: Medium priority improvements (parallel CI, linting)
- **Phase 19.1:** MCP Resources implementation ✅

For implementation details, see:
- Git commit history: `git log --oneline --since="2025-10-01"`
- Specs directory: `specs/` (architecture, security, testing, deployment)
- Code reviews: Pull request history on GitHub

---

## Key References

**Critical Files:**
- `src/index.ts` - OAuthProvider root handler, Durable Object export
- `src/oauth-ui-handler.ts` - GitHub OAuth client (Arctic)
- `src/mcp-api-handler.ts` - Authenticated MCP endpoint
- `src/mcp-transport.ts` - MCP protocol, tool/prompt/resource registration
- `src/mcp-session-do.ts` - Durable Object session management
- `src/logger.ts` - Structured JSON logging

**Specifications:**
- [Architecture](specs/architecture.md) - System design and component interactions
- [Security](specs/security.md) - OAuth architecture (dual role: server + client)
- [Testing](specs/testing.md) - Test strategy and coverage requirements
- [Deployment](specs/deployment.md) - Infrastructure and release process
- [Tools](specs/tools.md) - Complete specification of all five MCP tools
- [Prompts](specs/prompts.md) - Pre-defined BASB workflow prompts

**Deployment:**
- Development: Auto-deploys on every `main` commit
- Production: `https://github.com/njdancer/second-brain/actions/workflows/deploy-production.yml`
- Rollback: `https://github.com/njdancer/second-brain/actions/workflows/rollback.yml`
- Create Hotfix: `https://github.com/njdancer/second-brain/actions/workflows/create-hotfix.yml`

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

**Deploy:** Always via GitHub Actions (never `pnpm deploy` directly)

**Planning:** See [docs/planning-guidelines.md](docs/planning-guidelines.md) for maintaining this document

---

**Note:** This document focuses on upcoming work. For historical implementation details, see git commit history and specs/ directory.
