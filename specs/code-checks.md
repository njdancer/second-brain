# Code Checks

Automated code validation requirements for maintaining code quality, consistency, and correctness.

---

## Overview

The project MUST enforce code quality standards through automated checks that run during development and as gates in the CI/CD pipeline. These checks ensure consistency, catch common errors, and maintain a high-quality codebase without relying solely on manual review.

All code checks MUST be fast enough to run on every save during development (under 5 seconds for the full suite) and MUST provide clear, actionable error messages when violations are detected.

---

## Type Checking

### TypeScript Configuration

The project MUST use TypeScript in strict mode with all type checking rules enforced. The TypeScript compiler MUST be configured to:

- Enable all strict mode flags (`strict: true`)
- Prohibit implicit `any` types
- Require explicit return types on exported functions
- Enforce strict null checks
- Enforce strict function types

### Type Checking Requirements

Type checking MUST pass with zero errors before code can be merged or deployed. Type checking MUST be performed:

- On every file save during development (via IDE integration or watch mode)
- On every commit (via pre-commit hooks)
- On every push and pull request (via CI)
- Before every deployment (via CD pipeline)

**Warnings are allowed** and should be addressed over time, but MUST NOT block merges or deployments.

### Type Coverage

The codebase SHOULD trend toward higher type coverage over time:
- Minimize use of `any` types (explicit `any` requires justification)
- Prefer strict types over loose types
- Use Zod schemas for runtime validation + static type inference

---

## Linting

### ESLint Configuration

The project MUST use ESLint with TypeScript support to enforce code quality rules. The ESLint configuration MUST include:

- TypeScript parser (`@typescript-eslint/parser`)
- TypeScript ESLint plugin (`@typescript-eslint/eslint-plugin`)
- Recommended TypeScript rules enabled
- Project-specific rules for consistency

### Linting Requirements

ESLint MUST pass with zero errors before code can be merged or deployed. The linting check MUST:

