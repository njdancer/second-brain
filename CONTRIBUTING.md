# Contributing to Second Brain MCP

Thank you for your interest in contributing to Second Brain MCP! This document provides guidelines for development, testing, and submitting contributions.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)
- [Git Commit Guidelines](#git-commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Deployment](#deployment)

---

## Development Setup

### Prerequisites

- **Node.js**: Version 20+ required
- **pnpm**: Managed via corepack (DO NOT use npm or yarn)
- **Cloudflare Account**: Workers and R2 enabled
- **GitHub Account**: For OAuth testing
- **AWS Account**: For S3 backup testing (optional for development)

### Recommended: Using mise

This project uses [mise](https://mise.jdx.dev/) to manage Node.js and enable pnpm:

```bash
# Install mise (if not already installed)
curl https://mise.run | sh

# Install Node.js 20 and enable corepack
mise install
mise run setup

# Install dependencies
pnpm install
```

### Alternative: Manual Setup

```bash
# Ensure Node.js 20+ is installed
node --version

# Enable corepack for pnpm
corepack enable

# Install dependencies
pnpm install
```

### Environment Configuration

1. **Create development R2 bucket and KV namespaces:**

```bash
wrangler r2 bucket create second-brain-dev
wrangler kv:namespace create OAUTH_KV --env development
wrangler kv:namespace create RATE_LIMIT_KV --env development
```

2. **Configure secrets for development:**

```bash
wrangler secret put GITHUB_CLIENT_ID --env development
wrangler secret put GITHUB_CLIENT_SECRET --env development
wrangler secret put COOKIE_ENCRYPTION_KEY --env development
wrangler secret put GITHUB_ALLOWED_USER_ID --env development
```

3. **Update wrangler.toml with your namespace IDs**

See [Deployment Guide](specs/deployment.md) for detailed setup instructions.

---

## Project Structure

```
second-brain/
├── src/                    # Source code
│   ├── index.ts           # Hono app entry point
│   ├── oauth-handler.ts   # GitHub OAuth flow
│   ├── mcp-server.ts      # MCP protocol implementation
│   ├── storage.ts         # R2 wrapper with quotas
│   ├── rate-limiting.ts   # KV-based rate limiting
│   ├── bootstrap.ts       # Initial PARA structure
│   ├── backup.ts          # Daily R2→S3 sync
│   ├── monitoring.ts      # Analytics Engine
│   └── tools/             # Tool implementations
│       ├── read.ts        # Read tool
│       ├── write.ts       # Write tool
│       ├── edit.ts        # Edit tool
│       ├── glob.ts        # Glob tool
│       └── grep.ts        # Grep tool
├── test/                  # Tests
│   ├── unit/             # Unit tests (mirrors src/)
│   ├── integration/      # End-to-end tests
│   ├── fixtures/         # Test data
│   └── mocks/            # R2, KV, GitHub mocks
├── specs/                # Specification documents
└── .mise.toml           # mise configuration (Node.js, tasks)
```

See [Implementation Guide](specs/implementation.md) for detailed architecture.

---

## Development Workflow

### Critical Non-Negotiables

1. **MUST use pnpm exclusively** - Never use npm or yarn
2. **MUST commit after every atomic change** - Don't batch multiple features
3. **MUST update PLAN.md before committing** - Include it in the same commit
4. **MUST achieve 95%+ test coverage** - All tests pass before deploying
5. **MUST follow TDD** - Write tests before implementation

### Standard Development Cycle

```bash
# 1. Check PLAN.md for current phase and next task
# 2. Create feature branch
git checkout -b feat/your-feature

# 3. Write tests first (TDD)
# Create test file in test/unit/ or test/integration/

# 4. Run tests in watch mode while developing
pnpm run test:watch

# 5. Implement feature
# Edit files in src/

# 6. Verify all tests pass
pnpm test

# 7. Type check
pnpm run type-check

# 8. Update PLAN.md
# Mark task complete, update status, note any blockers

# 9. Commit (include both code and PLAN.md)
git add .
git commit -m "feat: your feature description"

# 10. Deploy to dev environment for testing
pnpm run deploy:dev

# 11. Manual testing in dev environment
# Test the feature in actual Claude client

# 12. Push and create PR
git push origin feat/your-feature
```

### mise Task Shortcuts

```bash
mise run setup      # Enable corepack (first time only)
mise run dev        # Start local dev server
mise run test       # Run tests
mise run build      # Run type checking
mise run deploy     # Deploy to production
mise run deploy:dev # Deploy to development
```

---

## Code Standards

### TypeScript

- **Strict mode enabled** - All types must be explicit
- **Async/await only** - No raw promises
- **Explicit return types** on all public functions
- **Zod schemas** for all tool parameter validation
- **Comprehensive JSDoc** comments on public APIs

**Example:**

```typescript
/**
 * Reads a file from R2 storage with optional line range.
 *
 * @param path - File path relative to user's root
 * @param range - Optional [start, end] line range (1-indexed)
 * @returns File content or null if not found
 * @throws {ValidationError} If path is invalid
 * @throws {StorageError} If R2 operation fails
 */
export async function readFile(
  path: string,
  range?: [number, number]
): Promise<string | null> {
  // Implementation
}
```

### Naming Conventions

- **PascalCase**: Classes, interfaces, types
- **camelCase**: Functions, variables
- **SCREAMING_SNAKE_CASE**: Constants
- **kebab-case**: File names

### File Organization

```typescript
// 1. Imports
import { Hono } from 'hono';
import type { Env } from './types';

// 2. Type definitions
interface MyParams {
  path: string;
}

// 3. Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 4. Main implementation
export class MyClass {
  // ...
}

// 5. Helper functions (unexported)
function helperFunction() {
  // ...
}
```

### Error Handling

**User-facing errors** - Generic messages, proper HTTP status codes:

```typescript
try {
  await storage.putObject(path, content);
} catch (error) {
  console.error('Storage error:', error); // Detailed internally
  return new Response('Failed to save file', { status: 500 }); // Generic to user
}
```

**Error logging** - Detailed context, no PII:

```typescript
console.error('Tool call failed', {
  tool: 'write',
  path: path, // OK - user's own data
  userId: hashUserId(userId), // Anonymized
  error: error.message,
  stack: error.stack
});
```

### Security

**Input validation:**

```typescript
import { z } from 'zod';

const writeSchema = z.object({
  path: z.string()
    .min(1)
    .refine(validatePath, 'Invalid path'), // No .., null bytes, control chars
  content: z.string()
    .max(1024 * 1024, 'Content too large') // 1MB limit
});
```

**Path validation:**

```typescript
function validatePath(path: string): boolean {
  // No directory traversal
  if (path.includes('..')) return false;

  // No null bytes or control characters
  if (/[\x00-\x1f]/.test(path)) return false;

  // Must be relative (no leading slash)
  if (path.startsWith('/')) return false;

  return true;
}
```

---

## Testing Requirements

### Coverage Targets

- **95%+ statement coverage** (REQUIRED)
- **95%+ function coverage** (REQUIRED)
- **85%+ branch coverage** (target)

```bash
# Run tests with coverage
pnpm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.html
```

### Test-Driven Development (TDD)

**Always write tests BEFORE implementation:**

1. Write failing test
2. Implement minimum code to pass
3. Refactor while keeping tests green
4. Repeat

### Unit Tests

**Location:** `test/unit/` (mirrors `src/` structure)

**Example structure:**

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { readFile } from '../../src/tools/read';
import { createMockR2Bucket } from '../mocks/r2';

describe('read tool', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockBucket = createMockR2Bucket();
  });

  describe('readFile', () => {
    it('should read entire file', async () => {
      // Arrange
      await mockBucket.put('test.md', 'Hello\nWorld');

      // Act
      const result = await readFile('test.md');

      // Assert
      expect(result).toBe('Hello\nWorld');
    });

    it('should return null for missing file', async () => {
      const result = await readFile('missing.md');
      expect(result).toBeNull();
    });

    it('should handle invalid path', async () => {
      await expect(readFile('../etc/passwd'))
        .rejects.toThrow('Invalid path');
    });
  });
});
```

### Integration Tests

**Location:** `test/integration/`

**Test complete workflows:**

```typescript
describe('File lifecycle workflow', () => {
  it('should create, read, edit, and delete file', async () => {
    // Create
    await writeFile('test.md', 'Initial content');

    // Read
    const content = await readFile('test.md');
    expect(content).toBe('Initial content');

    // Edit
    await editFile('test.md', {
      old_str: 'Initial',
      new_str: 'Updated'
    });

    // Verify edit
    const updated = await readFile('test.md');
    expect(updated).toBe('Updated content');

    // Delete
    await editFile('test.md', { delete: true });

    // Verify deletion
    const deleted = await readFile('test.md');
    expect(deleted).toBeNull();
  });
});
```

### Test Data

**Use fixtures for consistent test data:**

```typescript
// test/fixtures/sample-notes.ts
export const sampleNotes = {
  'projects/website/homepage.md': 'Homepage redesign notes...',
  'areas/health/exercise-log.md': 'Daily exercise tracking...',
  'resources/books/atomic-habits.md': 'Book summary...'
};
```

### Mocks

**Mock external dependencies:**

- `test/mocks/r2.ts` - Mock R2Bucket
- `test/mocks/kv.ts` - Mock KVNamespace
- `test/mocks/github.ts` - Mock GitHub OAuth

See [Testing Guide](specs/testing.md) for comprehensive testing strategy.

---

## Git Commit Guidelines

### Commit Frequency

**MUST commit after every atomic change:**

- After completing each test file
- After implementing each module
- After each bug fix
- After updating documentation

**DO NOT batch multiple features into one commit.**

### Conventional Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat:` - New feature
- `fix:` - Bug fix
- `test:` - Adding or updating tests
- `docs:` - Documentation changes
- `refactor:` - Code refactoring (no behavior change)
- `perf:` - Performance improvements
- `chore:` - Maintenance tasks
- `ci:` - CI/CD changes

