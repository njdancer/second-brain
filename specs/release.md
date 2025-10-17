# Release Specification

Requirements for the continuous integration, continuous deployment, and release management processes that govern how code changes flow from development through production.

---

## Git Branching Strategy

The repository MUST follow a trunk-based development model with short-lived feature branches merging to a protected main branch. This strategy prioritizes continuous integration and rapid feedback over long-running parallel development streams.

### Main Branch

The `main` branch represents the current state of truth and MUST always be in a deployable state. Every commit to `main` MUST pass all automated tests and type checking before merge. The branch MUST be protected with the following GitHub branch protection rules:

- Pull request reviews REQUIRED before merge (minimum 1 approval for single-maintainer projects)
- Status checks MUST pass before merge (tests, type checking, coverage thresholds)
- Force pushes MUST be disabled
- Deletion MUST be disabled
- Linear history SHOULD be enforced (rebase or squash merge only)

Direct commits to `main` are PROHIBITED except for emergency hotfixes when the pull request process would create unacceptable delay. Emergency commits MUST be documented with justification in the commit message.

### Feature Branches

All development work MUST occur on feature branches created from `main`. Feature branches SHOULD follow the naming convention `feature/{description}` or `fix/{description}` to indicate intent. Branch names MUST use kebab-case and SHOULD be concise but descriptive (e.g., `feature/oauth-pkce-support`, `fix/session-timeout-bug`).

Feature branches MUST be short-lived, typically merged within 1-3 days of creation. Long-running feature branches increase merge conflicts and defer integration issues. For large features requiring longer development, use feature flags to merge incomplete work while keeping the functionality disabled in production.

Feature branches SHOULD be deleted immediately after merge to reduce repository clutter and prevent accidental continued development on stale branches.

### Hotfix Workflow

Critical production issues requiring immediate deployment MAY bypass the standard pull request review process. Hotfixes MUST:

1. Create a branch from `main` (not from a feature branch)
2. Include only the minimal changes required to resolve the critical issue
3. Add or update tests to prevent regression
4. Deploy to development environment for validation before production
5. Create a pull request for post-deployment review and documentation

Hotfixes MUST be deployed to production within 1 hour of identification for critical failures (authentication broken, data loss risk, security vulnerability). Non-critical issues SHOULD follow the standard release process.

## Continuous Integration Pipeline

Every push to any branch and every pull request MUST trigger automated CI checks that validate code quality, correctness, and test coverage.

### CI Workflow Stages

The CI pipeline MUST execute the following stages in order, failing fast at the first error:

**1. Type Checking:** TypeScript compilation MUST succeed with no type errors. The project uses strict mode and all type checking rules MUST be enforced.

**2. Unit Tests:** All unit tests MUST pass with deterministic results. Flaky tests MUST be fixed or quarantined. The test suite MUST complete in under 60 seconds to provide rapid feedback.

**3. E2E Tests:** End-to-end integration tests MUST pass, validating the full OAuth 2.1 + PKCE + MCP protocol flow. E2E tests MUST complete in under 30 seconds and MUST NOT require manual intervention or browser interaction.

**4. Coverage Validation:** Code coverage MUST meet minimum thresholds (95% statement coverage, 95% function coverage). Coverage regressions MUST fail the build.

### CI Execution Environment

CI jobs MUST run on GitHub Actions using Ubuntu latest runners. The environment MUST use:

- Node.js 20 (LTS)
- pnpm 9.0.0 (via corepack)
- Frozen lockfile (`pnpm install --frozen-lockfile`) to ensure reproducible builds

CI jobs MUST use cached dependencies to reduce execution time. Cache invalidation MUST occur on `pnpm-lock.yaml` changes.

## Continuous Deployment Pipeline

Deployments are triggered automatically based on branch and merge events, with different environments receiving deployments under different conditions.

### Development Deployment

Every commit merged to `main` MUST automatically deploy to the development environment. This deployment occurs after all CI checks pass and MUST NOT require manual approval.

The development deployment workflow MUST:

1. Verify all CI checks passed (tests, type checking, coverage)
2. Deploy to Cloudflare Workers development environment
3. Create a GitHub Deployment record with environment "development"
4. Update deployment status to "success" or "failure"
5. Verify deployment with health check endpoint
6. Rollback automatically if health check fails

