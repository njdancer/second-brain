# Technical Architecture

---

## Stack

- **Platform**: Cloudflare Workers
- **Protocol**: Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **OAuth SERVER**: `@cloudflare/workers-oauth-provider` v0.0.11 (issues MCP tokens with PKCE)
- **OAuth CLIENT**: Arctic v3.7.0 (GitHub authentication for user verification)
- **Storage**: Cloudflare R2 (single bucket, configured via wrangler)
- **Session Management**: Cloudflare Durable Objects (stateful MCP transport sessions)
- **Transport**: Streamable HTTP (MCP protocol version 2025-03-26)
- **Observability**: Structured JSON logging + Cloudflare Analytics Engine

---

## Architecture Pattern

```
Claude/MCP Client
    ↓ (OAuth 2.1 + PKCE)
    ↓ [MCP tokens issued by us]
Worker (OAuthProvider)
    ├─→ /mcp endpoint (authenticated)
    │       ↓
    │   Durable Object (per session)
    │       ├─→ StreamableHTTPServerTransport (stateful)
    │       ├─→ MCP Server
    │       └─→ R2 Storage
    │
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

**Session Management:**
- Each MCP session runs in its own Durable Object instance
- Session ID is used as Durable Object ID for routing
- Provides stateful storage for StreamableHTTPServerTransport
- Enables SSE (Server-Sent Events) streaming across multiple HTTP requests

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

## Durable Objects Session Management

**Why Durable Objects?**

Cloudflare Workers are stateless - each request can go to a different Worker instance. However, the MCP `StreamableHTTPServerTransport` requires stateful session management:
- Maintains internal state (`_streamMapping`, `_requestToStreamMapping`, etc.)
- Handles SSE (Server-Sent Events) streaming connections
- Associates multiple HTTP requests with the same session

Durable Objects provide strongly-consistent, stateful storage per session, solving the session persistence problem.

**Architecture:**

```
POST /mcp (initialize) → Worker
    ↓
Worker creates Durable Object stub with session ID
    ↓
Durable Object initializes StreamableHTTPServerTransport
    ↓
Returns session ID to client

GET /mcp (with session ID) → Worker
    ↓
Worker gets existing Durable Object stub by session ID
    ↓
Durable Object processes request with existing transport
    ↓