**Examples:**

```bash
# Feature
git commit -m "feat(tools): add grep tool with regex search"

# Bug fix
git commit -m "fix(storage): handle concurrent write conflicts"

# Test
git commit -m "test(oauth): add token validation edge cases"

# Documentation
git commit -m "docs: update deployment guide with AWS setup"

# Refactor
git commit -m "refactor(rate-limit): extract counter logic to helper"
```

### Commit Message Guidelines

- Use imperative mood: "add feature" not "added feature"
- Keep first line under 72 characters
- Capitalize first word
- No period at the end of the subject line
- Reference issues/PRs in footer if applicable

---

## Pull Request Process

### Before Submitting PR

**Checklist:**

- [ ] All tests passing (`pnpm test`)
- [ ] Type checking passes (`pnpm run type-check`)
- [ ] Coverage maintained at 95%+ (`pnpm run test:coverage`)
- [ ] PLAN.md updated with task completion status
- [ ] No console.log statements (use proper logging)
- [ ] No commented-out code
- [ ] All TypeScript errors resolved
- [ ] Manual testing completed in dev environment

### PR Template

```markdown
## Description

Brief description of changes and motivation.

## Changes

- Added X feature
- Fixed Y bug
- Updated Z documentation

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] Coverage maintained (95%+)

## Related Issues

Closes #123
Related to #456

## Deployment Notes

Any special considerations for deployment (secrets, config changes, migrations).
```

