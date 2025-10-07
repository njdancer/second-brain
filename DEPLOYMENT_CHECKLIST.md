# Deployment Checklist

Use this checklist to ensure all deployment steps are completed correctly.

---

## Pre-Deployment

### Repository Setup
- [ ] Repository cloned locally
- [ ] All tests passing (`pnpm test`)
- [ ] Type checking passes (`pnpm run type-check`)
- [ ] Coverage meets 95%+ threshold
- [ ] All code committed and pushed to main branch

### GitHub Configuration
- [ ] Repository created on GitHub
- [ ] Secrets configured in GitHub repository settings:
  - [ ] `CLOUDFLARE_API_TOKEN`
  - [ ] `CLOUDFLARE_ACCOUNT_ID`
  - [ ] `CODECOV_TOKEN` (optional, for coverage reports)
- [ ] GitHub Actions workflows tested (test.yml runs on push)

---

## Cloudflare Setup

### Account Configuration
- [ ] Cloudflare account created
- [ ] Workers enabled on account
- [ ] R2 storage enabled on account
- [ ] Payment method configured
- [ ] API token created with permissions:
  - [ ] Workers Scripts: Edit
  - [ ] Workers KV Storage: Edit
  - [ ] R2 Storage: Edit

### R2 Buckets
- [ ] Production bucket created: `second-brain`
  ```bash
  wrangler r2 bucket create second-brain
  ```
- [ ] Development bucket created: `second-brain-dev`
  ```bash
  wrangler r2 bucket create second-brain-dev
  ```

### KV Namespaces

**Production:**
- [ ] OAuth KV namespace created
  ```bash
  wrangler kv:namespace create OAUTH_KV
  ```
  - Namespace ID: `______________`

- [ ] Rate limit KV namespace created
  ```bash
  wrangler kv:namespace create RATE_LIMIT_KV
  ```
  - Namespace ID: `______________`

**Development:**
- [ ] OAuth KV namespace created (dev)
  ```bash
  wrangler kv:namespace create OAUTH_KV --preview
  ```
  - Namespace ID: `______________`

- [ ] Rate limit KV namespace created (dev)
  ```bash
  wrangler kv:namespace create RATE_LIMIT_KV --preview
  ```
  - Namespace ID: `______________`

### wrangler.toml Configuration
- [ ] Updated `wrangler.toml` with KV namespace IDs
- [ ] Updated R2 bucket names
- [ ] Configured GitHub user ID in vars
- [ ] Verified cron trigger configuration (`0 2 * * *`)
- [ ] Verified development environment configuration

### Secrets (Production)
- [ ] `GITHUB_CLIENT_ID` set
  ```bash
  wrangler secret put GITHUB_CLIENT_ID
  ```
- [ ] `GITHUB_CLIENT_SECRET` set
  ```bash
  wrangler secret put GITHUB_CLIENT_SECRET
  ```
- [ ] `COOKIE_ENCRYPTION_KEY` set (generate with `openssl rand -hex 32`)
  ```bash
  wrangler secret put COOKIE_ENCRYPTION_KEY
  ```
- [ ] `S3_BACKUP_ACCESS_KEY` set (if using S3 backups)
  ```bash
  wrangler secret put S3_BACKUP_ACCESS_KEY
  ```
- [ ] `S3_BACKUP_SECRET_KEY` set (if using S3 backups)
  ```bash
  wrangler secret put S3_BACKUP_SECRET_KEY
  ```
- [ ] `S3_BACKUP_BUCKET` set (if using S3 backups)
  ```bash
  wrangler secret put S3_BACKUP_BUCKET
  ```
- [ ] `S3_BACKUP_REGION` set (if using S3 backups)
  ```bash
  wrangler secret put S3_BACKUP_REGION
  ```

### Secrets (Development)
- [ ] Development secrets configured (same as production)
  ```bash
  wrangler secret put GITHUB_CLIENT_ID --env development
  wrangler secret put GITHUB_CLIENT_SECRET --env development
  wrangler secret put COOKIE_ENCRYPTION_KEY --env development
  # ... etc
  ```

---

## GitHub OAuth App Setup

### Create OAuth App
- [ ] Navigate to GitHub Settings → Developer settings → OAuth Apps
- [ ] Click "New OAuth App"
- [ ] Configure application:
  - Application name: `Second Brain MCP`
  - Homepage URL: `https://second-brain.your-subdomain.workers.dev`
  - Authorization callback URL: `https://second-brain.your-subdomain.workers.dev/oauth/callback`
- [ ] Register application
- [ ] Copy Client ID
- [ ] Generate and copy Client Secret

### Get GitHub User ID
- [ ] Get your GitHub user ID:
  ```bash
  curl https://api.github.com/users/YOUR_USERNAME | jq .id
  ```
