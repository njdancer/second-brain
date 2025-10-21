# Observability

Logging, metrics, and debugging requirements for the Second Brain MCP server.

---

## Overview

The system MUST provide comprehensive observability to enable:
- Understanding usage patterns and growth trends
- Detecting and diagnosing performance issues
- Preventing cost escalation through quota monitoring
- Identifying security threats and anomalous behavior
- Debugging production issues with correlated logs and metrics

Observability features MUST NOT degrade application performance or introduce single points of failure. Telemetry collection failures MUST fail silently without impacting user-facing functionality.

---

## Metrics Requirements

### Usage Metrics

The system MUST track the following usage metrics:

| Metric | Description | Purpose |
|--------|-------------|---------|
| Tool calls per user | Volume by time window (minute, hour, day) | Usage patterns, growth tracking |
| Tool call distribution | Which tools are used most frequently | Feature adoption analysis |
| File creation rate | New files created per day | Capture workflow health |
| File read/write ratio | Read operations vs write operations | Usage pattern analysis |
| Average file size | Mean file size in bytes | Storage planning |
| Total storage per user | GB currently used | Cost forecasting, quota enforcement |
| PARA category distribution | File count per category | Organizational pattern insights |

### Performance Metrics

The system MUST track performance metrics with the following targets:

| Metric | Description | Target | Alert Threshold |
|--------|-------------|--------|-----------------|
| Tool call latency (p50) | Median response time | <200ms | >500ms |
| Tool call latency (p95) | 95th percentile | <500ms | >1000ms |
| Tool call latency (p99) | 99th percentile | <1000ms | >2000ms |
| R2 operation latency | Storage operation time | <100ms | >500ms |
| OAuth flow duration | End-to-end auth time | <5s | >10s |
| Backup duration | Full backup completion time | <10min | >20min |
| Error rate by tool | Percentage of failed calls | <1% | >5% |
| Rate limit hit rate | Percentage of rate-limited requests | <5% | >10% |

### Cost Metrics

The system MUST track cost-related metrics with the following alert thresholds:

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Worker requests per day | Total request volume | >1M/day (exceeds free tier) |
| R2 storage size | Total GB stored | >8GB (80% of quota) |
| R2 operations per day | Class A/B operation count | >1M/day (approaching limit) |
| KV operations per day | Read/write operation count | >100k/day |
| Data egress | GB transferred out per day | >10GB/day (unexpected) |

### Security Metrics

The system MUST track security-related metrics with the following alert thresholds:

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Failed authentication attempts | OAuth flow failures | >5 in 5 minutes |
| Rate limit violations | 429 response rate | >10% of requests |
| Path traversal attempts | Invalid path patterns detected | >0 (any attempt) |
| Storage quota violations | 507 responses returned | >10 in 1 hour |

---

## Logging Requirements

### Structured Logging

The system MUST emit logs in structured JSON format compatible with Cloudflare Workers Logs. All logs MUST include:

- **Timestamp:** ISO 8601 format with timezone
- **Level:** DEBUG, INFO, WARN, or ERROR
- **Message:** Human-readable description
- **Request ID:** UUID for correlation across related log entries
- **User ID:** Anonymized identifier (hash-based, not raw user ID)

Logs MAY include additional context fields relevant to the log entry (e.g., tool name, file path, duration, error details).

### What Must Be Logged

**Always log (INFO level):**
- Tool call initiation and completion with duration
- OAuth flow events (login, token refresh, logout)
- Session lifecycle events (creation, timeout, explicit termination)
- Backup operations (start, completion, failure)
- Bootstrap operations (trigger, file creation, completion)

**Log warnings (WARN level):**
- Rate limit violations
- Storage quota approaching limits (>80%)
- Failed operations that will be retried
- Deprecated feature usage

**Log errors (ERROR level):**
- Tool execution failures with error context
- OAuth failures with failure reason
- Storage operations failures
- Unexpected exceptions with stack traces

**Never log:**
- File contents (privacy concern)
- OAuth tokens or secrets (security concern)
- Raw user identifiers (use hashes)
- Complete file paths that may contain PII

### Log Levels

- **DEBUG:** Development-only verbose details, disabled in production
- **INFO:** Normal operations, successful flows, audit trails
- **WARN:** Degraded operation, approaching limits, potential issues
- **ERROR:** Failures, exceptions, security events requiring investigation

### Request Correlation

The system MUST generate a unique request ID (UUID) for each incoming request and include it in all log entries and metric events associated with that request. This enables tracing a single request's full lifecycle across components.

---

## Metrics Collection

### Analytics Engine Integration

The system MUST integrate with Cloudflare Analytics Engine for metrics storage and querying. Metrics MUST be recorded with:

- **User identifier:** Anonymized (SHA-256 hash of user ID)
- **Metric name:** Descriptive identifier (e.g., `tool_read_success`, `storage_quota_bytes`)
- **Metric value:** Numeric value (duration, count, bytes, etc.)
- **Timestamp:** Automatic timestamp by Analytics Engine

### Metric Recording Points

Metrics MUST be recorded at the following points:

**Tool execution:**
- Record start time
- Record success/failure outcome
- Record duration
- Record tool-specific metadata (file size for reads, etc.)

**Rate limiting:**
- Record rate limit checks
- Record rate limit violations
- Record limit type (minute, hour, day)

**Storage operations:**
- Record current usage on quota checks
- Record operation type (read, write, delete)
- Record operation success/failure

