# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server for Building a Second Brain (BASB) methodology running on Cloudflare Workers with R2 storage. Enables Claude to act as a personal knowledge management assistant.

**Status:** ❌ BROKEN - MCP initialize endpoint not working (see PLAN.md)

**THE ONLY GOAL:** Get MCP server working in Claude desktop/web

**Stack:** Cloudflare Workers, R2, OAuthProvider, Arctic, MCP SDK

**Architecture:** Direct Fetch API handlers (no web framework)

## Critical Non-Negotiables

### The Prime Directive: End-to-End Validation
**NEVER claim the MCP server works without running the full OAuth test script successfully.**

**The OAuth test script (`scripts/test-mcp-with-oauth.ts`) is THE validation tool:**
- It simulates the EXACT flow Claude desktop/web uses
- It validates OAuth 2.1 + PKCE works correctly
- It validates MCP initialize, tools/list, and tool execution
- **Unit tests passing DOES NOT mean the server works**
- **Deployment succeeding DOES NOT mean the server works**
- **ONLY the OAuth test script passing means the server works**

**Before ANY deployment or claim of "working":**
```bash
# 1. Run the full OAuth test script
pnpm run test:mcp:oauth

# 2. It must complete ALL steps successfully:
#    ✅ Client registration
#    ✅ PKCE challenge generation
#    ✅ Browser OAuth flow
#    ✅ Token exchange
#    ✅ Token saving to .env.test
#    ✅ MCP initialize request
#    ✅ Session ID received
#    ✅ Subsequent requests with session ID
#    ✅ Tool calls working

# 3. If ANY step fails, the server is BROKEN
# 4. Update PLAN.md to reflect broken state
# 5. DO NOT deploy until fixed
```

**Current State of Test Script:**
- ⚠️ Token saving is NOT implemented (line 296-297 has TODO)
- ⚠️ Script shows "Unexpected end of JSON input" on initialize
- ⚠️ This means server is BROKEN and needs fixing

**When fixing the test script:**
- Implement token saving to `.env.test` file
- Test that all steps complete successfully
- Only then can you test the actual MCP endpoint
- Document any failures in PLAN.md

### Package Manager
**MUST use `pnpm` exclusively.** Never use `npm` or `yarn`. The project uses `"packageManager": "pnpm@9.0.0"` in package.json for corepack.

### Git Commits
**MUST commit after every atomic change.** Do not batch multiple features or changes into one commit.
- Commit after completing each test file
- Commit after implementing each module
- Commit after each bug fix
- Use conventional commit messages: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`
- Keep commits small and focused

### Task Management via PLAN.md
**MUST use PLAN.md as the single source of truth for task tracking.** Do NOT use TodoWrite or other task management tools.

**PLAN.md is a LEAN, FORWARD-LOOKING planning document:**
- Focus on UPCOMING work (next 1-2 phases max)
- Keep historical detail MINIMAL (git history is the archive)
- Add detail ITERATIVELY as work approaches
- Remove completed phases once their context is no longer needed
- Target length: ~200 lines max

**What to include:**
- ✅ Current phase status and immediate next steps
- ✅ Upcoming phase overview (high-level only)
- ✅ Relevant context for upcoming tasks
- ✅ Active blockers or decisions needed
- ❌ Detailed completion notes for finished phases
- ❌ Comprehensive historical logs
- ❌ Information better suited for specs/ directory

**When to update PLAN.md:**
- After completing a phase: Archive detail, add next phase
- When discovering new work: Add to upcoming tasks
- When pivoting: Update current phase plan
- **ALWAYS update BEFORE committing** - Include in the same commit

**Keep it lean:** If PLAN.md exceeds ~300 lines, archive completed work to git history.

### Dead Code Management
**MUST delete dead code, never archive it.** Git history is the archive.
- Delete unused files immediately when they become obsolete
- Do NOT create `archive/` directories or rename files with version suffixes
- Do NOT keep commented-out code "just in case"
- Use `git log` and `git show` to recover deleted code if needed
- Trust git history - it's designed for this purpose

### Testing Requirements
- **95%+ code coverage** required (configured in jest.config.js)
- 100% coverage for all tools, OAuth, rate limiting, storage, bootstrap, backup
- Write tests BEFORE implementation (TDD)
- All tests must pass before deploying

### Development Workflow
1. **Check PLAN.md** - Review current phase and next task
2. Write tests first (TDD)
3. Implement feature
4. Run `pnpm test` - must pass
5. Run `pnpm run type-check` - must pass
6. **Update PLAN.md** - Mark task complete, update status
7. **Commit the change** - Include both code and PLAN.md update
8. **Push to GitHub** - `git push origin main`
9. Manual testing in development environment

### Release & Deployment Strategy
**CRITICAL: ALWAYS deploy via GitHub Actions using the release process. NEVER use `pnpm deploy` directly.**

Production deployments are triggered by git tags, not by regular commits. Use the release script:

```bash
# Release process (creates version bump, changelog, git tag in one operation)
pnpm run release        # Patch version (1.2.3 -> 1.2.4)
pnpm run release:minor  # Minor version (1.2.3 -> 1.3.0)
pnpm run release:major  # Major version (1.2.3 -> 2.0.0)

