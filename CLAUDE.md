# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server for Building a Second Brain (BASB) methodology running on Cloudflare Workers with R2 storage. Enables Claude to act as a personal knowledge management assistant.

**Status:** Pre-implementation (specs complete, no source code yet)

**Stack:** Cloudflare Workers, R2, Hono, MCP SDK, GitHub OAuth

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
- Remove or archive obsolete tasks that no longer matter
- Reorganize sections as the project evolves
- **ALWAYS update PLAN.md BEFORE committing** - Include it in the same commit as the code changes

**When to update PLAN.md:**
- After completing any deliverable
- When discovering new work that needs to be done
- When pivoting or changing approach
- After encountering blockers
- Before starting a new phase
- When realizing tasks are no longer needed

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
8. Deploy to dev: `pnpm run deploy:dev`
9. Manual testing in dev environment
10. Only then deploy to prod

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
pnpm run deploy:dev         # Deploy to development (or: mise run deploy:dev)
pnpm deploy                 # Deploy to production (or: mise run deploy)

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

## Project Structure

```
src/
├── index.ts              # Hono app entry point
├── oauth-handler.ts      # GitHub OAuth flow
├── mcp-server.ts         # MCP protocol + tool/prompt registration
├── storage.ts            # R2 wrapper with quotas
├── rate-limiting.ts      # KV-based rate limiting
├── bootstrap.ts          # Initial PARA structure
├── backup.ts             # Daily R2→S3 sync
├── monitoring.ts         # Analytics Engine
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
