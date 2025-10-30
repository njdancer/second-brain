# Proposed Combined Deployment Workflow

## Overview

This combines the `deploy-development.yml` and `deploy-production.yml` workflows into a single pipeline that:

1. **Development (Preprod)**: Deploys to dev environment
2. **Health Check**: Validates dev deployment
3. **Production**: Automatically promotes to production if dev health checks pass
4. **Versioning**: Auto-generates version tags (defaults to hotfix for incremental changes)

## Key Changes

### Before (Separate Workflows)

```
Push to main → deploy-development.yml → Dev deployment
Manual trigger → deploy-production.yml → Prod deployment
```

### After (Combined Workflow)

```
Push to main → deploy-combined.yml:
  1. Dev deployment (preprod)
  2. Health check (dev)
  3. Prod deployment (automatic)
  4. Health check (prod)
  5. Create tag & release
```

## Features

- ✅ **Preprod validation**: Dev becomes a preprod environment
- ✅ **Automatic promotion**: No manual trigger needed for production
- ✅ **Health checks**: Both environments validated
- ✅ **Automatic rollback**: On health check failure
- ✅ **Version management**: Auto-increments from git tags
- ✅ **Manual approval (commented)**: Ready for when you need it
- ✅ **Hotfix mode support**: Blocks dev deploys during hotfix PRs

## Default Deployment Type

Auto-deployments from `main` default to **hotfix** (incremental version bumps):
- `v25.1.0` → `v25.1.1` (hotfix)
- `v25.1.1` → `v25.1.2` (hotfix)

For major releases, you can still manually trigger the production workflow with `deployment_type: release`.

## When You Want Manual Approval

To add a manual approval step before production:

1. Uncomment the `approve-production` job (lines 365-376)
2. Update `deploy-production` job's `needs` to include `approve-production` (line 381)
3. Create a `production-approval` environment in GitHub with required reviewers

## Migration Steps

1. **Test the combined workflow**:
   ```bash
   # Push a small change to main
   git push origin main

   # Watch the workflow:
   # - Should deploy to dev
   # - Run health checks
   # - Promote to production
   # - Create tag and release
   ```

2. **If successful, move the workflow**:
   ```bash
   # Backup old workflows
   mkdir -p .github/workflows-old
   mv .github/workflows/deploy-development.yml .github/workflows-old/
   mv .github/workflows/deploy-production.yml .github/workflows-old/

   # Move new workflow into place
   mv .github/workflows-proposed/deploy-combined.yml .github/workflows/

   # Commit
   git add .github/workflows*
   git commit -m "feat: combine deployment workflows (dev → prod pipeline)"
   git push origin main
   ```

3. **Delete old workflows after confirming**:
   ```bash
   rm -rf .github/workflows-old
   git add .github/workflows-old
   git commit -m "chore: remove old deployment workflows"
   git push origin main
   ```

## Workflow Files to Delete

After successful migration:
- `.github/workflows/deploy-development.yml` - Replaced by combined workflow
- `.github/workflows/deploy-production.yml` - Replaced by combined workflow

## Workflow Files to Keep

- `.github/workflows/create-hotfix.yml` - Still needed for hotfix creation
- `.github/workflows/rollback.yml` - Still needed for manual rollbacks
- `.github/workflows/test.yml` - Test-only workflow
- `.github/workflows/claude.yml` - Claude Code automation

## Future Considerations

When you go public and want stricter production controls:

1. Uncomment the manual approval job
2. Configure reviewers in GitHub environment settings
3. Consider changing default deployment type from "hotfix" to require explicit choice
4. Add more sophisticated health checks (load tests, smoke tests, etc.)

## Notes

- The combined workflow automatically detects hotfix branches (`hotfix/**`)
- Development deployments are blocked during active hotfix PRs
- Tags are only created after successful production deployment
- Automatic rollback triggers if production health checks fail
- Coverage reports still run and track trends
