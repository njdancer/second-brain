# Setup Guide

Configuration and deployment instructions for the Second Brain MCP server.

---

## Wrangler Configuration

### `wrangler.toml`

```toml
name = "second-brain-mcp"
main = "src/index.ts"
compatibility_date = "2024-10-01"

[vars]
# Get GitHub user ID from: https://api.github.com/users/YOUR_USERNAME
# or check your GitHub profile URL
GITHUB_ALLOWED_USER_ID = "your-github-user-id"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "second-brain"

[[kv_namespaces]]
binding = "OAUTH_KV"
id = "your-oauth-kv-namespace-id"

[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-rate-limit-kv-namespace-id"

[triggers]
crons = ["0 2 * * *"]  # Daily backup at 2 AM UTC

[env.development]
vars = { GITHUB_ALLOWED_USER_ID = "dev-user-id" }

[[env.development.r2_buckets]]
binding = "STORAGE"
bucket_name = "second-brain-dev"

[[env.development.kv_namespaces]]
binding = "OAUTH_KV"
id = "dev-oauth-kv-namespace-id"

[[env.development.kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "dev-rate-limit-kv-namespace-id"
```

---

## Secrets Configuration

Set via `wrangler secret put`:

| Secret | Description | How to Generate |
|--------|-------------|-----------------|
| `GITHUB_CLIENT_ID` | OAuth App client ID | From GitHub OAuth App settings |
| `GITHUB_CLIENT_SECRET` | OAuth App client secret | From GitHub OAuth App settings |
| `COOKIE_ENCRYPTION_KEY` | 32-byte hex string | `openssl rand -hex 32` |
| `S3_BACKUP_ACCESS_KEY` | AWS access key | From AWS IAM user |
| `S3_BACKUP_SECRET_KEY` | AWS secret key | From AWS IAM user |
| `S3_BACKUP_BUCKET` | S3 bucket name | Your backup bucket name |
| `S3_BACKUP_REGION` | AWS region | e.g., `us-east-1` |

### Setting Secrets

```bash
# GitHub OAuth credentials
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET

# Cookie encryption
openssl rand -hex 32 | wrangler secret put COOKIE_ENCRYPTION_KEY

# S3 backup credentials
wrangler secret put S3_BACKUP_ACCESS_KEY
wrangler secret put S3_BACKUP_SECRET_KEY
wrangler secret put S3_BACKUP_BUCKET
wrangler secret put S3_BACKUP_REGION
```

---

## Environment Variables

### Required

| Variable | Type | Description |
|----------|------|-------------|
| `GITHUB_ALLOWED_USER_ID` | string | GitHub user ID allowed to access MCP |
| `STORAGE` | R2Bucket | R2 bucket binding |
| `OAUTH_KV` | KVNamespace | KV for OAuth tokens |
| `RATE_LIMIT_KV` | KVNamespace | KV for rate limiting |

### Getting GitHub User ID

```bash
# From GitHub API
curl https://api.github.com/users/YOUR_USERNAME | jq .id

# Or check your GitHub profile URL
# Example: https://github.com/users/YOUR_USERNAME -> ID in response
```

---

## Cloudflare Resources Setup

### 1. Create R2 Bucket

```bash
# Production
wrangler r2 bucket create second-brain

# Development
wrangler r2 bucket create second-brain-dev
```

### 2. Create KV Namespaces

```bash
# OAuth KV (production)
wrangler kv:namespace create "OAUTH_KV"

# OAuth KV (development)
wrangler kv:namespace create "OAUTH_KV" --preview

# Rate Limit KV (production)
wrangler kv:namespace create "RATE_LIMIT_KV"

# Rate Limit KV (development)
wrangler kv:namespace create "RATE_LIMIT_KV" --preview
```

Copy the namespace IDs from the output into your `wrangler.toml`.

### 3. Create GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name:** Second Brain MCP
   - **Homepage URL:** `https://second-brain-mcp.YOUR_SUBDOMAIN.workers.dev`
   - **Authorization callback URL:** `https://second-brain-mcp.YOUR_SUBDOMAIN.workers.dev/callback`
4. Click "Register application"
5. Copy the Client ID and generate a Client Secret
6. Set secrets via `wrangler secret put`

---

## AWS S3 Backup Setup

### 1. Create S3 Bucket

```bash
aws s3 mb s3://second-brain-backups --region us-east-1
```

### 2. Create IAM User

```bash
aws iam create-user --user-name second-brain-backup
```

### 3. Create IAM Policy

Create `backup-policy.json`:

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
        "arn:aws:s3:::second-brain-backups",
        "arn:aws:s3:::second-brain-backups/*"
      ]
    }
  ]
}
```

Apply the policy:

```bash
aws iam put-user-policy --user-name second-brain-backup \
  --policy-name BackupAccess \
  --policy-document file://backup-policy.json
```

### 4. Create Access Keys

```bash
aws iam create-access-key --user-name second-brain-backup
```

Copy the AccessKeyId and SecretAccessKey to your secrets configuration.

---

## Deployment

### Development

```bash
pnpm run deploy:dev
```

### Production

Use the release process (creates git tag, triggers GitHub Actions deployment):

```bash
pnpm run release        # Patch version (1.2.3 -> 1.2.4)
pnpm run release:minor  # Minor version (1.2.3 -> 1.3.0)
pnpm run release:major  # Major version (1.2.3 -> 2.0.0)

# Push to deploy
git push origin main --tags
```

See [specs/deployment.md](../specs/deployment.md) for detailed deployment procedures.

---

## Verification

### 1. Test OAuth Flow

```bash
pnpm run test:mcp:oauth
```

This simulates the full Claude desktop/web authentication flow.

### 2. Check Logs

```bash
wrangler tail
```

### 3. Verify Backup Cron

```bash
# Manually trigger backup
curl -X POST https://second-brain-mcp.YOUR_SUBDOMAIN.workers.dev/admin/backup \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Troubleshooting

### OAuth Issues

- Verify GitHub OAuth App callback URL matches your worker URL
- Check `GITHUB_ALLOWED_USER_ID` matches your GitHub user ID
- Ensure `COOKIE_ENCRYPTION_KEY` is set correctly

### Storage Issues

- Check R2 bucket bindings in `wrangler.toml`
- Verify KV namespace IDs are correct
- Check storage quotas (10GB total, 10k files, 10MB per file)

### Backup Issues

- Verify S3 credentials are correct
- Check S3 bucket permissions
- Ensure cron trigger is configured in `wrangler.toml`

---

## Related Documentation

- [Architecture](../specs/architecture.md) - System design
- [Deployment](../specs/deployment.md) - Deployment procedures
- [Security](../specs/security.md) - OAuth and rate limiting