SSE stream established through same stateful transport
```

**Implementation Details:**

1. **Durable Object Class** (`MCPSessionDurableObject`):
   - One instance per MCP session
   - Holds `StreamableHTTPServerTransport` and `Server` instances
   - Lifecycle tied to session (initialize → use → terminate)

2. **Worker routing**:
   - Extract session ID from `mcp-session-id` header or initialize
   - Get or create Durable Object stub: `env.MCP_SESSIONS.get(id)`
   - Forward request to Durable Object

3. **Session ID as Durable Object ID**:
   - MCP session ID directly maps to Durable Object ID
   - Ensures requests with same session ID always route to same instance
   - No external session storage needed (KV, D1)

4. **Session cleanup**:
   - DELETE request triggers session termination
   - Durable Object can implement automatic timeout (e.g., 1 hour idle)
   - Closed sessions are garbage collected by Cloudflare

**Cost Considerations:**

- Workers Paid plan required ($5/month per account)
- Included: 1M Durable Object requests, 400K GB-s duration
- Personal use case: Well within free tier limits
- Automatic hibernation when idle (no duration charges)

---

## Components

### 1. Worker Entry Point (`src/index.ts`)
- OAuthProvider instance configuration and export (root handler)
- Configures OAuth endpoints (`/authorize`, `/token`, `/register`)
- Routes `/mcp` to authenticated API handler
- Routes default to GitHub OAuth UI handler

### 2. GitHub OAuth UI Handler (`src/oauth-ui-handler.ts`)
- GitHub OAuth CLIENT flow using Arctic library
- `/authorize` - Parse MCP request, redirect to GitHub
- `/callback` - Exchange code for GitHub token, verify user, complete MCP OAuth
- User authorization check against `GITHUB_ALLOWED_USER_ID`
- State management (encodes MCP OAuth request in GitHub state parameter)
- Direct Fetch API handlers (no framework layer)

### 3. MCP API Handler (`src/mcp-api-handler.ts`)
- Authenticated MCP requests (token validation by OAuthProvider)
- Rate limiting enforcement
- Session ID extraction from headers
- Durable Object routing (forwards to session-specific DO)
- Direct Fetch API handlers (no framework layer)

### 4. MCP Session Durable Object (`src/mcp-session-do.ts`) **NEW**
- Stateful session management (one instance per MCP session)
- Holds StreamableHTTPServerTransport and Server instances
- Handles all MCP protocol requests for a session
- Processes GET (SSE), POST (JSON-RPC), DELETE (terminate)
- Automatic session cleanup on termination

### 5. MCP Transport (`src/mcp-transport.ts`)
- MCP protocol implementation
- StreamableHTTPServerTransport initialization
- Tool registration and dispatch
- Server metadata (name, description, version)
- Prompt registration

### 6. Tool Implementations (`src/tools/`)
- `read.ts` - File reading with range support
- `write.ts` - File creation/overwrite
- `edit.ts` - String replacement, move, rename, delete
- `glob.ts` - Pattern-based file search
- `grep.ts` - Content search with regex

### 7. Storage Service (`src/storage.ts`)
- R2 API wrapper
- Error handling and retries
- Storage limit checks
- Metadata management

### 8. Rate Limiting (`src/rate-limiting.ts`)
- Per-user rate limit tracking
- KV-based counters with TTL
- Multiple time windows (minute, hour, day)
- Storage quota enforcement

### 9. Bootstrap (`src/bootstrap.ts`)
- Initial file creation logic
- README and PARA directory structure
- Idempotent execution (check for existing files)

### 10. Backup (`src/backup.ts`)
- R2 to S3 sync via cron trigger
- Incremental backup logic
- Retention management (30 days)

### 11. Observability (`src/logger.ts`, `src/monitoring.ts`)
- **Logger**: Structured JSON logging with request correlation
- **Monitoring**: Analytics Engine integration, metric collection
- Request tracing, error tracking, performance metrics

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

## Observability Architecture

### Structured Logging

**JSON-formatted logs** for efficient querying in Cloudflare Workers Logs:

```typescript
{
  "timestamp": "2025-10-11T12:34:56.789Z",
  "level": "INFO",  // DEBUG, INFO, WARN, ERROR
  "message": "MCP request completed",
  "requestId": "uuid-v4",
  "userId": "github-user-id",
  "tool": "read",
  "duration": 125,  // milliseconds
  "success": true
}
```

**Request Correlation:**
- Every request gets a unique `requestId` (UUID v4)
- Passed through all layers (OAuthProvider → MCP handler → tools → storage)
- All logs include `requestId` for tracing complete request lifecycle

**Log Levels:**
- `DEBUG` - Detailed execution flow (disabled in production)
- `INFO` - Request lifecycle, tool execution, OAuth events
- `WARN` - Rate limits approaching, storage quota warnings
- `ERROR` - Failures with full context (preserved stack traces)

### Metrics Collection

**Analytics Engine** for high-cardinality metrics:

```typescript
// Tool execution metrics
await analytics.writeDataPoint({
  blobs: [toolName, userId],       // Dimensions (unlimited cardinality)
  doubles: [duration, 1],           // Metrics [duration_ms, count]
  indexes: [toolName]               // Indexed for fast queries
});

// OAuth events
await monitoring.recordOAuthEvent(userId, 'success' | 'failure');

// Rate limiting
await monitoring.recordRateLimitHit(userId, window, limit);

// Storage usage
await monitoring.recordStorageMetrics(userId, totalBytes, totalFiles);
```

**Real-time Monitoring:**
- Tool execution times (p50, p95, p99)
- OAuth success/failure rates
- Rate limit hit rates
- Storage quota utilization
- Error rates by type

### Error Tracking

**Error Context Preservation:**
- Original stack traces preserved through tool execution chain
- Error types categorized (user error vs system error)
- Structured error logging with full context
- No PII in logs (user IDs anonymized in analytics)

**Monitoring Integration:**
- All errors sent to Analytics Engine
- Categorized by HTTP status code
- Includes user context for debugging (without exposing PII)

---

## Related Documentation

- [Overview](./overview.md) - Project background and philosophy
- [API Reference](./api-reference.md) - Tool specifications
- [Implementation](./implementation.md) - Project structure and dependencies
- [Security](./security.md) - Authentication and authorization details
- [Deployment](./deployment.md) - Setup and configuration
- [Monitoring](./monitoring.md) - Observability implementation details