Development deployments MUST complete within 3 minutes of merge to `main`. Deployment failures MUST NOT block subsequent development deployments (fail forward, not fail stop).

### Production Deployment

Production deployments MUST be triggered manually via GitHub Actions workflow dispatch. This manual gate provides control over production releases while maintaining automation for everything except the final approval decision.

The production deployment workflow MUST:

1. Accept a workflow dispatch event from an authorized maintainer
2. Verify all CI checks passed on the commit being deployed
3. Re-run tests as final validation (even if CI already passed)
4. Deploy to Cloudflare Workers production environment
5. Create a GitHub Deployment record with environment "production"
6. Wait for manual approval if GitHub Environment protection rules are configured
7. Update deployment status to "success" or "failure"
8. Verify deployment with health check endpoint
9. Rollback automatically if health check fails

Production deployments SHOULD occur during business hours when maintainers can monitor for issues. Automated rollback handles immediate failures; delayed issues require manual intervention.

### GitHub Deployments API Integration

All deployments (development and production) MUST create GitHub Deployment records via the Deployments API. This provides centralized deployment history, status tracking, and integration with GitHub's environment protection features.

For each deployment, the workflow MUST:

1. Create a deployment record with the commit SHA being deployed
2. Set the environment name ("development" or "production")
3. Set deployment status to "in_progress" during deployment
4. Update status to "success" if deployment and verification succeed
5. Update status to "failure" if any step fails
6. Include deployment URL in the status update

GitHub Environment protection rules SHOULD be configured for production to:

- Require manual approval from designated reviewers
- Enforce deployment branch restrictions (only `main`)
- Apply wait timer (optional, e.g., 5 minute cooldown between deployments)

## Versioning Strategy

The project DOES NOT use semantic versioning tags for deployments. Version numbers exist for documentation and tracking purposes but do NOT trigger deployments or control which code runs in production.

Version numbers in `package.json` SHOULD be updated manually when significant features or breaking changes are released, following semantic versioning principles (MAJOR.MINOR.PATCH). These version updates help users understand release scope but are decoupled from the deployment process.

Git tags MAY be created for significant milestones or release markers, but tags MUST NOT trigger automated deployments. Tags serve as bookmarks in history, not deployment triggers.

## Deployment Verification

Every deployment MUST be verified before being considered successful. Verification failures MUST trigger automatic rollback to the previous stable deployment.

### Health Check Verification

Immediately after deployment, the workflow MUST:

1. Wait 30 seconds for edge network propagation
2. Request the `/health` endpoint of the deployed Worker
3. Verify HTTP 200 response with valid JSON health status
4. Fail the deployment if health check does not pass within 3 attempts

The health check endpoint is defined in the Deployment Specification and MUST NOT require authentication.

### Smoke Test Verification

Production deployments SHOULD execute smoke tests against the newly deployed environment. Smoke tests MUST:

- Validate OAuth client registration succeeds
- Verify MCP initialize endpoint returns valid session
- Confirm at least one tool execution succeeds (e.g., `glob` on bootstrap files)
- Complete within 60 seconds total

Smoke tests MAY be temporarily disabled during CI/CD infrastructure changes, documented with TODO comments and GitHub issues tracking re-enablement.

## Rollback Procedures

When a deployment fails verification or is identified as problematic post-deployment, the system MUST support rapid rollback to the previous known-good deployment.

### Automatic Rollback

The deployment workflow MUST automatically rollback if:

- Health check fails after deployment
- Smoke tests fail (when enabled)
- Deployment process encounters unrecoverable error

Automatic rollback MUST:

1. Use Cloudflare's instant rollback feature (via dashboard API or wrangler)
2. Revert to the immediately previous deployment
3. Update GitHub Deployment status to "failure"
4. Post comment on related pull request if applicable
5. Notify maintainers via GitHub Actions summary

### Manual Rollback

Maintainers MUST be able to trigger manual rollback via:

1. **Cloudflare Dashboard:** Workers → Deployments → "Rollback to this deployment" (last 10 deployments available)
2. **GitHub Actions Workflow:** Workflow dispatch accepting deployment ID or commit SHA to rollback to
3. **Wrangler CLI:** `wrangler rollback` command for local rollback operations

Manual rollback SHOULD be used for issues discovered after deployment verification passes (e.g., subtle bugs, performance degradation, user reports).

