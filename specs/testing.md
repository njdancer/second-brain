# Testing Strategy

Testing philosophy, architecture, and quality standards for the Second Brain MCP server.

---

## Philosophy

**Quality Through Trends, Not Absolutes**

Coverage metrics indicate direction, not destination. The goal is continuous improvement: coverage should trend upward over time, with decreases requiring explicit justification. This approach balances pragmatism with rigor—we acknowledge that not all code can be meaningfully tested while maintaining accountability for quality regression.

**Test What Matters**

Focus testing effort where it provides maximum value: business logic, security boundaries, error handling, and integration points. Avoid testing implementation details of third-party libraries or platform APIs—trust mature dependencies, mock at boundaries, and test our usage of them.

**Fast Feedback Loops**

Tests should be fast enough to run on every save during development. Unit tests measure in milliseconds, integration tests in seconds. Slow tests get skipped; skipped tests provide no value. Speed enables test-driven development and rapid iteration.

---

## Architecture

### Test Boundaries

**Unit Tests**: Isolated component behavior
- Mock all external dependencies (R2, KV, OAuth libraries, external APIs)
- Test business logic, validation, error handling, edge cases
- Fast execution (< 100ms per test)
- High coverage of algorithmic complexity

**Integration Tests**: Cross-component interactions
- Real business logic with mocked infrastructure
- Test workflows that span multiple modules
- Verify contracts between components
- Moderate execution time (< 5s per test)

**E2E Tests**: Full system validation
- Real Worker runtime via `wrangler dev`
- Real MCP SDK client (production-equivalent)
- Mock only external services (GitHub, S3)
- Tests the actual HTTP boundary that production uses
- Slow but comprehensive (< 30s per test)

### Runtime Strategy

**Current: Node.js + Jest**

All tests run in Node.js because our dependencies (MCP SDK, AWS SDK) use CommonJS modules with JSON imports that workerd doesn't support. This works because:
- Unit/integration tests don't need Worker-specific APIs
- E2E tests run actual Worker via `wrangler dev`
- Production bundler (esbuild) resolves CommonJS→ESM at build time

**Future: Workers Runtime**

If dependencies migrate to pure ESM or we pre-bundle for testing, we could use `@cloudflare/vitest-pool-workers` to test in actual workerd. This would catch platform-specific issues earlier, but the current gap is acceptable—E2E tests provide sufficient runtime validation.

### Mock Strategy

Mocks should mirror API contracts without implementing internal logic. Keep them simple, predictable, and focused on enabling test scenarios (success paths, error injection, edge cases). Never mock third-party library internals—mock at the boundaries where we call them.

**Infrastructure mocks** (R2, KV): In-memory Map-based implementations matching Cloudflare API contracts.

**Service mocks** (OAuth, GitHub): Controlled flows with configurable responses for testing authorization, error handling, and edge cases.

---

## Coverage Standards

### Trend-Based Monitoring

Use automated coverage tracking (Codecov, Coveralls, or similar) to monitor trends across commits. Visualize coverage history to identify patterns. Fail CI on significant drops unless manually overridden with justification. This creates accountability without mandating arbitrary absolutes.

**Coverage drops fail CI by default**, requiring:
- PR comment explaining the decrease
- Maintainer approval via review
- Plan to recover coverage (if applicable)

This prevents accidental quality degradation while allowing intentional trade-offs.

### What to Measure

**High coverage priorities**:
- Tool implementations (read, write, edit, glob, grep)
- Security validation (path traversal, size limits, injection)
- Rate limiting and quota enforcement
- Error handling paths
- Storage abstractions

**Lower coverage acceptable**:
- Defensive logging and debug code
- HTTP request/response marshaling (tested via E2E)
- OAuth library integration (tested via E2E)
- Platform API wrappers (thin adapters over R2/KV)

### CI/CD Enforcement

GitHub Actions runs tests on every push, uploads coverage data, and enforces quality gates:
- All tests must pass
- TypeScript compilation must succeed
- Coverage must not decrease significantly (without override)

Manual approval gates prevent deployment of quality regressions while preserving flexibility for justified trade-offs.

---

## Test Types

### Unit Testing

Focus on pure functions, business logic, and error handling. Mock all I/O and external dependencies. Test edge cases, boundary conditions, concurrent operations, and security validations.

