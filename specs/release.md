# Release Specification

Requirements for the continuous integration, continuous deployment, and release management processes that govern how code changes flow from development through production.

---

## Git Branching Strategy

The repository MUST follow a trunk-based development model with short-lived feature branches merging to a protected main branch. This strategy prioritizes continuous integration and rapid feedback over long-running parallel development streams.

### Main Branch

The `main` branch represents the current state of truth and MUST always be in a deployable state. Every commit to `main` MUST pass all automated tests and type checking before merge. The branch MUST be protected with the following GitHub branch protection rules:

- Pull request reviews RECOMMENDED but not enforceable for single-maintainer projects (GitHub does not allow self-approval)
- Status checks MUST pass before merge (tests, type checking, coverage thresholds, linting, formatting)
- Force pushes MUST be disabled
- Deletion MUST be disabled
- Linear history SHOULD be enforced (rebase or squash merge only)

Direct commits to `main` are PROHIBITED except for emergency hotfixes when the pull request process would create unacceptable delay. Emergency commits MUST be documented with justification in the commit message.

### Feature Branches

All development work MUST occur on feature branches created from `main`. Feature branches SHOULD follow the naming convention `feature/{description}` or `fix/{description}` to indicate intent. Branch names MUST use kebab-case and SHOULD be concise but descriptive (e.g., `feature/oauth-pkce-support`, `fix/session-timeout-bug`).

Feature branches MUST be short-lived, typically merged within 1-3 days of creation. Long-running feature branches increase merge conflicts and defer integration issues. For large features requiring longer development, feature flags MAY be used to merge incomplete work while keeping functionality disabled in production. See [Feature Flags](./feature-flags.md) for flag management and controlled rollout.

Feature branches SHOULD be deleted immediately after merge to reduce repository clutter and prevent accidental continued development on stale branches.

### Hotfix Workflow

Critical production issues requiring immediate deployment MUST use a PR-based hotfix workflow that serves as the central coordination point during an incident. The hotfix PR enables rapid iteration through automated development deployments while maintaining manual control over production deployments.

**Key Principles:**
- The hotfix branch becomes the **trunk during the incident**
- Development deploys automatically on every push (rapid testing)
- Production deploys manually on demand (controlled releases)
- Multiple production deployments possible from a single PR (iterative fixes)
- Parallel work can occur in feature branches that merge into the hotfix branch
- Regular development can continue on `main` during the incident (dev deployment blocked until hotfix resolved)

#### Hotfix Initiation

A manual GitHub Actions workflow MUST be available to initiate the hotfix process:

**Workflow: "Create Hotfix Branch"**

Triggered manually via GitHub Actions workflow dispatch when a critical production issue is identified.

**Required inputs:**
- Issue description (brief summary of the production problem)
- Severity level (Critical: auth/data loss/security; High: degraded performance)

**Workflow steps:**
1. Query GitHub Deployments API for environment "production"
2. Extract commit SHA from most recent successful deployment
3. Create hotfix branch from production commit: `hotfix/{timestamp}-{issue-slug}`
4. Create pull request from hotfix branch to `main`:
   - Title: `[Hotfix] {issue_description}`
   - Body: Severity, production commit SHA, incident tracking info
   - Labels: `hotfix`
5. Output PR URL and hotfix branch name for developer

**Result:** A pull request is created that will serve as the central coordination point for the entire incident response.

#### Incident Response Process

Once the hotfix PR is created, developers iterate on fixes using the following process:

**1. Implement Fix**
- Check out the hotfix branch locally
- Implement the fix and add/update tests
- Commit changes with descriptive messages
- Push to the hotfix branch

**2. Automated Testing and Development Deployment**
- Every push to the hotfix branch automatically triggers:
  - Full CI checks (type checking, linting, tests, coverage)
  - Automatic deployment to development environment (even if tests fail, to enable rapid testing)
  - CI status posted to PR (test failures do not block development deployment during hotfix)
- Developer verifies fix in development environment
- If fix is incomplete or incorrect, push more commits (process repeats)

**3. Deploy to Production (Manual)**
- When confident the fix is ready, manually trigger production deployment
- Deployment mechanism: GitHub Actions workflow dispatch or environment approval
- Deployment process:
  - Run full pre-deployment checks (tests MUST pass, type checking MUST pass, health checks MUST pass)
  - Deploy hotfix branch to production
  - Verify production health check
  - If health check fails: Automatic rollback
  - If health check passes: Create version tag
- Monitor production to verify fix is working

**4. Iterate if Needed**
- If the issue is not fully resolved or a new problem emerges:
  - Return to step 1 (implement additional fixes)
  - Push more commits to the hotfix branch
  - Deploy to development for testing
  - Deploy to production again when ready
