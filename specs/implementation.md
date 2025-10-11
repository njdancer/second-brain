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
│   ├── index.ts                 # OAuthProvider root handler
│   ├── oauth-ui-handler.ts      # GitHub OAuth CLIENT (Arctic)
│   ├── mcp-api-handler.ts       # Authenticated MCP endpoint
│   ├── mcp-transport.ts         # MCP protocol + tool registration
│   ├── logger.ts                # Structured logging (NEW)
│   ├── monitoring.ts            # Analytics Engine integration
│   ├── tools/                   # Tool implementations
│   │   ├── read.ts
│   │   ├── write.ts
│   │   ├── edit.ts
│   │   ├── glob.ts
│   │   └── grep.ts
│   ├── storage.ts               # R2 operations abstraction
│   ├── rate-limiting.ts         # KV-based rate limiting
│   ├── backup.ts                # S3 backup integration
│   ├── bootstrap.ts             # Initial file creation
│   └── archive/                 # Archived implementations
│       └── oauth-handler-v1.2.3.ts  # Old hand-rolled OAuth
├── test/
│   ├── unit/                    # Unit tests for each module
│   ├── integration/             # Integration tests
│   ├── fixtures/                # Test data
│   └── archive/                 # Archived tests
├── specs/                       # Technical documentation
├── wrangler.toml                # Cloudflare configuration
├── package.json
└── README.md
```

**Key Changes from Previous Architecture:**
- Removed Hono dependency (direct Fetch API handlers)
- Added `logger.ts` for structured logging
- Separated OAuth UI handler (`oauth-ui-handler.ts`) from API handler (`mcp-api-handler.ts`)
- Created `archive/` for deleted code (git history recovery)

---

## Dependencies

```json
{
  "dependencies": {
    "@cloudflare/workers-oauth-provider": "0.0.11",
    "@modelcontextprotocol/sdk": "1.0.4",
    "@aws-sdk/client-s3": "3.600.0",
    "arctic": "3.7.0",
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

**Key Libraries:**
- **OAuthProvider** - OAuth 2.1 server with PKCE (Cloudflare official)
- **Arctic** - OAuth 2.0 client for GitHub authentication
- **MCP SDK** - Model Context Protocol implementation
- **Zod** - Runtime type validation for tool parameters
- **AWS SDK** - S3 backup integration

**Removed Dependencies:**
- `hono` - Replaced with direct Fetch API handlers (unnecessary abstraction)
- `octokit` - Replaced with Arctic for GitHub OAuth

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
- OAuthProvider configuration and export (root handler)
- OAuth endpoint configuration (`/authorize`, `/token`, `/register`)
- Routes `/mcp` to MCP API handler
- Routes default to GitHub OAuth UI handler
- Cron trigger handler (backup)

### `src/oauth-ui-handler.ts`
- GitHub OAuth CLIENT flow (Arctic library)
- `/authorize` - Parse MCP request, redirect to GitHub
- `/callback` - Exchange code, verify user, complete MCP OAuth
- User authorization check against allowlist
- State management (encodes MCP OAuth params)
- Direct Fetch API handlers (no framework)

### `src/mcp-api-handler.ts`
- Authenticated MCP request handling
- Props extraction from OAuthProvider context
- Rate limiting enforcement
- MCP transport initialization
- Session management
- Request logging with correlation IDs
- Direct Fetch API handlers (no framework)

### `src/mcp-transport.ts`
- MCP protocol implementation
- StreamableHTTPServerTransport adapter for Workers
- Tool registration (read, write, edit, glob, grep)
- Prompt registration (capture-note, weekly-review, research-summary)
- Server metadata
- Request/response formatting

### `src/logger.ts` (NEW)
- Structured JSON logging for Cloudflare Workers Logs
- Request correlation via UUID requestId generation
- Log level filtering (DEBUG, INFO, WARN, ERROR)
- Context propagation (userId, requestId, tool, duration, etc.)
- Child logger creation for component-specific logging
- Error stack trace preservation
- Integration with Cloudflare Workers Logs

**Usage Example:**

```typescript
import { Logger, generateRequestId } from './logger.js';

// Create root logger with request ID
const requestId = generateRequestId();
const logger = new Logger({ requestId });

// Log at different levels
logger.info('Request started', { method: 'POST', url: '/mcp' });
logger.debug('Extracting props from context');
logger.warn('Approaching rate limit', { current: 95, limit: 100 });

// Create child logger with additional context
const userLogger = logger.child({ userId: '12345', githubLogin: 'user' });
userLogger.info('User authenticated');

// Log errors with stack traces
try {
  // ... operation
} catch (error) {
  logger.error('Operation failed', error as Error, { operation: 'write' });
}

// Track operation duration
const startTime = Date.now();
// ... operation
const duration = Date.now() - startTime;
logger.info('Operation completed', { duration });
```

**Output Format:**

All logs are output as JSON for structured logging:

```json
{
  "timestamp": "2025-10-11T12:34:56.789Z",
  "level": "INFO",
  "message": "User authenticated",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "userId": "12345",
  "githubLogin": "user"
}
```

Error logs include stack traces:

```json
{
  "timestamp": "2025-10-11T12:34:56.789Z",
  "level": "ERROR",
  "message": "Operation failed",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "operation": "write",
  "error": "File not found",
  "stack": "Error: File not found\n    at write (src/tools/write.ts:42:10)\n    ..."
}
```

**Best Practices:**

1. **Always generate requestId at entry points** (mcp-api-handler, oauth-ui-handler)
2. **Create child loggers for context propagation** (don't repeat context in every log call)
3. **Include duration for performance tracking** (use Date.now() timestamps)
4. **Log errors with stack traces** (use logger.error with Error object)
5. **Use appropriate log levels** (DEBUG for verbose, INFO for normal, WARN for issues, ERROR for failures)

### `src/monitoring.ts`
- Analytics Engine integration
- Metric recording helpers (tool calls, OAuth events, rate limits)
- Error tracking
- Performance metrics (duration tracking)
- Storage quota monitoring

### `src/tools/*.ts`
Each tool module exports:
- Tool specification (name, description, parameters schema)
- Handler function
- Input validation (using Zod)
- R2 operations via StorageService
- Structured error handling (preserves stack traces)
- Logging integration

### `src/storage.ts`
- R2 API wrapper
- CRUD operations (get, put, delete, list)
- Metadata handling
- Error handling and retries with exponential backoff
- Storage quota checks
- Logging with request correlation

### `src/rate-limiting.ts`
- Per-user rate limit tracking
- KV-based counters with TTL
- Multiple time windows (minute, hour, day)
- Storage quota enforcement
- Logging when limits are hit or approaching

### `src/backup.ts`
- S3 client initialization
- R2 to S3 sync logic
- Incremental backup (ETag comparison)
- Retention management (30 days)
- Logging and metrics integration

### `src/bootstrap.ts`
- Bootstrap file generation
- Idempotency check (README.md existence)
- PARA directory structure creation
- Initial README files
- Logging of bootstrap operations

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
