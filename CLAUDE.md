# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server for Building a Second Brain (BASB) methodology running on Cloudflare Workers with R2 storage. Enables Claude to act as a personal knowledge management assistant.

**Status:** ✅ Production-ready (v1.2.4 deployed)

**Stack:** Cloudflare Workers, R2, OAuthProvider, Arctic, MCP SDK

**Architecture:** Direct Fetch API handlers (no web framework)

## Critical Non-Negotiables

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

PLAN.md is a living document that you should actively update throughout development:
- Update status after completing each phase/sub-task
- Mark deliverables with checkboxes and completion dates
- Note any blockers or issues that arise
- Update version number and last updated timestamp
- Add new tasks as they emerge during implementation
- Remove obsolete tasks that no longer matter
- Reorganize sections as the project evolves
- **ALWAYS update PLAN.md BEFORE committing** - Include it in the same commit as the code changes

**When to update PLAN.md:**
- After completing any deliverable
- When discovering new work that needs to be done
- When pivoting or changing approach
- After encountering blockers
- Before starting a new phase
- When realizing tasks are no longer needed

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
9. **Deploy via GitHub Actions** - CI/CD pipeline runs automatically on push
10. Manual testing in deployed environment

### Deployment Strategy
**CRITICAL: ALWAYS deploy via GitHub Actions. NEVER use `pnpm deploy` directly.**

Production deployments are triggered by pushing commits to the `main` branch:
```bash
# After committing changes with PLAN.md update
git push origin main

# GitHub Actions will:
# 1. Run all tests
# 2. Run type checking
# 3. Deploy to production automatically
```

The development environment (`pnpm run deploy:dev`) can be used for quick testing, but all production deployments MUST go through GitHub Actions to ensure:
- All tests pass before deployment
- Type checking is successful
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

# Deployment
pnpm run deploy:dev         # Deploy to development (for quick testing only)
# NEVER use 'pnpm deploy' - always deploy via GitHub Actions (git push)

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

```bash
# Test complete OAuth flow
pnpm run test:mcp:oauth

# Interactive OAuth inspector
pnpm run inspect

# E2E tests (includes OAuth)
pnpm run test:e2e
```

**See also:**
- [specs/security.md](specs/security.md) - OAuth architecture details
- [PLAN.md Phase 13](PLAN.md#phase-13-oauth-library-migration-next---urgent) - Migration plan

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