- [ ] Record user ID: `______________`
- [ ] Update `wrangler.toml` with your user ID

---

## AWS S3 Setup (Optional but Recommended)

### S3 Bucket
- [ ] AWS account created
- [ ] S3 bucket created for backups
  - Bucket name: `______________`
  - Region: `______________`
- [ ] Bucket versioning enabled (recommended)
- [ ] Lifecycle policy configured (30-day retention)

### IAM User
- [ ] IAM user created for Second Brain backups
- [ ] Policy attached with S3 write permissions:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ],
        "Resource": [
          "arn:aws:s3:::YOUR-BUCKET-NAME",
          "arn:aws:s3:::YOUR-BUCKET-NAME/*"
        ]
      }
    ]
  }
  ```
- [ ] Access key generated
- [ ] Access key ID: `______________`
- [ ] Secret access key saved securely

---

## Development Deployment

### Deploy to Development
- [ ] Tests pass locally
  ```bash
  pnpm test
  ```
- [ ] Type check passes
  ```bash
  pnpm run type-check
  ```
- [ ] Deploy to development environment
  ```bash
  pnpm run deploy:dev
  ```
- [ ] Record development URL: `______________`

### Test Development Deployment
- [ ] Health endpoint accessible: `/health` returns 200
- [ ] OAuth flow works:
  - [ ] Navigate to `/oauth/authorize`
  - [ ] Redirected to GitHub
  - [ ] Authorize application
  - [ ] Redirected back to callback
  - [ ] Token stored successfully
- [ ] Configure MCP client to connect to dev worker URL
- [ ] Bootstrap files created on first connection:
  - [ ] `/README.md` exists
  - [ ] `/projects/README.md` exists
  - [ ] `/areas/README.md` exists
  - [ ] `/resources/README.md` exists
  - [ ] `/archives/README.md` exists
- [ ] Test all tools:
  - [ ] **write**: Create a test note
  - [ ] **read**: Read the test note
  - [ ] **edit**: Modify the test note
  - [ ] **glob**: Search for files
  - [ ] **grep**: Search file contents
  - [ ] **edit** (move): Rename/move a file
  - [ ] **edit** (delete): Delete a file
- [ ] Rate limiting works:
  - [ ] Make requests up to limit
  - [ ] Verify 429 response after limit exceeded
- [ ] Storage quota enforcement:
  - [ ] Create files approaching quota
  - [ ] Verify 507 response when quota exceeded
- [ ] Manual backup trigger (if endpoint implemented):
  ```bash
  curl -X POST https://your-dev-url.workers.dev/admin/backup \
    -H "Authorization: Bearer YOUR_TOKEN"
  ```

### Development Testing Checklist
- [ ] All tools functional
- [ ] Error messages appropriate
- [ ] Performance acceptable (p95 <500ms)
- [ ] No console errors in client
- [ ] Monitoring data visible in Cloudflare Analytics

---

## Production Deployment

### Pre-Production Checks
- [ ] All development tests passed
- [ ] No critical bugs identified
- [ ] CHANGELOG.md updated with release notes
- [ ] Version number decided: `______________`
- [ ] All documentation reviewed and up-to-date

### Deploy to Production
- [ ] Create version tag
  ```bash
  git tag -a v1.0.0 -m "Release v1.0.0"
  git push origin v1.0.0
  ```
- [ ] Monitor GitHub Actions deployment workflow
- [ ] Verify deployment completed successfully
- [ ] Record production URL: `______________`

### Verify Production Deployment
- [ ] Health check passes
  ```bash
  curl https://your-production-url.workers.dev/health
  ```
- [ ] OAuth flow works in production
- [ ] Connect Claude client to production URL
- [ ] Bootstrap files created
- [ ] All tools functional
- [ ] Performance metrics within targets:
  - [ ] p50 <200ms
  - [ ] p95 <500ms
  - [ ] p99 <1000ms

### Post-Deployment
- [ ] GitHub release created (automatically by deploy.yml)
- [ ] Release notes published
- [ ] Production URL documented
- [ ] Monitoring dashboard configured
- [ ] Alerts configured in Cloudflare:
  - [ ] Error rate >5%
  - [ ] Storage approaching limit
  - [ ] Request spikes
- [ ] Backup verified (wait 24 hours for first cron run)

---

## Claude Client Configuration

### Desktop Client
- [ ] Add MCP server configuration to `~/.claude/config.json`:
  ```json
  {
    "mcpServers": {
      "second-brain": {
        "url": "https://your-production-url.workers.dev/sse",
        "name": "Second Brain",
        "description": "Personal knowledge management using BASB"
      }
    }
  }
  ```
- [ ] Restart Claude desktop app
- [ ] Complete OAuth authentication
- [ ] Verify tools appear in Claude

### Mobile Client
- [ ] Configure MCP server in mobile app settings
- [ ] Complete OAuth authentication
- [ ] Test note capture workflow
- [ ] Verify sync with desktop

### Web Client
- [ ] Configure MCP server (if supported)
- [ ] Complete OAuth authentication
- [ ] Test basic operations

---

## Monitoring & Observability

### Cloudflare Dashboard
- [ ] Access Workers analytics
- [ ] Verify request metrics visible
- [ ] Verify error rates acceptable
- [ ] Check R2 storage usage

### Analytics Engine
- [ ] Tool usage metrics tracked
- [ ] Response time metrics tracked (p50, p95, p99)
- [ ] Error rates tracked by code
- [ ] Storage usage tracked
- [ ] Rate limit hits tracked

### Logs
- [ ] Review worker logs for errors
- [ ] Verify no PII in logs
- [ ] Confirm appropriate log levels

---

## Backup Verification

### First Backup (Wait 24 hours)
- [ ] Cron job executed at 2 AM UTC
- [ ] Check S3 bucket for backup:
  ```bash
  aws s3 ls s3://your-backup-bucket/backups/$(date +%Y-%m-%d)/
  ```
- [ ] Verify all files backed up
- [ ] Verify backup structure preserved
- [ ] Check backup metrics in logs

### Backup Recovery Test
- [ ] Download backup from S3
- [ ] Verify files readable
- [ ] Test restore procedure (documented in deployment.md)

---

## Rollback Preparation

### Document Current State
- [ ] Production version: `______________`
- [ ] Deployment timestamp: `______________`
- [ ] Known issues: `______________`

### Test Rollback Procedure
- [ ] Review rollback workflow (`.github/workflows/rollback.yml`)
- [ ] Understand rollback process
- [ ] Identify rollback contact (if team)

---

## Documentation

### User Documentation
- [ ] User guide accessible
- [ ] Getting started guide clear
- [ ] Example workflows documented
- [ ] Troubleshooting guide available

### Developer Documentation
- [ ] CONTRIBUTING.md complete
- [ ] PLAN.md up to date
- [ ] CHANGELOG.md updated
- [ ] All specs reviewed

### Operational Documentation
- [ ] Deployment procedure documented
- [ ] Rollback procedure documented
- [ ] Monitoring guide available
- [ ] Incident response plan created

---

## Security Review

### Pre-Production Security Checklist
- [ ] All secrets properly configured (not in code)
- [ ] OAuth flow tested and secure
- [ ] Rate limiting enforced
- [ ] Storage quotas enforced
- [ ] Input validation comprehensive
- [ ] Path validation prevents traversal
- [ ] No PII in logs
- [ ] HTTPS/TLS enforced
- [ ] User authorization working (allowlist)
- [ ] Token encryption working
- [ ] No security warnings in dependencies

---

## Sign-Off

### Stakeholder Approval
- [ ] Technical review complete
- [ ] Security review complete
- [ ] Documentation review complete
- [ ] Go/no-go decision: **GO** / NO-GO

### Deployment Approval
- **Approved by:** `______________`
- **Date:** `______________`
- **Version:** `______________`

---

## Post-Launch (First Week)

### Day 1
- [ ] Monitor error rates (should be <1%)
- [ ] Monitor response times (p95 <500ms)
- [ ] Check OAuth success rate
- [ ] Verify no critical issues

### Day 2-7
- [ ] Daily backup verified
- [ ] Storage usage monitored
- [ ] Rate limit hits reviewed
- [ ] User feedback collected
- [ ] Performance metrics reviewed

### Week 1 Summary
- [ ] Create week 1 report
- [ ] Document any issues encountered
- [ ] Plan any necessary adjustments
- [ ] Update documentation as needed

---

## Success Criteria

### Functional
- [x] User can connect Claude to MCP server
- [x] User can capture notes on mobile
- [x] User can search notes on desktop
- [x] User can organize notes using PARA
- [x] User can retrieve past notes
- [x] Rate limits prevent abuse
- [x] Storage limits prevent cost escalation
- [x] Backups protect data

### Technical
- [x] All tests passing (95%+ coverage)
- [ ] No critical security vulnerabilities
- [ ] Error rate <1%
- [ ] Response time p95 <500ms
- [ ] Zero data loss incidents
- [ ] Successful backup every day

### Quality
- [x] Code reviewed
- [x] Documentation complete
- [ ] Deployment successful
- [x] User guide clear
- [ ] Known issues documented

---

**Status:** Ready for deployment
**Next Steps:** Begin Cloudflare setup and GitHub OAuth App creation
**Reference:** See [Deployment Guide](specs/deployment.md) for detailed instructions
