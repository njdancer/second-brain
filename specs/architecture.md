# Technical Architecture

---

## Stack

- **Platform**: Cloudflare Workers
- **Framework**: Hono (for HTTP routing)
- **Protocol**: Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **OAuth SERVER**: `@cloudflare/workers-oauth-provider` v0.0.11 (issues MCP tokens with PKCE)
- **OAuth CLIENT**: Arctic v3.7.0 (GitHub authentication for user verification)
- **Storage**: Cloudflare R2 (single bucket, configured via wrangler)
- **Transport**: Streamable HTTP (MCP protocol version 2025-03-26)

---

## Architecture Pattern

```
Claude/MCP Client
    ↓ (OAuth 2.1 + PKCE)
    ↓ [MCP tokens issued by us]
Worker (OAuthProvider)
    ├─→ /mcp endpoint (authenticated) → MCP Server → R2 Storage
    └─→ /oauth/* (GitHub flow)
            ↓ (OAuth 2.0 + PKCE)
            ↓ [GitHub tokens consumed by us via Arctic]
        GitHub API
            ↓
        User Verification (allowlist check)
```

**Dual OAuth Architecture:**
- **Flow 1**: Claude authenticates WITH US (we issue MCP tokens via OAuthProvider)
- **Flow 2**: We authenticate WITH GitHub (we verify user identity via Arctic)

---

## Authentication Flow

**Complete OAuth Flow (both roles combined):**

1. Claude initiates OAuth with MCP server at `/oauth/authorize` (PKCE code challenge)
2. OAuthProvider parses MCP OAuth request, validates client
3. Worker redirects user to GitHub via Arctic (`/oauth/callback` return URL)
4. User authenticates with GitHub and authorizes `read:user` scope
5. GitHub redirects back to `/oauth/callback` with authorization code
6. Arctic validates code and exchanges for GitHub access token (with PKCE)
7. Worker fetches GitHub user info using token
8. Worker validates user against `GITHUB_ALLOWED_USER_ID` allowlist
9. OAuthProvider.completeAuthorization() issues MCP authorization code to Claude
10. Claude exchanges authorization code for MCP access token (with PKCE verification)
11. Claude uses MCP token for subsequent tool calls at `/mcp` endpoint

**Library Responsibilities:**
- **Arctic** - Handles GitHub OAuth CLIENT (steps 3-7): auth URL generation, token exchange, PKCE
- **OAuthProvider** - Handles MCP OAuth SERVER (steps 1-2, 9-10): request parsing, token issuance, PKCE validation

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
- OAuthProvider instance configuration and export
- Configures OAuth endpoints (`/oauth/authorize`, `/oauth/token`, `/register`)
- Routes `/mcp` to authenticated API handler
- Routes `/oauth/*` to GitHub UI handler

### 2. GitHub OAuth UI Handler (`src/oauth-ui-handler.ts`)
- GitHub OAuth CLIENT flow using Arctic library
- `/oauth/authorize` - Parse MCP request, redirect to GitHub
- `/oauth/callback` - Exchange code for GitHub token, verify user, complete MCP OAuth
- User authorization check against `GITHUB_ALLOWED_USER_ID`
- State management (encodes MCP OAuth request in GitHub state parameter)

### 3. MCP API Handler (`src/mcp-api-handler.ts`)
- Authenticated MCP requests (token validation by OAuthProvider)
- Rate limiting enforcement
- MCP server instantiation and request routing
- Session management for MCP transport

### 4. MCP Server (`src/mcp-server.ts`)
- MCP protocol implementation
- Tool registration and dispatch
- Server metadata (name, description, version)
- Prompt registration

### 5. Tool Implementations (`src/tools/`)
- `read.ts` - File reading with range support
- `write.ts` - File creation/overwrite
- `edit.ts` - String replacement, move, rename, delete
- `glob.ts` - Pattern-based file search
- `grep.ts` - Content search with regex

### 6. Storage Abstraction (`src/storage.ts`)
- R2 API wrapper
- Error handling and retries
- Storage limit checks
- Metadata management

### 7. Rate Limiting (`src/rate-limiting.ts`)
- Per-user rate limit tracking
- KV-based counters with TTL
- Multiple time windows (minute, hour, day)
- Storage quota enforcement

### 8. Bootstrap (`src/bootstrap.ts`)
- Initial file creation logic
- README and PARA directory structure
- Idempotent execution (check for existing files)

### 9. Backup (`src/backup.ts`)
- R2 to S3 sync via cron trigger
- Incremental backup logic
- Retention management (30 days)

### 10. Monitoring (`src/monitoring.ts`)
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
