# Implementation Details

Project structure, dependencies, and configuration for the Second Brain MCP server.

---

## Project Structure

```
second-brain-mcp/
├── .github/
│   └── workflows/
│       ├── deploy.yml           # Production deployment
│       ├── test.yml             # CI testing
│       └── rollback.yml         # Rollback workflow
├── src/
│   ├── index.ts                 # Worker entrypoint
│   ├── oauth-handler.ts         # GitHub OAuth flow
│   ├── mcp-server.ts            # MCP protocol implementation
│   ├── tools/                   # Individual tool implementations
│   │   ├── read.ts
│   │   ├── write.ts
│   │   ├── edit.ts
│   │   ├── glob.ts
│   │   └── grep.ts
│   ├── storage.ts               # R2 operations abstraction
│   ├── backup.ts                # S3 backup integration
│   ├── monitoring.ts            # Metrics and logging
│   └── bootstrap.ts             # Initial file creation
├── test/
│   ├── unit/                    # Unit tests for each module
│   ├── integration/             # Integration tests
│   └── fixtures/                # Test data
├── wrangler.toml                # Cloudflare configuration
├── package.json
└── README.md
```

---

## Dependencies

```json
{
  "dependencies": {
    "@cloudflare/workers-oauth-provider": "1.0.0",
    "@modelcontextprotocol/sdk": "1.0.0",
    "@aws-sdk/client-s3": "3.600.0",
    "hono": "4.5.0",
    "octokit": "3.2.0",
    "zod": "3.23.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "4.20241001.0",
    "@types/jest": "29.5.0",
    "jest": "29.7.0",
    "wrangler": "3.70.0",
    "typescript": "5.5.0",
    "ts-jest": "29.2.0"
  }
}
```

**Note:** Exact versions specified to prevent breaking changes during PoC phase.

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

---

## Rate Limiting Implementation

### Strategy

Use `RATE_LIMIT_KV` namespace with TTL for rate limit counters.

**Key format:** `rate_limit:{user_id}:{window}`

Examples:
- `rate_limit:12345:minute`
- `rate_limit:12345:hour`
- `rate_limit:12345:day`

### Limits

**Per-user rate limits:**
- 100 tool calls per minute
- 1000 tool calls per hour
- 10,000 tool calls per day

**Per-tool specific limits:**
- `write`: Max 1MB file size
- `read`: Max 10MB file size
- `glob`: Max 1000 results
- `grep`: Max 1000 matches

**Storage limits (hard caps to prevent cost escalation):**
- Max 10GB total storage per user
- Max 10,000 files per user
- Max 10MB per individual file

### Response Format

When limit exceeded:
- HTTP Status: `429 Too Many Requests`
- Header: `Retry-After: <seconds>`
- Body: Error details with limit type

Storage limit exceeded:
- HTTP Status: `507 Insufficient Storage`
- Body: Error details with current usage

---

## Backup Strategy

### Automated R2 to S3 Backup

- Daily backup of entire R2 bucket to AWS S3
- Implemented via Cloudflare Cron Trigger
- Uses AWS SDK for S3 to sync files
- Preserves directory structure
- Incremental backups (only changed files)
- Retention: 30 days of daily backups

### Backup Process

1. List all objects in R2
2. For each object, check if it exists in S3 with same ETag
3. If different or missing, copy to S3 with date prefix: `backups/YYYY-MM-DD/path/to/file.md`
4. Log backup statistics to CloudFlare Analytics
5. Clean up backups older than 30 days

### Manual Backup

Users can manually trigger backup via special endpoint: `POST /admin/backup` (requires OAuth token)

---

## Environment Variables

### Required

| Variable | Type | Description |
|----------|------|-------------|
| `GITHUB_ALLOWED_USER_ID` | string | GitHub user ID allowed to access MCP |
| `STORAGE` | R2Bucket | R2 bucket binding |
| `OAUTH_KV` | KVNamespace | KV for OAuth tokens |
| `RATE_LIMIT_KV` | KVNamespace | KV for rate limiting |

### Secrets

All secrets listed above in "Secrets Configuration" section.

---

## Module Responsibilities

### `src/index.ts`
- Hono app initialization
- Route registration
- MCP SSE endpoint
- OAuth callback handlers
- Cron trigger handler (backup)
- Error middleware

### `src/oauth-handler.ts`
- GitHub OAuth flow
- Token generation and validation
- User authorization check (against allowed list)
- Token storage and retrieval from KV
- Refresh token logic

### `src/mcp-server.ts`
- MCP protocol implementation
- Tool registration (read, write, edit, glob, grep)
- Prompt registration (capture-note, weekly-review, research-summary)
- Server metadata
- Request/response formatting

### `src/tools/*.ts`
Each tool module exports:
- Tool specification (name, description, parameters schema)
- Handler function
- Input validation (using Zod)
- R2 operations
- Error handling

### `src/storage.ts`
- R2 API wrapper
- CRUD operations (get, put, delete, list)
- Metadata handling
- Error handling and retries
- Storage quota checks

### `src/backup.ts`
- S3 client initialization
- R2 to S3 sync logic
- Incremental backup (ETag comparison)
- Retention management
- Logging and metrics

### `src/monitoring.ts`
- Analytics Engine integration
- Metric recording helpers
- Error logging
- Performance tracking

### `src/bootstrap.ts`
- Bootstrap file generation
- Idempotency check (README.md existence)
- PARA directory structure creation
- Initial README files

---

## TypeScript Configuration

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types", "jest"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "test"]
}
```

---

## Related Documentation

- [Architecture](./architecture.md) - System design and components
- [API Reference](./api-reference.md) - Tool specifications
- [Security](./security.md) - Authentication and rate limiting
- [Deployment](./deployment.md) - Setup and deployment instructions
- [Testing](./testing.md) - Test strategy and implementation
