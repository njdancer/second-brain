# Security & Privacy

Authentication, authorization, data protection, and access control for the Second Brain MCP server.

---

## OAuth Architecture Overview

**IMPORTANT:** This MCP server has a **dual OAuth role** architecture with TWO separate flows:

### 1. OAuth SERVER (We Issue Tokens)
- **Role:** Authorization server for MCP clients
- **Clients:** Claude.ai, MCP Inspector, other MCP clients
- **We provide:** MCP access tokens (`mcp_*` prefix)
- **Protocol:** OAuth 2.1 with PKCE (required for public clients)
- **Implementation:** `@cloudflare/workers-oauth-provider` library (Phase 13 migration)
- **Endpoints:** `/oauth/authorize`, `/oauth/token`, `/.well-known/oauth-authorization-server`
- **Current Status:** Hand-rolled implementation (Phase 12) → Library migration (Phase 13)
- **Blocker:** Missing PKCE prevents Claude.ai from connecting

### 2. OAuth CLIENT (We Consume Tokens)
- **Role:** OAuth client consuming GitHub's OAuth service
- **Provider:** GitHub
- **We consume:** GitHub access tokens (for user identity verification only)
- **Protocol:** OAuth 2.0
- **Purpose:** Verify user ID against `GITHUB_ALLOWED_USER_ID` allowlist
- **Current Status:** Hand-rolled implementation (working, but has security issues)
- **Future:** Required Arctic migration (Phase 13B, deferred until 13A stable)

**Why Two Flows?**
- We can't give MCP clients direct access to GitHub tokens (security boundary)
- We need to verify user identity before issuing our own MCP tokens
- MCP tokens have different scopes (`mcp:read`, `mcp:write`) than GitHub tokens (`read:user`)

**Token Boundaries:**
- MCP access tokens (issued by us) → Used for MCP protocol requests
- GitHub access tokens (issued by GitHub) → Used for user verification only
- **Never** mix these tokens across boundaries

---

## Authentication

### OAuth 2.1 via GitHub (Combined Flows)

**Note:** The flow below describes BOTH OAuth roles. Steps 1-2 and 9-10 are our OAuth SERVER role. Steps 3-8 are our OAuth CLIENT role.

**Required Scopes:**
- `read:user` - To verify user identity and retrieve GitHub user ID

**Authentication Flow:**

1. User initiates connection in Claude client
2. Claude opens OAuth flow with MCP server's client ID/secret
3. Worker redirects to GitHub authorization page
4. User authenticates with GitHub
5. User approves requested scopes
6. GitHub redirects to worker with authorization code
7. Worker exchanges code for access token
8. Worker validates user is in allowed list (`GITHUB_ALLOWED_USER_ID`)
9. Worker issues MCP access token to Claude
10. Token stored in `OAUTH_KV` with TTL

**Token Storage:**
- Access tokens stored in `OAUTH_KV` namespace
- Tokens encrypted using `COOKIE_ENCRYPTION_KEY`
- TTL enforced (tokens expire automatically)
- Refresh tokens supported for long sessions

**Token Validation:**
- Every MCP tool call validates token
- Expired tokens return `401 Unauthorized`
- Invalid tokens return `403 Forbidden`
- Missing tokens return `401 Unauthorized`

---

## Authorization

### Single-User Model (MVP)

**User Identification:**
- GitHub user ID configured in `GITHUB_ALLOWED_USER_ID` environment variable
- Only this user can successfully complete OAuth flow
- Other users receive authorization denied error

**Authorization Check:**

```typescript
async function isAuthorized(githubUserId: string, env: Env): boolean {
  return githubUserId === env.GITHUB_ALLOWED_USER_ID;
}
```

**Access Control:**
- Single user has full access to all operations
- All tool calls scoped to user's R2 bucket
- No cross-user data access (only one user exists)

### Future Multi-User Support

**Path Namespacing:**
- Prefix all paths with user ID: `users/{user_id}/projects/...`
- User can only access paths within their namespace
- Authorization middleware validates path ownership

**User Management:**
- Remove `GITHUB_ALLOWED_USER_ID` constraint
- Add user registry (KV or database)
- Per-user storage quotas
- Admin users for management

---

## Data Protection

### Storage Security

**R2 Bucket Configuration:**
- Private bucket (no public access)
- Access only via worker with valid credentials
- Objects not directly accessible via URL

**Data Encryption:**
- Transport: HTTPS/TLS 1.3 for all connections
- At rest: R2 server-side encryption enabled
- OAuth tokens: Encrypted in KV using `COOKIE_ENCRYPTION_KEY`

**Data Privacy:**
- File contents never logged
- Only metadata logged (path, size, timestamp)
- User ID anonymized in analytics
- No third-party data sharing

### Network Security

**HTTPS Enforcement:**
- All endpoints require HTTPS
- HTTP automatically redirected to HTTPS
- Strict Transport Security headers enabled

**CORS Policy:**
- Only Claude client origins allowed
- Credentials required for cross-origin requests
- Preflight caching enabled

