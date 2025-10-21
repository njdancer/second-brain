# Security & Privacy

Authentication, authorization, data protection, and access control for the Second Brain MCP server.

---

## OAuth Architecture

This server uses a dual OAuth role architecture where we act as both OAuth server (issuing MCP tokens) and OAuth client (consuming GitHub tokens for user verification). See [Architecture](./architecture.md#dual-oauth-architecture) for the complete flow diagram and technical details.

**Security-relevant token boundaries:**
- MCP access tokens (we issue) → Used for MCP protocol requests
- GitHub access tokens (GitHub issues) → Used for user verification only
- **Never** mix these tokens across boundaries

---

## Authentication

### OAuth 2.1 Authentication Flow

Users authenticate through a combined OAuth flow (see [Architecture](./architecture.md#authentication--authorization-flow) for the complete sequence diagram). Security properties:

- PKCE MUST be enforced for both OAuth flows (OAuth 2.1 compliance)
- GitHub tokens MUST be used only for user verification, never exposed to MCP clients
- User ID MUST be validated against `GITHUB_ALLOWED_USER_ID` before issuing MCP tokens
- MCP access tokens MUST be validated on every tool call

**Required GitHub Scopes:**
- `read:user` - To verify user identity and retrieve GitHub user ID

**Token Storage:**
- Access tokens stored in `OAUTH_KV` namespace (managed by OAuthProvider)
- Token encryption handled automatically by `@cloudflare/workers-oauth-provider`
- TTL enforced: 1 hour access tokens, 30 days refresh tokens
- PKCE validation on token exchange (OAuth 2.1 compliance)
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

### Future Multi-User Support **[DEFERRED]**

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

**Future Admin Endpoints** **[DEFERRED]**:
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

| Code | Meaning | When Used |
|------|---------|-----------|
| 400 | Bad Request | Invalid input parameters |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Valid token but not allowed |
| 404 | Not Found | Resource does not exist |
| 413 | Payload Too Large | File size exceeds limit |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Generic server error |
| 507 | Insufficient Storage | Storage quota exceeded |

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

### GDPR Considerations **[DEFERRED]**

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

See [Observability](./observability.md) for implementation details.

---

## Related Documentation

- [Architecture](./architecture.md) - Authentication flow details
- [Deployment](./deployment.md) - Secret configuration
- [Observability](./observability.md) - Security metrics and alerts