- Run on all TypeScript files in `src/` directory
- Enforce recommended TypeScript rules
- Allow warnings (should be addressed but don't block)
- Provide clear error messages with fix suggestions where available

### Rule Categories

The linting configuration SHOULD enforce rules in these categories:

**Code Quality:**
- No unused variables or imports
- No unreachable code
- No constant conditions
- Prefer const over let where applicable

**TypeScript-Specific:**
- Consistent type assertion style
- Prefer TypeScript types over JSDoc
- No unnecessary type assertions
- Explicit function return types for exported functions

**Best Practices:**
- No async functions without await
- Proper Promise handling
- No console.log in production code (use structured logger)
- Proper error handling

**Style (enforced by formatter, not linter):**
- Indent, spacing, line length, etc. should be handled by Prettier, not ESLint

### Auto-Fixable Rules

Where possible, ESLint rules SHOULD be configured with auto-fix capability. Developers SHOULD run auto-fix before committing:

```bash
pnpm run lint:fix  # Auto-fix all fixable issues
```

---

## Formatting

### Prettier Configuration

The project MUST use Prettier for consistent code formatting. Prettier MUST be configured to:

- Format TypeScript files (`.ts`)
- Format JSON files (`.json`)
- Format Markdown files (`.md`)
- Use consistent style across the entire codebase

### Formatting Requirements

Code MUST be formatted according to Prettier rules before merge. Formatting MUST be enforced:

- Via pre-commit hooks (auto-format staged files)
- Via CI checks (verify formatting, fail if not formatted)
- Via IDE integration (format on save recommended)

**Formatting violations MUST fail CI** unless auto-formatting is enabled in pre-commit hooks.

### Formatting Standards

The Prettier configuration SHOULD use these settings as a baseline:

- **Print width:** 100 characters (or 120 for longer lines)
- **Tab width:** 2 spaces
- **Semicolons:** Required
- **Quotes:** Single quotes for strings, double quotes for JSX
- **Trailing commas:** ES5-style (where valid in ES5)
- **Arrow function parens:** Always include parentheses

**[DEFERRED]** Exact Prettier configuration values are implementation decisions. The requirement is consistent formatting, not specific style choices.

### Integration with ESLint

Prettier and ESLint MUST NOT conflict. The ESLint configuration MUST:

- Disable all style-related rules that conflict with Prettier
- Use `eslint-config-prettier` to prevent conflicts
- Run Prettier as a separate check (not through ESLint plugin)

---

## Pre-Commit Hooks

### Hook Requirements

The project SHOULD use pre-commit hooks to enforce code quality before commits reach the repository. Pre-commit hooks SHOULD run:

- Type checking on staged files
- Linting on staged files (with auto-fix)
- Formatting on staged files (with auto-format)

**Performance requirement:** Pre-commit hooks MUST complete in under 10 seconds for typical commits. If checks are too slow, consider only running on changed files or using incremental checking.

### Hook Failures

If pre-commit hooks fail:
- Type errors MUST block the commit
- Lint errors MUST block the commit (unless auto-fixed)
- Format errors SHOULD be auto-fixed (block only if auto-fix fails)

Developers MAY bypass hooks with `--no-verify` flag for emergency situations, but bypassed commits MUST still pass CI checks before merge.

### Recommended Tools

The project MUST use `husky` + `lint-staged` for pre-commit hook management to ensure consistent tooling across development environments.

---

## CI Pipeline Integration

### Quality Gates

The CI pipeline MUST enforce all code checks as quality gates. The pipeline MUST run:

**Parallel Stage 1 (Fast Checks):**
- Type checking (strict mode, zero errors)
- Linting (zero errors, warnings allowed)
- Formatting validation (must match Prettier output)

**Parallel Stage 2 (Tests):**
- Unit tests (separate concern, see [Testing](./testing.md))
- Integration tests
- E2E tests

All checks in Stage 1 MUST pass before Stage 2 runs. If any Stage 1 check fails, the build MUST fail immediately (fail fast).

### CI Performance

CI quality checks MUST complete quickly to enable rapid iteration:

- Type checking: < 30 seconds
- Linting: < 20 seconds
- Format validation: < 10 seconds
- **Total Stage 1:** < 60 seconds

If checks exceed these targets, consider incremental checking, caching, or parallel execution.

### CI Failure Messages

When CI checks fail, the pipeline MUST provide:
- Clear indication of which check failed
- Specific error messages with file and line numbers
- Suggested fixes where applicable
- Link to relevant documentation or style guide

---

## Editor Integration

### IDE Support

Developers SHOULD configure their IDE/editor to run code checks automatically. Recommended integrations:

- **Type checking:** Real-time TypeScript errors in editor
- **Linting:** Real-time ESLint errors and warnings
- **Formatting:** Format on save with Prettier

### Recommended Extensions

**[DEFERRED]** Specific editor extensions are developer preferences, but project documentation SHOULD recommend:
- VS Code: ESLint extension, Prettier extension, TypeScript support
- Other editors: Equivalent TypeScript + ESLint + Prettier support

### Editor Configuration

The project MAY include `.vscode/settings.json` with recommended settings, but MUST NOT require specific editors or extensions. Developers using other editors MUST be able to run checks via CLI commands.

---

## Command Reference

The following commands MUST be available for running code checks:

```bash
# Type checking
pnpm run type-check          # Run TypeScript compiler (no emit)

# Linting
pnpm run lint                # Check all files for lint errors
pnpm run lint:fix            # Auto-fix all fixable lint issues

# Formatting
pnpm run format:check        # Verify all files are formatted
pnpm run format:write        # Auto-format all files

# Combined checks (run all quality checks)
pnpm run check               # Type check + lint + format check
```

**[DEFERRED]** Exact command names and implementations are negotiable, but the capability to run each check independently MUST exist.

---

## Naming Conventions

Code MUST follow consistent naming conventions enforced by linting rules or documented for manual enforcement:

### TypeScript Naming

- **PascalCase:** Classes, interfaces, types, enums
- **camelCase:** Functions, variables, parameters, methods
- **SCREAMING_SNAKE_CASE:** Constants (module-level, truly immutable)
- **kebab-case:** File names (e.g., `mcp-api-handler.ts`)

### Special Cases

- **Private fields:** Prefix with underscore (e.g., `_internalState`)
- **Type parameters:** Single uppercase letter or PascalCase (e.g., `T` or `TResponse`)
- **Acronyms in names:** Treat as words (e.g., `HttpClient` not `HTTPClient`, `userId` not `userID`)

### File Naming

- **Source files:** kebab-case with descriptive names (e.g., `github-oauth-provider.ts`)
- **Test files:** Match source file + `.test.ts` suffix (e.g., `github-oauth-provider.test.ts`)
- **Types/Interfaces:** Match domain concept (e.g., `types.ts`, `storage-types.ts`)

---

## Code Organization Standards

### Import Organization

Imports MUST be organized in a consistent order:

1. External dependencies (e.g., `import { z } from 'zod'`)
2. Internal modules (e.g., `import { Logger } from './logger'`)
3. Type-only imports (e.g., `import type { Env } from './types'`)

Linting rules SHOULD enforce import order and flag unused imports.

### File Structure

TypeScript files SHOULD follow this general structure:

1. Imports
2. Type definitions (interfaces, types)
3. Constants
4. Main logic (functions, classes)
5. Exports

**[DEFERRED]** Exact file organization is an implementation decision, but consistency within the project is required.

---

## Error Handling Standards

### Error Messages

Error messages MUST:
- Be user-facing: Generic, safe messages (no PII, no stack traces)
- Be internal: Detailed context in logs
- Use proper HTTP status codes
- Include correlation IDs for debugging

### Async/Await

Code MUST use async/await consistently:
- Avoid raw Promise constructors where async/await is clearer
- Always await async calls (linting rule enforced)
- Handle errors with try/catch blocks
- Propagate errors with proper context

### Linting Rules for Error Handling

ESLint MUST enforce:
- No floating promises (unawaited async calls)
- Proper Promise error handling
- No async functions without await
- Proper try/catch usage

---

## Security Standards

### Input Validation

All external inputs MUST be validated:
- Use Zod schemas for runtime validation
- Validate path parameters (no `..`, null bytes, control characters)
- Validate file sizes before operations
- Sanitize user-provided patterns (regex, glob)

### Sensitive Data

Code MUST NOT:
- Log secrets, tokens, or passwords
- Include hardcoded credentials
- Expose internal paths or system details in errors
- Store sensitive data in plain text

Linting rules SHOULD flag common security anti-patterns where possible.

---

## Dependency Management

### Allowed Dependencies

Dependencies MUST:
- Be from reputable sources (npm registry)
- Have TypeScript types available (via `@types/*` or built-in)
- Be actively maintained (not abandoned)
- Have acceptable licenses (MIT, Apache, ISC, etc.)

### Dependency Updates

Dependencies SHOULD be updated regularly but with caution:
- Security updates applied promptly
- Major version updates tested in development first
- Lock file (`pnpm-lock.yaml`) committed to ensure reproducible builds

---

## Enforcement Strategy

### Levels of Enforcement

Code checks are enforced at multiple levels:

**Level 1 - Developer Local (Soft):**
- IDE integration provides real-time feedback
- Pre-commit hooks prevent most issues
- Fast feedback loop (< 10 seconds)

**Level 2 - CI Pipeline (Hard):**
- All checks run on every push/PR
- Must pass to merge
- Authoritative enforcement (< 60 seconds)

**Level 3 - Deployment Gate (Critical):**
- All checks re-run before deployment
- Any failure blocks deployment
- Final safety net

### Override Mechanisms

Developers MAY bypass local checks (`--no-verify`) but MUST NOT bypass CI checks. Manual overrides require maintainer approval and documented justification.

---

## Related Documentation

- [Release](./release.md) - CI/CD pipeline that enforces code checks
- [Testing](./testing.md) - Test coverage and quality requirements
- [Architecture](./architecture.md) - System design and component standards
- [Security](./security.md) - Security validation requirements