**Rate Limiting:**
- Prevents abuse and cost escalation
- Per-user limits enforced
- Storage caps prevent runaway costs
- See [Implementation](./implementation.md#rate-limiting) for details

---

## Access Control

### User Access

**Authorization Requirements:**
- Valid OAuth token (authenticated via GitHub)
- User ID matches `GITHUB_ALLOWED_USER_ID`
- Token not expired
- Rate limits not exceeded

**Tool Access:**
- All tools require authentication
- User sees all tool calls in Claude UI
- Claude requires explicit permission for tool use
- No hidden or automatic operations

### Token Management

**Token Lifecycle:**
1. Issued during OAuth flow
2. Stored in `OAUTH_KV` with TTL
3. Validated on every tool call
4. Refreshed when near expiration
5. Expired tokens automatically deleted

**Token Revocation:**
- User can revoke GitHub OAuth app access
- Tokens in KV expire automatically
- Manual revocation via KV deletion
- No persistent sessions after revocation

### Admin Operations

**Backup Endpoint:**
- `POST /admin/backup` - Manual backup trigger
- Requires valid OAuth token
- Same authorization as tool calls
- Logged to analytics

**Future Admin Endpoints:**
- User management (multi-user mode)
- Storage usage reports
- Rate limit overrides
- Audit logs

---

## Security Best Practices

### Secret Management

**Secrets Storage:**
- All secrets stored in Cloudflare Secrets (encrypted)
- Never commit secrets to repository
- Rotate secrets regularly
- Use different secrets for dev/production

**Secret Types:**
- OAuth credentials (GitHub client ID/secret)
- Encryption keys (cookie encryption)
- AWS credentials (backup access)

**Rotation:**
- GitHub OAuth: Rotate annually or on compromise
- Encryption keys: Rotate on suspected compromise
- AWS credentials: Rotate quarterly

### Input Validation

**Tool Parameters:**
- All inputs validated using Zod schemas
- Path traversal prevented (no `..` in paths)
- File size limits enforced
- Pattern injection prevented (regex/glob sanitization)

**Validation Rules:**
- Paths must not contain: `..`, null bytes, control characters
- File sizes checked before operations
- Regex patterns validated before compilation
- Glob patterns sanitized

### Error Handling

**Error Information Disclosure:**
- Generic error messages to users
- Detailed errors logged internally
- Stack traces never exposed
- File paths sanitized in errors

**Error Codes:**
- `400` - Client error (invalid input)
- `401` - Unauthenticated
- `403` - Forbidden (authorized but not allowed)
- `404` - Not found
- `413` - Payload too large
- `429` - Rate limit exceeded
- `500` - Server error (generic)
- `507` - Insufficient storage

---

## Compliance & Privacy

### Data Retention

**User Data:**
- Stored indefinitely until user deletes
- No automatic deletion
- User can delete anytime via tools

**Backup Data:**
- 30 days retention in S3
- Automatic cleanup after 30 days
- User can trigger manual backups

**Logs & Analytics:**
- Metrics retained per Cloudflare policy
- No PII in logs (user IDs anonymized)
- Audit logs (if implemented) retained 90 days

### User Rights

**Data Access:**
- User has full access to all their data
- Can read any file via `read` tool
- Can list all files via `glob` tool

**Data Deletion:**
- User can delete files via `edit` tool (delete flag)
- No undelete/version history (MVP)
- Backup data deleted after 30 days

**Data Export:**
- User can read all files and save locally
- Future: Export endpoint for zip archive
- Backup data accessible via S3 (user has credentials)

### GDPR Considerations (Future)

For multi-user deployments:
- Right to access: Provide data export
- Right to deletion: Delete all user data including backups
- Right to portability: Export in standard format (markdown)
- Data minimization: Only store necessary data
- Purpose limitation: Only use data for knowledge management

---

## Threat Model

### Threats Mitigated

1. **Unauthorized Access:** OAuth + user allowlist
2. **Data Breaches:** Private R2 bucket, encryption in transit/rest
3. **Rate Abuse:** Rate limiting and storage caps
4. **Cost Escalation:** Hard storage limits and rate limits
5. **Path Traversal:** Input validation
6. **Injection Attacks:** Parameter sanitization
7. **Token Theft:** Token encryption, HTTPS only

### Residual Risks

1. **GitHub Compromise:** If user's GitHub account compromised, attacker gains access
2. **Worker Compromise:** If Cloudflare account compromised, attacker accesses secrets
3. **S3 Backup Exposure:** If AWS credentials compromised, backups exposed
4. **Data Loss:** If R2 and S3 both fail, data lost (low probability)

**Mitigations:**
- Enable GitHub 2FA (user responsibility)
- Use Cloudflare Access for worker management
- Rotate AWS credentials regularly
- Monitor for unauthorized access

---

## Security Monitoring

### Metrics to Track

- Failed authentication attempts
- Rate limit violations
- Storage quota approaches
- Unusual access patterns
- Error rate spikes

### Alerts

Configure alerts for:
- >5 failed auth attempts in 5 minutes
- Rate limit hit rate >10%
- Storage approaching 10GB
- Error rate >5%
- Backup failures

See [Monitoring](./monitoring.md) for implementation details.

---

## Related Documentation

- [Architecture](./architecture.md) - Authentication flow details
- [Implementation](./implementation.md) - Rate limiting implementation
- [Deployment](./deployment.md) - Secret configuration
- [Monitoring](./monitoring.md) - Security metrics and alerts