- Each production deployment creates a new version tag (e.g., `v25.1.1`, `v25.1.2`, `v25.1.3`)
- The hotfix PR remains open throughout the incident

#### Parallel Work During Incident

The hotfix branch serves as the trunk during the incident. To collaborate or work on related fixes in parallel:

1. Create a feature branch from the hotfix branch (not from `main`)
2. Implement changes and test locally
3. Create a PR from feature branch to the hotfix branch (not to `main`)
4. Merge feature branch into hotfix branch
5. Hotfix branch deployment pipeline runs automatically with the merged changes

This allows multiple developers or workstreams to contribute fixes that are tested together before production deployment.

#### Development Environment Blocking

To prevent confusion during incidents, the normal development deployment workflow SHOULD be modified to block deployments when a hotfix PR is open:

**Blocking behavior:**
- Check for open PRs with the `hotfix` label before deploying to development
- If a hotfix PR exists: Skip development deployment, post comment explaining dev is in "hotfix mode"
- Block creation of new hotfix PRs while an existing hotfix PR is open (only one hotfix incident at a time)
- Regular development work can still merge to `main` during the incident
- Development environment remains at the hotfix branch state until incident is resolved

**Rationale:** This ensures the development environment accurately reflects the production hotfix state and prevents unrelated `main` changes from overwriting the hotfix deployment during testing. Single hotfix at a time prevents overlapping incident response efforts.

#### Resolution and Merge

When the incident is fully resolved and production is stable:

**1. Manual Merge**
- Manually merge the hotfix PR to `main` (do not auto-merge)
- Use squash merge or regular merge based on commit history clarity preferences
- Ensure PR has final incident summary and deployed version tags documented

**2. Automatic Development Deployment**
- Merging the hotfix PR to `main` automatically triggers the normal CI/CD pipeline
- This deploys `main` (now including all hotfix changes) to development
- Development environment is restored to track `main` instead of the hotfix branch
- The merge removes the blocking condition, allowing normal dev deployments to resume

**3. Post-Incident Documentation**
- Add incident summary to the merged PR as a comment (optional but recommended)
- Link to any post-mortem documents or incident reports
- Document what was learned and any follow-up work needed

#### Workflow Requirements

The automated portions of the hotfix workflow MUST satisfy these requirements:

**Hotfix branch creation:**
- Runs on manual trigger (GitHub Actions workflow dispatch)
- Creates branch from actual production commit (via Deployments API)
- Generates unique, timestamped branch names
- Creates PR with proper labels and metadata
- Blocks creation if another hotfix PR is already open

**Continuous deployment to development:**
- Triggers on every push to `hotfix/*` branches
- Runs full CI checks
- Deploys automatically regardless of CI check results (rapid testing during incident)
- Updates PR with deployment status, CI check results, and URLs
- Completes within 5 minutes of push

**Manual deployment to production:**
- Triggers on manual approval or workflow dispatch
- Runs full pre-deployment verification (tests MUST pass before production deployment)
- Deploys hotfix branch to production
- Verifies health checks before finalizing
- Rolls back automatically on failure
- Creates version tag on success
- Can be triggered multiple times from the same hotfix branch
- Completes within 5 minutes of trigger

**Development deployment blocking:**
- Checks for open hotfix PRs before deploying to development
- Skips deployment and posts informative comment if hotfix in progress
- Resumes normal behavior when hotfix PR is merged

**Performance target:** The entire incident response (from issue identification to production fix deployed) SHOULD complete within 1 hour for critical issues.

**Hotfix PR concurrency:**
- Only one hotfix PR MAY be open at a time
- Hotfix branch creation workflow MUST check for existing open hotfix PRs and fail if one exists
- This prevents overlapping incident response efforts and development environment conflicts

#### Error Handling

The hotfix workflow MUST handle errors gracefully:

- **Test failures during development deployment:** Post CI check results to PR, proceed with development deployment for rapid testing
- **Test failures during production deployment:** Block production deployment, update PR with details, developer fixes and pushes again
- **Development deployment failures:** Rollback development, post PR comment with error details
- **Production deployment failures:** Automatic rollback to previous production version, update PR with failure notification
- **Health check failures:** Trigger automatic rollback, require manual investigation before retry

All errors MUST be surfaced in the PR as comments so the incident response team has full visibility.

### Production Commit Tracking

The system MUST track which commit is currently deployed to production to support hotfix workflows and deployment verification. Since `main` continuously deploys to development but production requires manual approval, production MAY lag behind `main` by multiple commits.