Rollback MUST NOT require rebuilding, retesting, or code changes. Cloudflare Workers' deployment history provides instant rollback to previous deployments.

## Pre-Deployment Requirements

Before any deployment can succeed, certain conditions MUST be satisfied. The CI/CD pipeline enforces these requirements automatically.

### Code Quality Gates

All code merged to `main` MUST meet quality standards:

- Zero TypeScript type errors
- Zero linter errors (when linter is configured)
- 95%+ statement coverage
- 95%+ function coverage
- All tests passing (unit and E2E)
- No high-severity security vulnerabilities in dependencies

Pull requests MUST NOT be merged if any quality gate fails.

### Dependency Management

The project uses `pnpm` with a lockfile (`pnpm-lock.yaml`) to ensure reproducible installations. Deployments MUST use `pnpm install --frozen-lockfile` to prevent unexpected dependency version changes.

Dependency updates MUST be tested in development before production deployment. Automated dependency updates (e.g., Dependabot) SHOULD be configured to create pull requests for review, not auto-merge.

### Configuration Validation

Before deployment, the workflow SHOULD validate:

- Required secrets are configured (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, etc.)
- wrangler.toml contains valid configuration for target environment
- Required Cloudflare resources exist (R2 buckets, KV namespaces, Durable Objects)

Configuration errors SHOULD fail deployment before code is uploaded to prevent partial or broken deployments.

## Deployment Notifications

The CI/CD system MUST provide visibility into deployment status through multiple channels.

### GitHub Actions Summary

Every deployment MUST create a GitHub Actions step summary with:

- Environment deployed to
- Commit SHA deployed
- Deployment timestamp
- Deployment URL
- Health check status
- Link to Cloudflare Workers dashboard

### Pull Request Comments

When a pull request is merged and triggers development deployment, the workflow SHOULD post a comment to the pull request with deployment status and URL for testing.

### Deployment History

GitHub Deployments API provides centralized deployment history viewable at:

`https://github.com/{owner}/{repo}/deployments`

This history MUST be maintained for all deployments and MUST include:

- Commit SHA deployed
- Environment name
- Deployment status (success/failure/in_progress)
- Deployment URL
- Timestamp

## Release Documentation

While deployments do not require release notes, significant production releases SHOULD be documented.

### Changelog Maintenance

The project SHOULD maintain a `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) format. Changelog entries SHOULD be added as part of pull requests, not as separate commits.

Changelog entries SHOULD categorize changes as:

- **Added** - New features
- **Changed** - Changes to existing functionality
- **Deprecated** - Soon-to-be-removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security improvements

### Release Markers

When significant milestones are reached (e.g., production-ready, major feature completion), maintainers MAY:

1. Update version in `package.json` following semantic versioning
2. Update PLAN.md to reflect milestone completion
3. Create git tag for historical reference (e.g., `v1.2.18-claude-working`)
4. Create GitHub Release for visibility and reference

These markers serve documentation purposes and MUST NOT affect deployment automation.

## Emergency Response

In the event of critical production issues, the following emergency procedures apply.

### Critical Failure Response

If production is non-functional (authentication broken, Workers returning 5xx errors, data corruption):

1. Immediately rollback via Cloudflare Dashboard (fastest method)
2. Verify rollback restores functionality via health check
3. Create incident report issue on GitHub
4. Investigate root cause on separate branch
5. Deploy fix through standard process (or hotfix process if time-critical)

Critical failures MUST be resolved within 1 hour of detection. If rollback does not resolve the issue, engage Cloudflare support for platform-level investigation.

### Degraded Performance Response

If production is functional but degraded (slow responses, increased error rate, rate limit exhaustion):

1. Monitor Cloudflare Analytics for error patterns
2. Review Worker logs for error messages and timing data
3. Determine if issue is code-related or platform-related
4. If code-related and severe, rollback to previous stable deployment
5. If platform-related, verify Cloudflare status page for incidents

Performance degradation SHOULD be addressed within 24 hours but does not require emergency rollback unless user experience is significantly impacted.

## Related Specifications

See [Deployment Specification](./deployment.md) for environment configuration, infrastructure requirements, and hosting platform details.

See [Testing Specification](./testing.md) for test coverage requirements, test execution standards, and E2E test implementation.

See [Monitoring Specification](./monitoring.md) for post-deployment observability, alerting, and metrics collection.