**Key principles**:
- One assertion per concept (not necessarily per test)
- Descriptive test names that document behavior
- Fast execution enables rapid iteration
- Comprehensive coverage of conditional logic

**Example patterns**:
- Valid input → expected output
- Invalid input → proper error with context
- Boundary conditions (empty, max, overflow)
- Concurrent operations → correct final state
- Security violations → rejection with safe error

### Integration Testing

Verify that components work together correctly. Use real business logic with mocked infrastructure. Test workflows that cross module boundaries.

**Focus areas**:
- Tool operation sequences (create → read → edit → delete)
- Rate limiting across multiple requests
- Storage operations with quota enforcement
- Error propagation through layers

**Not tested here**: Full HTTP transport, real OAuth flows, production runtime—those belong in E2E tests.

### E2E Testing

Validate the complete system as production uses it. Run actual Worker via `wrangler dev`, use real MCP SDK client, test over HTTP transport. Mock only external services (GitHub OAuth, S3 backups).

**What this validates**:
- HTTP request/response handling
- OAuth 2.1 + PKCE flow completion
- MCP protocol implementation (initialize, tools/list, prompts/list, tool execution)
- Session management
- Real Worker runtime behavior

**Why this matters**: Unit and integration tests can't catch protocol-level issues, runtime incompatibilities, or HTTP transport bugs. E2E tests verify the actual production integration point.

### Manual Testing

Automated tests can't cover everything. Manual validation is required for:
- Cross-platform clients (desktop, web, mobile)
- Real OAuth providers (not mocked flows)
- User experience and error messages
- Production performance under load
- Backup validation with actual S3

Maintain a lightweight checklist of critical flows to verify before major releases, but don't prescribe detailed step-by-step procedures—those go stale quickly.

---

## Tools & Infrastructure

### Test Framework

The testing framework must support TypeScript with comprehensive coverage tooling, watch mode for test-driven development, and mature mocking capabilities. Configuration should prioritize speed through parallel execution and provide detailed coverage reporting with trend analysis.

### Coverage Tracking

Coverage metrics must be tracked over time with automated trend analysis. The system should integrate with pull requests to display coverage deltas and historical trends, enabling enforcement of coverage requirements through baseline comparisons.

### CI/CD Integration

Automated testing must run on every commit and pull request, uploading coverage data and enforcing quality gates (all tests pass, coverage trends acceptable). Successful test runs enable deployment. All deployments must be tracked for rollback capability.

### Local Development

The testing system must support:
- Parallel test execution for speed
- Watch mode for iterative development
- HTML coverage report generation
- Selective test execution by path or pattern

---

## Quality Gates

### Pre-Commit

Local pre-commit hook runs full test suite. Prevents committing broken code. Fast test execution makes this practical—slow tests would incentivize skipping the hook.

### Continuous Integration

**Required for merge**:
- All tests pass (unit, integration, E2E)
- TypeScript compilation succeeds
- Coverage trend is acceptable

**Manual override available** for coverage decreases with justification.

### Pre-Deployment

Manual validation checklist for production releases (real OAuth, cross-platform testing, backup verification). Automated tests provide confidence, but critical flows deserve human verification before release.

---

## Maintenance

### When to Update Tests

- **New features**: Write tests first (TDD)
- **Bug fixes**: Add regression test before fixing
- **Behavior changes**: Update affected tests
- **Refactoring**: Tests should still pass (if they don't, you changed behavior)

### When to Delete Tests

- **Dead code removed**: Delete associated tests immediately
- **Features removed**: Delete feature tests
- **Never**: Keep tests for active code paths

Trust git history as the archive. Don't comment out tests "just in case."

### Test Quality Indicators

Good tests are:
- **Readable**: Self-documenting with clear names and structure
- **Fast**: Unit tests < 100ms, integration < 5s, E2E < 30s
- **Deterministic**: No flaky tests, no timing dependencies
- **Isolated**: No shared state between tests
- **Comprehensive**: Cover edge cases, errors, and security

Bad tests are worse than no tests—they create false confidence and maintenance burden.

---

## Related Documentation

- [API Reference](./api-reference.md) - Tool specifications
- [Implementation](./implementation.md) - Code structure
- [Security](./security.md) - Security architecture
- [Deployment](./deployment.md) - Production procedures