**Tracking mechanism:** The GitHub Deployments API serves as the authoritative source for production commit tracking. Each production deployment creates a deployment record with the deployed commit SHA. To identify the current production commit:

1. Query GitHub Deployments API for environment "production"
2. Filter for deployments with status "success"
3. Sort by created timestamp descending
4. The most recent successful deployment contains the production commit SHA

**Implementation approach:** The hotfix workflow SHOULD include a step that queries the GitHub API to retrieve the current production commit SHA before creating the hotfix branch. This ensures hotfixes branch from production reality, not `main`'s potentially unreleased features.

**Alternative approach:** Git tags (e.g., `production-25.0.0`) could mark production deployments, but tags are less flexible than the Deployments API and don't provide deployment status or rollback history. Tags MAY be used as supplementary markers but SHOULD NOT be the primary tracking mechanism.

## Continuous Integration Pipeline

Every push to any branch and every pull request MUST trigger automated CI checks that validate code quality, correctness, and test coverage.

### CI Workflow Stages

The CI pipeline MUST execute the following stages, with independent stages running in parallel for speed:

**Parallel Stage 1 (Quality Checks):**
- **Type Checking:** TypeScript compilation MUST succeed with no type errors. The project uses strict mode and all type checking rules MUST be enforced.
- **Linting:** Code MUST pass all ESLint rules with no errors (warnings allowed).
- **Formatting:** Code MUST pass Prettier formatting validation (or auto-format in pre-commit hooks).

**Parallel Stage 2 (Testing):**
- **Unit Tests:** All unit tests MUST pass with deterministic results. Flaky tests MUST be fixed or quarantined. The test suite MUST complete in under 60 seconds to provide rapid feedback.
- **E2E Tests:** End-to-end integration tests MUST pass, validating the full OAuth 2.1 + PKCE + MCP protocol flow. E2E tests MUST complete in under 30 seconds and MUST NOT require manual intervention or browser interaction.

**Sequential Stage 3 (Coverage):**
- **Coverage Validation:** Code coverage MUST NOT decrease without explicit approval (via `coverage-override` comment). Current thresholds are defined in `jest.config.js`. Aspirational targets: 90%+ statement coverage, 90%+ function coverage.

The pipeline MUST fail fast at the first error in any stage.

### CI Execution Environment

CI jobs MUST run on GitHub Actions using Ubuntu latest runners. The environment MUST use:

- Node.js version as specified in `.mise.toml` or `.tool-versions`
- pnpm version as specified in `package.json` `packageManager` field (installed via corepack)
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

GitHub Environment protection rules SHOULD be configured for production to:

- Require manual approval from designated reviewers (when multiple maintainers available)
- Enforce deployment branch restrictions (only `main`)
- Apply wait timer (optional, e.g., 5 minute cooldown between deployments)

The production deployment workflow MUST:

1. Accept a workflow dispatch event from an authorized maintainer
2. Verify all CI checks passed on the commit being deployed
3. Re-run all tests and type checking if any new commits were made since the last CI run (e.g., version bumps, changelog updates)
4. Skip test re-runs if deploying the exact commit that already passed CI with no modifications
5. Deploy to Cloudflare Workers production environment
6. Create a GitHub Deployment record with environment "production"
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

## Versioning Strategy

The project uses a simplified YEAR.RELEASE.HOTFIX versioning scheme for tracking releases via git tags. Version numbers exist solely in git tags as historical markers and do NOT trigger deployments or control which code runs in production.

Version number format:
- **YEAR:** Last two digits of the year (e.g., `25` for 2025)
- **RELEASE:** Sequential release number within the year, starting at 0 for the first release, incremented for each subsequent production deployment (e.g., `0`, `1`, `2`...)
- **HOTFIX:** Sequential hotfix number for emergency patches to a specific release (e.g., `0` for initial release, `1` for first hotfix)

Examples: `v25.0.0` (first release of 2025), `v25.0.1` (hotfix to first release), `v25.1.0` (second release of 2025), `v25.2.0` (third release of 2025)

Version management:
- Git tags are the ONLY source of version information
- The deployment workflow SHOULD automatically create version tags on successful production deployments
- The workflow SHOULD query existing git tags to determine the next version number
- The workflow SHOULD increment the RELEASE number for standard deployments from `main`
- The workflow SHOULD increment the HOTFIX number for hotfix deployments
- Tags serve as bookmarks in git history, not deployment triggers

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

**[OUT OF SCOPE]** Production smoke tests are deferred for future implementation. While automated smoke tests would provide valuable post-deployment validation (OAuth client registration, MCP initialize, tool execution), they are not required for initial deployment automation. Manual verification via the OAuth test script remains the primary validation method.