### Review Process

1. **Automated checks** - CI runs tests and type checking
2. **Code review** - Maintainer reviews code quality, tests, documentation
3. **Manual testing** - Reviewer tests in dev environment
4. **Approval** - At least one approval required
5. **Merge** - Squash and merge to main

---

## Deployment

### Development Environment

**Deploy to dev for testing:**

```bash
# Deploy to development
pnpm run deploy:dev  # or: mise run deploy:dev

# Test in Claude client
# Configure MCP client to point to dev worker URL
```

### Production Deployment

**Production deploys happen via GitHub Actions:**

```bash
# Create and push a version tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# GitHub Actions will automatically:
# 1. Run all tests
# 2. Build the project
# 3. Deploy to production
# 4. Create GitHub release
```

### Rollback Procedure

If deployment fails or introduces critical bugs:

```bash
# Find previous working version
git tag -l

# Deploy previous version
wrangler deploy --env production --tag v0.9.9
```

See [Deployment Guide](specs/deployment.md) for comprehensive deployment procedures.

---

## Getting Help

### Documentation

Start with the specification documents in [specs/](specs/):

- [Architecture](specs/architecture.md) - System design
- [API Reference](specs/api-reference.md) - Tool specifications
- [Implementation](specs/implementation.md) - Project structure
- [Testing](specs/testing.md) - Test strategy
- [Security](specs/security.md) - Auth and authorization
- [Deployment](specs/deployment.md) - Setup and deployment

### Implementation Plan

Check [PLAN.md](PLAN.md) for:
- Current phase and status
- Task breakdown and priorities
- Known issues and blockers
- Success criteria

### Questions

For questions or issues:
1. Check existing documentation first
2. Search closed issues
3. Open a new issue with detailed description

---

## Code of Conduct

### Our Standards

- **Be respectful** - Value diverse perspectives
- **Be constructive** - Focus on solutions, not blame
- **Be collaborative** - Help others learn and grow
- **Be professional** - Maintain a welcoming environment

### Our Responsibilities

Maintainers will:
- Review PRs promptly and provide constructive feedback
- Clearly communicate project direction and priorities
- Maintain high code quality standards
- Provide helpful documentation and examples

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

## Acknowledgments

Thank you for contributing to Second Brain MCP! Your efforts help make personal knowledge management more accessible and powerful for everyone.

---

**Questions?** Check [PLAN.md](PLAN.md) or open an issue.