# The script will:
# 1. Run all tests and type checking
# 2. Update version in package.json, PLAN.md
# 3. Update CHANGELOG.md (opens editor for release notes)
# 4. Commit changes with tag
# 5. Prompt you to push: git push origin main --tags

# Push to deploy
git push origin main --tags

# GitHub Actions will:
# 1. Run all tests
# 2. Run type checking
# 3. Deploy to production automatically
# 4. Create GitHub release
```

The development environment (`pnpm run deploy:dev`) can be used for quick testing, but all production deployments MUST go through GitHub Actions to ensure:
- All tests pass before deployment
- Type checking is successful
- Version is properly tracked across all files
- Deployment is tracked in CI/CD history
- Rollback is possible via GitHub

## Essential Commands

```bash
# Setup
mise run setup              # Enable corepack (first time only)
pnpm install                # Install dependencies

# Development
pnpm test                   # Run tests (or: mise run test)
pnpm run test:watch         # Watch mode
pnpm run test:coverage      # Coverage report
pnpm run type-check         # TypeScript check (or: mise run build)
pnpm run dev                # Local dev server (or: mise run dev)

# Release & Deployment
pnpm run release            # Create release (patch: 1.2.3 -> 1.2.4)
pnpm run release:minor      # Minor release (1.2.3 -> 1.3.0)
pnpm run release:major      # Major release (1.2.3 -> 2.0.0)
git push origin main --tags # Deploy release to production
pnpm run deploy:dev         # Deploy to development (for quick testing only)

# Running single test
pnpm test -- path/to/test.test.ts
pnpm test -- --testNamePattern="test name"
```

## Code Requirements

### TypeScript
- Strict mode (configured)
- Async/await only (no raw promises)
- Explicit return types on public functions
- Zod schemas for all tool parameter validation

### Security
- All paths validated (no `..`, null bytes, control chars)
- All file sizes checked before operations
- Rate limits: 100/min, 1000/hr, 10000/day
- Storage quotas: 10GB total, 10k files, 10MB per file

### Error Handling
- User-facing: Generic messages, proper HTTP status codes
- Internal: Detailed context, no PII in logs

### Naming
- PascalCase: Classes, interfaces, types
- camelCase: Functions, variables
- SCREAMING_SNAKE_CASE: Constants
- kebab-case: File names

## Finding Information

**Start with specs when implementing anything:**
- Architecture & design → [specs/architecture.md](specs/architecture.md)
- Tool specifications → [specs/api-reference.md](specs/api-reference.md)
- Implementation details → [specs/implementation.md](specs/implementation.md)
- Test strategy → [specs/testing.md](specs/testing.md)
- Deployment procedures → [specs/deployment.md](specs/deployment.md)
- Complete implementation plan → [PLAN.md](PLAN.md)

All spec files are in [specs/](specs/) directory. Read them before implementing features.

**When writing or updating specifications:**
- Use the `/write-spec` slash command for guidance
- Follow the [spec guidelines](docs/spec-guidelines.md) for consistency
- Always update `specs/index.md` when creating/modifying specs

## OAuth Architecture (CRITICAL)

**This project has a DUAL OAuth role architecture that is easy to misunderstand.**

### Two Separate OAuth Flows

**Flow 1: OAuth SERVER (We Issue Tokens)**
- MCP clients (Claude.ai, MCP Inspector) authenticate WITH US
- We are the OAuth 2.1 authorization server
- We issue MCP access tokens to clients
- **Includes PKCE** (OAuth 2.1 requirement for public clients)
- **Implementation:** `@cloudflare/workers-oauth-provider` v0.0.11
- **Status:** ✅ Production-ready (Phase 13A complete)

**Flow 2: OAuth CLIENT (We Consume Tokens)**
- We authenticate users WITH GitHub
- GitHub is the authorization server
- We use GitHub tokens to verify user identity
- For authorization check only (user ID against allowlist)
- **Implementation:** Arctic v3.7.0 (supports 50+ OAuth providers)
- **Status:** ✅ Production-ready (Phase 13B complete)

### Key Files

`/src/index.ts` - **OAuthProvider Configuration**
- Exports OAuthProvider instance (root handler)
- Configures OAuth SERVER endpoints (`/authorize`, `/token`, `/register`)
- Routes `/mcp` to authenticated API handler
- Routes default to GitHub OAuth UI handler
- All OAuth SERVER logic handled by `@cloudflare/workers-oauth-provider`

`/src/oauth-ui-handler.ts` - **GitHub OAuth CLIENT**
- GitHub authentication flow using Arctic library
- Direct Fetch API handler (no framework)
- `/authorize` - Parse MCP request, redirect to GitHub
- `/callback` - Exchange code, verify user, complete MCP OAuth
- User allowlist check (`GITHUB_ALLOWED_USER_ID`)
- State management (encodes MCP OAuth request)

`/src/mcp-api-handler.ts` - **Authenticated MCP Endpoint**
- Handles `/mcp` requests after OAuthProvider validates token
- Direct Fetch API handler (no framework)
- Props extraction from OAuthProvider context
- Rate limiting enforcement
- MCP transport initialization and request routing
- Session management

`/src/mcp-transport.ts` - **MCP Protocol Implementation**
- Tool and prompt registration
- StreamableHTTPServerTransport adapter for Workers
- Handles MCP JSON-RPC requests

`/src/logger.ts` - **Structured Logging (NEW)**
- JSON-formatted logs for Cloudflare Workers Logs
- Request correlation with UUID requestId
- Log levels: DEBUG, INFO, WARN, ERROR
- Context propagation (userId, requestId, tool, etc.)

### Common Pitfalls

❌ **DON'T:**
- Confuse MCP tokens (we issue) with GitHub tokens (GitHub issues)
- Think Arctic handles OAuth SERVER (it's OAuth CLIENT only)
- Manually implement OAuth logic (both libraries handle it automatically)
- Return GitHub tokens to MCP clients (security boundary violation)
- Mock OAuthProvider or Arctic in tests (let libraries handle OAuth internally)
- Add framework dependencies like Hono (we use direct Fetch API)
- Use unstructured console.log (use Logger class for structured logging)
- Keep dead code commented out (delete it, use git history)

✅ **DO:**
- Understand we have TWO OAuth roles (server AND client)
- Trust library implementations for PKCE, token management, security
- Check specs/security.md for OAuth architecture overview
- Test OAuth changes with `pnpm run test:mcp:oauth`
- Use structured logging (Logger class) for all new code
- Include requestId in all logs for request correlation
- Delete dead code instead of commenting it out (use git history)
- Use direct Fetch API handlers (Request/Response) instead of frameworks

### Testing OAuth

**CRITICAL: The OAuth test script is NOT optional. It is THE validation tool.**

```bash
# REQUIRED: Full OAuth flow test (simulates Claude desktop/web)
pnpm run test:mcp:oauth
# Must complete ALL 9 steps successfully:
# 1. Client registration
# 2. PKCE challenge generation
# 3. Local callback server
# 4. OAuth URL generation
# 5. Browser authentication
# 6. OAuth callback handling
# 7. MCP initialize request
# 8. GET /mcp with session ID
# 9. Subsequent POST with session ID