**OAuth events:**
- Record authentication attempts
- Record success/failure outcomes
- Record token refresh events

### Silent Failure Requirement

Metrics collection failures MUST NOT impact application functionality. If Analytics Engine is unavailable or metric recording fails, the system MUST:
- Continue serving user requests normally
- Log the telemetry failure at DEBUG or WARN level
- Not retry metric recording (avoid cascading failures)
- Not surface errors to users

---

## Alerting Requirements

### Alert Configuration

The system SHOULD support alerting on the following conditions:

**Critical alerts (immediate action required):**
- Error rate >5% sustained for 5 minutes
- Authentication failure spike (>5 failed attempts in 5 minutes from same user)
- Storage quota exceeded (>10GB)
- Any path traversal attempt detected

**Warning alerts (investigate within 24 hours):**
- Request spike (>10x average sustained for 5 minutes)
- Storage approaching quota (>8GB, 80% of limit)
- Rate limit hit rate >10%
- Backup failure
- Performance degradation (p95 >1000ms sustained)

**Informational alerts (review weekly):**
- Cost metrics approaching thresholds
- Usage pattern changes
- New error types appearing

### Alert Delivery

**[DEFERRED]** Alert delivery mechanisms (email, webhook, PagerDuty, etc.) are implementation decisions. The requirement is that alerts can be configured and delivered reliably.

---

## Dashboard Requirements

### Cloudflare Dashboard

The system MUST leverage the built-in Cloudflare Workers dashboard for:
- Real-time request volume and error rate
- CPU time and duration percentiles
- Request volume by status code
- Geographic distribution

### Custom Analytics

The system SHOULD support custom dashboards querying Analytics Engine data for:
- Tool usage trends over time
- Per-tool performance metrics
- Cost tracking and forecasting
- Security event monitoring

**[DEFERRED]** Specific dashboard tools (Grafana, custom web UI, SQL queries) are implementation decisions.

---

## Debugging Requirements

### Production Debugging Capabilities

The system MUST support the following debugging capabilities in production:

**Log access:**
- Real-time log tailing during incident investigation
- Historical log search by request ID, user ID, or time range
- Log filtering by level, tool, or message pattern

**Metrics querying:**
- Ad-hoc queries against Analytics Engine dataset
- Time-series analysis for trend identification
- Aggregation by user, tool, or time window

**State inspection:**
- KV namespace inspection (OAuth tokens, rate limits)
- R2 object listing and metadata retrieval
- Durable Object instance inspection (session state)

**[DEFERRED]** Specific tools for accessing logs and metrics (wrangler CLI, Cloudflare dashboard, API clients) are implementation details.

### Debug-Safe Logging

Debug logging MUST be designed to avoid exposing sensitive information:
- User identifiers MUST be anonymized (hashed)
- File paths SHOULD be sanitized to remove potentially sensitive segments
- Error messages MUST NOT include secrets or internal system details
- Stack traces MAY be logged but MUST NOT be returned to users

---

## Performance Requirements

### Observability Overhead

Observability features MUST NOT significantly degrade application performance:

- Metric recording: <5ms overhead per request
- Structured logging: <10ms overhead per request
- Total observability overhead: <15ms per request
- No additional latency for analytics failures (silent failure)

### Data Retention

Observability data retention requirements:

- **Logs:** Per Cloudflare Workers Logs retention policy (typically 1-7 days)
- **Metrics:** Per Analytics Engine retention (typically 90 days)
- **Alerts:** Historical alert records SHOULD be retained for 90 days minimum

**[DEFERRED]** Long-term log archival to external systems is an optional future enhancement.

---

## Privacy and Security

### User Privacy

Observability data MUST protect user privacy:
- User IDs MUST be anonymized using one-way hash (SHA-256)
- File contents MUST NEVER be logged
- File paths SHOULD be sanitized to remove potentially sensitive information
- OAuth tokens MUST NEVER appear in logs or metrics

### Security Event Logging

Security-relevant events MUST be logged with sufficient detail for incident investigation:
- Failed authentication attempts (include timestamp, anonymized user, failure reason)
- Rate limit violations (include timestamp, anonymized user, limit type)
- Path traversal attempts (include attempted path pattern, rejected)
- Storage quota violations (include current usage, attempted operation)

### Audit Trail

The system SHOULD maintain an audit trail of:
- All tool calls with outcomes (success/failure/error)
- OAuth events (login, logout, token refresh)
- Administrative operations (manual backups, quota adjustments)
- Configuration changes (if implemented)

---

## Cost Monitoring

### Cost Tracking

The system MUST track metrics that directly impact costs:

- Cloudflare Workers request volume (free tier: 100k/day)
- R2 storage size (charged per GB-month)
- R2 Class A operations (writes, charged per million)
- R2 Class B operations (reads, charged per million)
- KV storage size (charged per GB-month)
- KV operation counts (reads/writes, different rates)

### Cost Alerting

The system SHOULD alert when usage approaches free tier limits or when costs are projected to exceed expected thresholds.

**[DEFERRED]** Specific cost calculation formulas and alerting thresholds are implementation details that depend on Cloudflare pricing tiers and project budget.

---

## Related Documentation

- [Architecture](./architecture.md) - Monitoring component architecture
- [Security](./security.md) - Security metrics and audit requirements
- [Deployment](./deployment.md) - Observability infrastructure setup
- [Release](./release.md) - Post-deployment monitoring and alerting
- [Testing](./testing.md) - Performance testing and benchmarks
