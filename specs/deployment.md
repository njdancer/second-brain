# Deployment Guide

Prerequisites, setup steps, configuration, and rollback procedures for the Second Brain MCP server.

---

## Prerequisites

### Required Accounts

1. **Cloudflare Account**
   - Workers enabled
   - R2 storage enabled
   - Payment method configured

2. **GitHub Account**
   - For OAuth authentication
   - Note your GitHub user ID

3. **AWS Account**
   - For S3 backup storage
   - IAM user with S3 access

### Required Software

- [mise](https://mise.jdx.dev/) (recommended) - manages Node.js and enables pnpm via corepack
  - Or manually: Node.js 20+ with corepack enabled for pnpm
- Git
- `wrangler` CLI (`pnpm add -g wrangler`)

---

## GitHub OAuth App Setup

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Configure:
   - **Application name:** Second Brain MCP
   - **Homepage URL:** `https://second-brain.your-domain.workers.dev`
   - **Authorization callback URL:** `https://second-brain.your-domain.workers.dev/callback`
4. Click "Register application"
5. Note the **Client ID**
6. Generate a new **Client Secret** and save it securely

### Get Your GitHub User ID

```bash
# Replace YOUR_USERNAME with your GitHub username
curl https://api.github.com/users/YOUR_USERNAME | jq .id
```

Or visit: `https://api.github.com/users/YOUR_USERNAME`

---

## Initial Setup

### 1. Clone and Install

**Option A: Using mise (Recommended)**

```bash
git clone <repo-url>
cd second-brain-mcp

# Install mise if not already installed
# macOS/Linux: curl https://mise.run | sh
# Windows: See https://mise.jdx.dev/getting-started.html

# Install Node.js 20 (defined in .mise.toml)
mise install

# Enable corepack for pnpm
mise run setup

# Install dependencies
pnpm install
```

**Option B: Manual Setup**

```bash
git clone <repo-url>
cd second-brain-mcp

# Ensure Node.js 20+ is installed
node --version

# Enable corepack
corepack enable

# Install dependencies (corepack uses packageManager field in package.json)
pnpm install
```

### 2. Create R2 Buckets

```bash
# Production bucket
wrangler r2 bucket create second-brain

# Development bucket
wrangler r2 bucket create second-brain-dev
```

### 3. Create KV Namespaces

```bash
# Production namespaces
wrangler kv:namespace create OAUTH_KV
wrangler kv:namespace create RATE_LIMIT_KV

# Development namespaces
wrangler kv:namespace create OAUTH_KV --preview
wrangler kv:namespace create RATE_LIMIT_KV --preview
```

Note the namespace IDs returned by these commands.

### 4. Configure wrangler.toml

Update `wrangler.toml` with your values:

```toml
name = "second-brain-mcp"
main = "src/index.ts"
compatibility_date = "2024-10-01"

[vars]
GITHUB_ALLOWED_USER_ID = "12345678"  # Your GitHub user ID

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "second-brain"

[[kv_namespaces]]
binding = "OAUTH_KV"
id = "abc123..."  # From step 3

[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "def456..."  # From step 3

[triggers]
crons = ["0 2 * * *"]

[env.development]
vars = { GITHUB_ALLOWED_USER_ID = "12345678" }

[[env.development.r2_buckets]]
binding = "STORAGE"
bucket_name = "second-brain-dev"

[[env.development.kv_namespaces]]
binding = "OAUTH_KV"
id = "dev-abc123..."

[[env.development.kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "dev-def456..."
```

### 5. Set Production Secrets

```bash
# GitHub OAuth
wrangler secret put GITHUB_CLIENT_ID
# Paste your GitHub OAuth App client ID

wrangler secret put GITHUB_CLIENT_SECRET
# Paste your GitHub OAuth App client secret

# Cookie encryption (generate random 32-byte hex)
openssl rand -hex 32
wrangler secret put COOKIE_ENCRYPTION_KEY
# Paste the generated hex string

# AWS S3 Backup (if using)
wrangler secret put S3_BACKUP_ACCESS_KEY
# Paste AWS access key

wrangler secret put S3_BACKUP_SECRET_KEY
# Paste AWS secret key

wrangler secret put S3_BACKUP_BUCKET
# Paste S3 bucket name (e.g., my-second-brain-backup)

wrangler secret put S3_BACKUP_REGION
# Paste AWS region (e.g., us-east-1)
```

### 6. Set Development Secrets (Optional)

```bash
# Same as production but for dev environment
wrangler secret put GITHUB_CLIENT_ID --env development
wrangler secret put GITHUB_CLIENT_SECRET --env development
wrangler secret put COOKIE_ENCRYPTION_KEY --env development
# ... etc
```

---

## Deployment

### Run Tests

```bash
pnpm test
```

Ensure all tests pass before deploying.

### Deploy to Development

```bash
wrangler deploy --env development
```

Note the deployed URL (e.g., `https://second-brain-mcp.dev.your-subdomain.workers.dev`)

### Test Development Deployment

1. Configure Claude to connect to dev URL
2. Complete OAuth flow
3. Test all tools (read, write, edit, glob, grep)
4. Verify bootstrap files created
5. Check rate limiting
6. Test backup trigger (if configured)

### Deploy to Production

```bash
wrangler deploy
```

Note the production URL (e.g., `https://second-brain-mcp.your-subdomain.workers.dev`)

### Tag Release

```bash
git tag -a v1.0.0 -m "Initial release"
git push origin v1.0.0
```

---

## Claude Configuration

### Desktop/Web Client

1. Open Claude Settings
2. Go to Integrations → MCP Servers
3. Click "Add MCP Server"
4. Configure:
   - **Name:** Second Brain
   - **URL:** `https://second-brain-mcp.your-subdomain.workers.dev/sse`
   - **OAuth Client ID:** (from GitHub OAuth App)
   - **OAuth Client Secret:** (from GitHub OAuth App)
5. Click "Connect"
6. Complete OAuth flow in browser
7. Approve MCP access
8. Server appears in tools list

### Mobile Client

Same steps as desktop, but OAuth flow opens in mobile browser.

---

## Verification

### Check Deployment Status

```bash
wrangler deployments list
```

### View Logs

```bash
wrangler tail
```

### Test Tool Calls

In Claude, try:
- "List files in my second brain" (triggers `glob`)
- "Create a note about testing" (triggers `write`)
- "Read the README" (triggers `read`)
- "Search for 'test'" (triggers `grep`)

### Check R2 Contents

```bash
wrangler r2 object list second-brain
```

Should see bootstrap files if this is first connection.

### Check KV Contents

```bash
# List OAuth tokens
wrangler kv:key list --binding OAUTH_KV

# Check rate limits
wrangler kv:key list --binding RATE_LIMIT_KV
```

---

## Rollback Procedures

### Automated Rollback via GitHub Actions

**Setup:** Create `.github/workflows/rollback.yml`:

```yaml
name: Rollback Deployment

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Deployment version to rollback to'
        required: true
        type: string

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.version }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test

      - name: Deploy to production
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Notify rollback
        run: echo "Rolled back to version ${{ inputs.version }}"
```

**Trigger Rollback:**

1. Go to GitHub → Actions → Rollback Deployment
2. Click "Run workflow"
3. Enter version tag (e.g., `v1.0.0`)
4. Click "Run workflow"

Tests run automatically before rollback is deployed.

### Manual Rollback

```bash
# 1. Checkout previous version
git checkout v1.0.0

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Run tests
pnpm test

# 4. Deploy
wrangler deploy

# 5. Verify
wrangler tail
```

### Cloudflare Dashboard Rollback

1. Go to Cloudflare Dashboard
2. Workers & Pages → second-brain-mcp
3. Deployments tab
4. Click "..." on previous deployment
5. Click "Rollback to this deployment"

**Note:** Last 10 deployments available for rollback.

---

## Continuous Deployment

### GitHub Actions Setup

**`.github/workflows/test.yml`** (CI):

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

**`.github/workflows/deploy.yml`** (CD):

```yaml
name: Deploy

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

      - name: Deploy to production
        if: startsWith(github.ref, 'refs/tags/v')
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Deploy to development
        if: github.ref == 'refs/heads/main'
        run: npx wrangler deploy --env development
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN` - From Cloudflare Dashboard → API Tokens

---

## Monitoring Setup

### Cloudflare Analytics

Automatically enabled - view in Cloudflare Dashboard:
- Workers & Pages → second-brain-mcp → Metrics

### Custom Alerts

Configure in Cloudflare Dashboard → Notifications:
- Error rate threshold
- Request rate spikes
- CPU/memory limits

See [Monitoring](./monitoring.md) for detailed metrics.

---

## Backup Configuration

### AWS S3 Setup

```bash
# Create S3 bucket
aws s3 mb s3://my-second-brain-backup

# Create IAM user with S3 access
aws iam create-user --user-name second-brain-backup

# Attach S3 full access policy (or create custom policy)
aws iam attach-user-policy \
  --user-name second-brain-backup \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Create access keys
aws iam create-access-key --user-name second-brain-backup
```

Save the access key ID and secret access key for wrangler secrets.

### Manual Backup Trigger

```bash
curl -X POST \
  https://second-brain-mcp.your-subdomain.workers.dev/admin/backup \
  -H "Authorization: Bearer YOUR_OAUTH_TOKEN"
```

---

## Troubleshooting

### OAuth Fails

- Verify GitHub OAuth App callback URL matches worker URL
- Check `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` secrets
- Ensure `GITHUB_ALLOWED_USER_ID` matches your GitHub user ID
- Check browser console for errors

### Tools Don't Work

- Verify R2 bucket exists and binding is correct
- Check KV namespaces exist and IDs match wrangler.toml
- View logs: `wrangler tail`
- Test with simple operations first (read README.md)

### Rate Limits Hit Immediately

- Check `RATE_LIMIT_KV` is configured correctly
- Verify no stale entries: `wrangler kv:key list --binding RATE_LIMIT_KV`
- Delete test entries: `wrangler kv:key delete "rate_limit:..." --binding RATE_LIMIT_KV`

### Backup Fails

- Verify AWS credentials are correct
- Check S3 bucket exists and is accessible
- View cron logs: `wrangler tail --format json | grep cron`
- Test manual backup: `POST /admin/backup`

---

## Maintenance

### Update Dependencies

```bash
pnpm update
pnpm audit --fix
pnpm test
wrangler deploy --env development
# Test thoroughly
wrangler deploy
```

### Update Node.js Version (if using mise)

```bash
# Edit .mise.toml to change Node version
# Then run:
mise install
mise run setup
pnpm install
```

### Rotate Secrets

```bash
# Generate new encryption key
openssl rand -hex 32

# Update secret
wrangler secret put COOKIE_ENCRYPTION_KEY
# Note: Existing tokens will be invalid

# Or rotate GitHub OAuth credentials
# 1. Generate new secret in GitHub OAuth App
# 2. Update wrangler secret
wrangler secret put GITHUB_CLIENT_SECRET
```

### Clean Up Old Data

```bash
# List all files
wrangler r2 object list second-brain

# Delete specific file
wrangler r2 object delete second-brain/path/to/file.md

# Clean up rate limit entries (if needed)
wrangler kv:key delete "rate_limit:..." --binding RATE_LIMIT_KV
```

---

## Related Documentation

- [Architecture](./architecture.md) - System design
- [Security](./security.md) - Authentication setup
- [Monitoring](./monitoring.md) - Observability
- [Testing](./testing.md) - Testing strategy
