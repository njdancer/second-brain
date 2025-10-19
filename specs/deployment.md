# Deployment Specification

Technical requirements for deploying and operating the Second Brain MCP server across development and production environments.

---

## Hosting Platform

The MCP server MUST be deployed on Cloudflare Workers, a serverless compute platform chosen for its global edge network, minimal cold start latency, and native integration with Cloudflare's storage and authentication services. This platform constraint is non-negotiable as the codebase is tightly coupled to Cloudflare's runtime APIs and service bindings.

The Workers runtime provides request-scoped execution with automatic scaling and geographic distribution. The platform enforces a maximum CPU time of 50ms for free tier deployments and 30 seconds for paid tier, though typical MCP requests complete in under 100ms. Memory limits are 128MB per request, sufficient for all tool operations including file content processing.

## Environment Architecture

The system MUST maintain two isolated environments with identical infrastructure configuration but separate data stores and access controls. The development environment serves as a staging ground for validating changes before production promotion, while the production environment serves actual Claude desktop and web clients.

### Environment Isolation

Each environment operates with dedicated Cloudflare resources that MUST NOT share state or credentials:

**Storage isolation** requires separate R2 buckets for user file storage, ensuring development testing cannot corrupt or expose production user data. Development buckets SHOULD use naming conventions that prevent accidental production operations (e.g., `second-brain-dev` vs `second-brain`).

**Session isolation** requires separate Durable Object namespaces, preventing development session IDs from colliding with production sessions. Each environment's Durable Objects MUST use distinct class names or namespace bindings.

**Authentication isolation** requires separate KV namespaces for OAuth tokens and rate limiting state. Development and production MUST use different OAuth client credentials to prevent token reuse across environments.

**Analytics isolation** SHOULD separate development and production telemetry to prevent test traffic from skewing production metrics. Cloudflare Analytics Engine SHOULD be configured with environment-specific dataset names.

### Environment Parity

While isolated, both environments MUST maintain configuration parity to ensure changes validated in development behave identically in production. Configuration changes MAY be tested in development before being applied to production, resulting in temporary configuration drift during testing. Configurations SHOULD be considered eventually consistent rather than always identical. Parity applies to:

**Infrastructure:** Identical Worker configuration including compatibility dates, CPU limits, and binding types. Both environments MUST use the same wrangler.toml structure with only environment-specific values differing.

**Secrets:** Both environments require the same secret keys (GitHub OAuth credentials, cookie encryption keys, S3 backup credentials) though the actual secret values MAY differ. Development MAY use test credentials where appropriate.

**Dependencies:** Package versions, runtime configuration, and feature flags MUST match. The development environment MUST NOT enable experimental features or configurations not intended for production.

### Environment URLs

Each environment MUST be accessible via a stable HTTPS URL:

- Development: `https://second-brain-mcp-dev.{username}.workers.dev`
- Production: `https://second-brain-mcp.{username}.workers.dev`

URLs MUST remain stable across deployments. Cloudflare Workers provides stable URLs automatically.

## Infrastructure Prerequisites

Before any deployment can succeed, specific Cloudflare resources MUST exist with correct bindings configured in `wrangler.toml`.

### R2 Storage Buckets

Two R2 buckets MUST exist (one per environment) bound to the Worker with binding name `STORAGE`. Buckets MUST be created in the same Cloudflare account as the Worker and MUST be located in a region supporting R2's object metadata features. The binding name `STORAGE` is hardcoded in the application and MUST NOT be changed without corresponding code changes.

### KV Namespaces

Four KV namespaces MUST exist:
- `OAUTH_KV` (production) - OAuth provider state storage
- `OAUTH_KV` (development) - OAuth provider state storage
- `RATE_LIMIT_KV` (production) - Rate limiting counters
- `RATE_LIMIT_KV` (development) - Rate limiting counters

KV namespaces MUST support the standard Cloudflare KV API including TTL-based expiration. The binding names `OAUTH_KV` and `RATE_LIMIT_KV` are hardcoded and MUST NOT be changed without code modifications.

### Durable Objects

One Durable Object class named `MCPSessionDurableObject` MUST be bound to each environment with binding name `MCP_SESSION`. The Durable Object MUST support alarm scheduling for session cleanup. This binding is critical for session persistence and MUST NOT be omitted.

### Analytics Engine

One Analytics Engine dataset SHOULD be bound with binding name `ANALYTICS` to enable request telemetry and tool usage tracking. This binding is optional for development but RECOMMENDED for production to support monitoring and debugging.

## Secret Management

Sensitive credentials MUST be stored as Cloudflare Worker secrets (encrypted at rest, decrypted at request time) and MUST NOT appear in wrangler.toml, source code, or version control.

### Required Secrets

**GITHUB_CLIENT_ID** and **GITHUB_CLIENT_SECRET** contain OAuth application credentials for GitHub authentication. These MUST correspond to a GitHub OAuth App configured with the correct callback URL for each environment. The client secret MUST be treated as highly sensitive and rotated periodically.

**COOKIE_ENCRYPTION_KEY** contains a 32-byte hex-encoded key for encrypting OAuth state cookies. This MUST be generated using a cryptographically secure random source (e.g., `openssl rand -hex 32`). Rotating this secret invalidates all in-flight OAuth sessions.