## Rollback Procedures

When a deployment fails verification or is identified as problematic post-deployment, the system MUST support rapid rollback to the previous known-good deployment.

**[NEEDS DISCUSSION]** Data migrations and breaking changes: How should we handle rollbacks when database schema changes or data migrations have occurred? The system should follow an "expand and contract" methodology to avoid one-way doors. Before implementing features that modify data structures, we need a strategy for backward-compatible changes and safe rollback procedures.

### Automatic Rollback

The deployment workflow MUST automatically rollback if:

- Health check fails after deployment
- Deployment process encounters unrecoverable error

Automatic rollback MUST:

1. Use Cloudflare's instant rollback feature (via dashboard API or wrangler)
2. Revert to the immediately previous deployment
3. Update GitHub Deployment status to "failure"
4. Post comment on related pull request if applicable
5. Notify maintainers via GitHub Actions summary

### Manual Rollback

Maintainers MUST be able to trigger manual rollback via GitHub Actions workflow dispatch. The workflow MUST accept a target deployment ID or commit SHA and MUST perform all necessary rollback steps consistently:

1. Validate rollback target exists in Cloudflare deployment history
2. Trigger Cloudflare Workers rollback via API
3. Update GitHub Deployment status to reflect rollback
4. Verify rollback success via health check
5. Notify maintainers via GitHub Actions summary and related PR comments

Manual rollback SHOULD be used for issues discovered after deployment verification passes (e.g., subtle bugs, performance degradation, user reports).

Rollback MUST NOT require rebuilding, retesting, or code changes. Cloudflare Workers' deployment history provides instant rollback to previous deployments.

**Emergency rollback:** In truly critical situations where the GitHub Actions workflow is unavailable or too slow, maintainers MAY use the Cloudflare Dashboard as a last resort (Workers → Deployments → "Rollback to this deployment"). However, this bypasses workflow tracking and MUST be followed immediately by manual updates to GitHub Deployment records and team notifications.

## Pre-Deployment Requirements

Before any deployment can succeed, certain conditions MUST be satisfied. The CI/CD pipeline enforces these requirements automatically.

### Code Quality Gates

All code merged to `main` MUST meet quality standards:

- Zero TypeScript type errors
- Zero linter errors (when linter is configured)
- Code coverage MUST NOT decrease compared to the previous commit without explicit `coverage-override` approval
- Current coverage thresholds defined in `jest.config.js` (aspirational: 90%+ statement/function coverage)
- All tests passing (unit and E2E)

Pull requests MUST NOT be merged if any quality gate fails (coverage decreases require maintainer approval via override comment).

**Security vulnerabilities in dependencies SHOULD be tracked and addressed separately through dedicated security processes (e.g., Dependabot alerts, security audits) but MUST NOT block deployments.** This prevents situations where a critical bug fix cannot be deployed due to unrelated third-party dependency issues.

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

### Deployment Status Tracking

Deployment status MUST be tracked via the GitHub Deployments API, not PR comments. Each deployment creates a deployment record with environment, commit SHA, and deployment URL. Deployment statuses (in_progress, success, failure) update the deployment record throughout the deployment lifecycle.

Coverage reports and other test-related information MAY be posted as PR comments where appropriate.

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

**[DEFERRED]** Automated changelog generation and GitHub Releases are deferred for future implementation. For now, git commit history and git tags serve as the changelog. If better release documentation is needed in the future, implement a process where:
- Each feature branch records changes in a fragment file
- The production deployment workflow combines fragments into a changelog entry
- Version numbers are automatically incremented based on change types

This level of automation is currently overkill for the project scope. Git commit history and tags provide sufficient traceability.

### Release Markers

When production deployments occur, the deployment workflow SHOULD automatically create git tags for historical reference (e.g., `v25.0.0`).

These tags serve documentation purposes and MUST NOT trigger deployment automation (deployments trigger tags, not the reverse). Tags are the authoritative record of what version was deployed and when.

## Emergency Response

In the event of critical production issues, the following emergency procedures apply.

### Critical Failure Response

If production is non-functional (authentication broken, Workers returning 5xx errors, data corruption):

1. Immediately rollback via GitHub Actions manual rollback workflow (ensures consistent process) or Cloudflare Dashboard (faster but bypasses workflow tracking)
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

See [Deployment](./deployment.md) for environment configuration, infrastructure requirements, and hosting platform details.

See [Testing](./testing.md) for test coverage requirements, test execution standards, and E2E test implementation.

See [Observability](./observability.md) for post-deployment observability, alerting, and metrics collection.
