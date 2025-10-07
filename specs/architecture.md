# Technical Architecture

---

## Stack

- **Platform**: Cloudflare Workers
- **Framework**: Hono (for HTTP routing)
- **Protocol**: Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **OAuth**: `@cloudflare/workers-oauth-provider` (GitHub as identity provider)
- **Storage**: Cloudflare R2 (single bucket, configured via wrangler)
- **Transport**: Server-Sent Events (SSE) for remote MCP connection

---

## Architecture Pattern

```
Claude Client → MCP Client (OAuth) → Worker (Hono + OAuth Provider) → R2 Storage
                                              ↓
                                         GitHub OAuth
```

---

## Authentication Flow

1. Claude initiates OAuth with MCP server's client ID/secret
2. Worker redirects user to GitHub for authentication
3. GitHub returns authorization code to worker
4. Worker validates user is authorized (checks against allowed GitHub user ID)
5. Worker issues MCP access tokens to Claude
6. Claude uses tokens for subsequent MCP tool calls

**GitHub OAuth Scopes Required:**
- `read:user` - To verify user identity and retrieve GitHub user ID

---

## Data Flow

### Tool Call Lifecycle

1. **Client Request**: Claude invokes MCP tool with parameters
2. **Authentication**: Worker validates OAuth token from `OAUTH_KV`
3. **Rate Limiting**: Check user's rate limit in `RATE_LIMIT_KV`
4. **Authorization**: Verify user is in allowed list (`GITHUB_ALLOWED_USER_ID`)
5. **Tool Execution**: Invoke appropriate tool handler
6. **Storage Operation**: Perform R2 read/write/list operation
7. **Response**: Return result or error to Claude
8. **Metrics**: Record usage metrics to Analytics Engine

### Storage Organization

All files stored in R2 with flat path structure:
- `projects/app-name/notes.md`
- `areas/health/fitness-log.md`
- `resources/productivity/basb-notes.md`
- `archives/2024/old-project/summary.md`

No enforced hierarchy - structure emerges from user's file paths.

---

## Components

### 1. Worker Entry Point (`src/index.ts`)
- Hono app initialization
- Route handling (SSE endpoint, OAuth callbacks)
- Request routing to handlers

### 2. OAuth Handler (`src/oauth-handler.ts`)
- GitHub OAuth flow implementation
- Token issuance and validation
- User authorization check
- Token storage in KV

### 3. MCP Server (`src/mcp-server.ts`)
- MCP protocol implementation
- Tool registration and dispatch
- Server metadata (name, description, version)
- Prompt registration

### 4. Tool Implementations (`src/tools/`)
- `read.ts` - File reading with range support
- `write.ts` - File creation/overwrite
- `edit.ts` - String replacement, move, rename, delete
- `glob.ts` - Pattern-based file search
- `grep.ts` - Content search with regex

### 5. Storage Abstraction (`src/storage.ts`)
- R2 API wrapper
- Error handling and retries
- Storage limit checks
- Metadata management

### 6. Rate Limiting (`src/rate-limiting.ts`)
- Per-user rate limit tracking
- KV-based counters with TTL
- Multiple time windows (minute, hour, day)
- Storage quota enforcement

### 7. Bootstrap (`src/bootstrap.ts`)
- Initial file creation logic
- README and PARA directory structure
- Idempotent execution (check for existing files)

### 8. Backup (`src/backup.ts`)
- R2 to S3 sync via cron trigger
- Incremental backup logic
- Retention management (30 days)

### 9. Monitoring (`src/monitoring.ts`)
- Analytics Engine integration
- Metric collection helpers
- Error logging

---

## Scalability Considerations

### Current (Single User)
- Single R2 bucket
- User ID in environment variable
- Simple authorization check

### Future (Multi-User)
- User namespacing in R2 paths: `users/{user_id}/projects/...`
- Dynamic user management (database or KV)
- Per-user storage quotas
- Shared resources or multi-tenancy

**Design Choice**: Current architecture doesn't preclude multi-user support - can migrate by prefixing all paths with user ID.

---

## Related Documentation

- [Overview](./overview.md) - Project background and philosophy
- [API Reference](./api-reference.md) - Tool specifications
- [Implementation](./implementation.md) - Project structure and dependencies
- [Security](./security.md) - Authentication and authorization details
- [Deployment](./deployment.md) - Setup and configuration