**S3_BACKUP_ACCESS_KEY**, **S3_BACKUP_SECRET_KEY**, **S3_BACKUP_BUCKET**, and **S3_BACKUP_REGION** contain AWS credentials for optional R2-to-S3 backup functionality. These are REQUIRED if backup features are enabled, OPTIONAL otherwise.

### Secret Rotation

The system MUST support secret rotation without requiring code changes or redeployment. Rotating `COOKIE_ENCRYPTION_KEY` will invalidate active OAuth sessions, requiring users to reauthenticate. Rotating GitHub OAuth credentials requires updating both the Worker secret and the GitHub OAuth App configuration.

## Environment Variables

Non-sensitive configuration MAY be stored as environment variables in wrangler.toml under `[vars]` sections. These are public values that change between environments but are not secret.

**GITHUB_ALLOWED_USER_ID** contains the GitHub user ID permitted to access the MCP server. This acts as a simple authorization allowlist and MUST be configured for both environments. Future versions MAY support multiple user IDs or different authorization mechanisms.

## Deployment Verification

After any deployment, automated verification MUST confirm the Worker is accessible and responsive before considering the deployment successful.

### Health Check Endpoint

The Worker MUST expose a health check endpoint at `/health` that returns HTTP 200 with a JSON response indicating service status. This endpoint MUST NOT require authentication and SHOULD complete in under 100ms. The health check MUST verify:

- Worker is running and responding to requests
- All bindings (R2, KV, DO, Analytics) are accessible
- No critical configuration errors prevent request handling

The health check MAY return degraded status (HTTP 200 with warnings) if non-critical features are unavailable (e.g., backup credentials missing but MCP tools functional).

### Deployment Rollback

The system MUST support rollback to a previous deployment within 10 minutes of detecting a failed deployment. Cloudflare Workers retains the last 10 deployments in history, allowing instant rollback via API.

Rollback MUST NOT require rebuilding or retesting the previous version. The Cloudflare Workers platform provides atomic deployment rollback that reverts to the exact previously deployed code.

Rollback MUST be triggered via GitHub Actions workflow to ensure all necessary rollback steps are followed consistently (updating deployment records, notifications, etc.). Automated rollback MUST occur for critical failures (health check failure, authentication broken). Manual rollback via workflow dispatch SHOULD be used for issues discovered post-deployment (increased error rates, performance degradation, user reports).

## Performance Requirements

The deployed Worker MUST meet specific performance criteria to provide acceptable MCP client experience:

**Request latency:** P95 latency MUST be under 500ms for tool execution, measured from request arrival to response completion. This includes time for authentication, rate limiting checks, R2 operations, and response serialization.

**Cold start latency:** Initial requests after periods of inactivity MUST complete within 1 second. Cloudflare Workers typically achieve 10-50ms cold starts; this requirement provides buffer for global routing and binding initialization.

**Throughput:** The Worker MUST handle at minimum 100 requests per minute per user without throttling (beyond intentional rate limits). Cloudflare's autoscaling MUST accommodate burst traffic patterns from interactive Claude sessions.

## Availability Requirements

The production environment MUST achieve 99.9% uptime over any 30-day period, excluding scheduled maintenance windows. This translates to approximately 43 minutes of acceptable downtime per month.

Deployments MUST use zero-downtime deployment strategies. Cloudflare Workers provides this automatically through gradual rollout across edge locations. During deployment, some edge locations serve old code while others serve new code for up to 30 seconds.

The system MUST tolerate temporary Cloudflare service degradation by returning appropriate HTTP status codes (503 Service Unavailable) rather than silent failures or data corruption.

## Observability Requirements

Production deployments MUST emit structured logs viewable via Cloudflare Workers Logs or exported to external log aggregation services. Logs MUST include:

- Request correlation IDs for tracing related log entries
- HTTP status codes and error messages
- Tool execution timing and success/failure status
- Rate limiting decisions
- Authentication/authorization outcomes

Logs MUST NOT contain PII (personally identifiable information) or sensitive data (OAuth tokens, file contents, user data). Error messages MUST be sanitized before logging.

## Deployment Constraints

Certain deployment scenarios are explicitly NOT supported:

**[OUT OF SCOPE]** Multi-region active-active deployment. While Cloudflare Workers deploy globally, the application assumes a single Durable Object namespace and R2 bucket per environment, precluding multi-region failover.

**[OUT OF SCOPE]** Blue-green deployment. Cloudflare Workers' instant rollback capability makes blue-green deployment unnecessary overhead.

**[OUT OF SCOPE]** Canary deployment to subset of users. The single-user authorization model makes canary deployment meaningless. Future multi-user versions MAY support canary rollout.

**[DEFERRED]** Automated performance regression detection. While desirable, defining objective performance regression criteria requires production baseline data not yet available.

## Related Specifications

See [Release](./release.md) for CI/CD pipeline, branching strategy, and deployment triggering mechanisms.

See [Security](./security.md) for OAuth configuration, token management, and credential handling requirements.

See [Monitoring](./monitoring.md) for detailed observability, alerting, and metrics collection requirements.