# Quick test (uses saved token from .env.test)
pnpm run test:mcp:quick
# Only works if OAuth test has saved token successfully

# Interactive OAuth inspector (for manual testing)
pnpm run inspect

# Unit tests (NOT sufficient for validation)
pnpm test
```

**Validation Requirements:**
1. Run `pnpm run test:mcp:oauth` after ANY change to:
   - OAuth code (index.ts, oauth-ui-handler.ts)
   - MCP endpoint code (mcp-api-handler.ts, mcp-session-do.ts)
   - Transport code (mcp-transport.ts)
2. If script fails at ANY step, server is BROKEN
3. Update PLAN.md immediately with broken state
4. Do NOT deploy until script passes completely

**See also:**
- [specs/security.md](specs/security.md) - OAuth architecture details
- [scripts/test-mcp-with-oauth.ts](scripts/test-mcp-with-oauth.ts) - Test implementation

## Project Structure

```
src/
├── index.ts              # OAuthProvider root handler (OAuth SERVER)
├── oauth-ui-handler.ts   # GitHub OAuth CLIENT (Arctic, direct Fetch API)
├── mcp-api-handler.ts    # Authenticated MCP endpoint (direct Fetch API)
├── mcp-transport.ts      # MCP protocol + tool/prompt registration
├── logger.ts             # Structured JSON logging (NEW)
├── monitoring.ts         # Analytics Engine integration
├── storage.ts            # R2 wrapper with quotas
├── rate-limiting.ts      # KV-based rate limiting
├── bootstrap.ts          # Initial PARA structure
├── backup.ts             # Daily R2→S3 sync
└── tools/                # Tool implementations (read, write, edit, glob, grep)

test/
├── unit/                 # Mirrors src/ structure
├── integration/          # End-to-end tests
├── fixtures/             # Test data
└── mocks/                # R2, KV, GitHub mocks
```

## When Stuck

1. Check relevant spec file in [specs/](specs/)
2. Check [PLAN.md](PLAN.md) for implementation details
3. Look at test requirements in [specs/testing.md](specs/testing.md)
4. For deployment issues: [specs/deployment.md](specs/deployment.md)
5. For architecture questions: [specs/architecture.md](specs/architecture.md)
