# Monitoring & Observability

Metrics, logging, and observability strategy for the Second Brain MCP server.

---

## Overview

Monitoring is essential for:
- Understanding usage patterns
- Detecting performance issues
- Preventing cost escalation
- Identifying security threats
- Debugging production issues

---

## Metrics to Track

### Usage Metrics

| Metric | Description | Why Important |
|--------|-------------|---------------|
| Tool calls per user per day/week/month | Volume of tool invocations | Usage patterns, growth |
| Tool call distribution | Which tools used most | Feature adoption |
| File creation rate | New files per day | Capture workflow health |
| File read/write ratio | Reads vs writes | Usage pattern (capture vs retrieve) |
| Average file size | Mean file size in bytes | Storage planning |
| Total storage used per user | GB used | Cost forecasting |
| PARA category distribution | Files per category | Organizational patterns |

### Performance Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Tool call latency (p50) | Median response time | <200ms |
| Tool call latency (p95) | 95th percentile | <500ms |
| Tool call latency (p99) | 99th percentile | <1000ms |
| R2 operation latency | Storage operation time | <100ms |
| OAuth flow completion time | End-to-end auth time | <5s |
| Backup duration | Time to complete backup | <10min |
| Error rates by tool | % of calls that fail | <1% |
| Rate limit hit rate | % of calls rate limited | <5% |

### Cost Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Cloudflare Workers requests | Total requests per day | >1M/day |
| R2 storage size | Total GB stored | >8GB (80% of limit) |
| R2 operation count | Class A/B operations | >1M/day |
| KV read/write operations | KV operations per day | >100k/day |
| Data egress | GB transferred out | >10GB/day |

### Security Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Failed authentication attempts | OAuth failures | >5 in 5 minutes |
| Rate limit violations | 429 responses | >10% of requests |
| Path traversal attempts | Invalid path patterns | >0 |
| Storage quota violations | 507 responses | >10 in 1 hour |

---

## Implementation

### CloudFlare Analytics Engine

```typescript
// src/monitoring.ts

export interface Env {
  ANALYTICS: AnalyticsEngineDataset;
  // ... other bindings
}

export function recordMetric(
  env: Env,
  userId: string,
  metric: string,
  value: number,
  metadata?: Record<string, string>
) {
  env.ANALYTICS.writeDataPoint({
    blobs: [userId, metric],
    doubles: [value],
    indexes: [userId],
  });
}

// Usage in tool handlers
export async function handleToolCall(tool: string, params: any, env: Env, userId: string) {
  const startTime = Date.now();

  try {
    const result = await executeTool(tool, params, env);
    const duration = Date.now() - startTime;

    recordMetric(env, userId, `tool_${tool}_success`, duration);
    recordMetric(env, userId, 'tool_calls_total', 1);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    recordMetric(env, userId, `tool_${tool}_error`, duration);
    throw error;
  }
}
```

### Structured Logging

```typescript
// src/monitoring.ts

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  userId?: string;
  tool?: string;
  error?: Error;
  metadata?: Record<string, any>;
}

export function log(entry: Omit<LogEntry, 'timestamp'>): void {
  const logEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  // Don't log sensitive data
  if (logEntry.metadata) {
    delete logEntry.metadata.token;
    delete logEntry.metadata.content;
  }

  console.log(JSON.stringify(logEntry));
}

// Usage
log({
  level: LogLevel.INFO,
  message: 'Tool call completed',
  userId: 'user123',
  tool: 'read',
  metadata: { path: 'projects/app/notes.md', duration: 123 }
});
```

### Rate Limit Tracking

```typescript
// In rate limiting middleware
export async function checkRateLimit(userId: string, env: Env): Promise<boolean> {
  const key = `rate_limit:${userId}:minute`;
  const count = await env.RATE_LIMIT_KV.get(key);

  if (count && parseInt(count) >= 100) {
    recordMetric(env, userId, 'rate_limit_hit', 1);
    log({
      level: LogLevel.WARN,
      message: 'Rate limit exceeded',
      userId,
      metadata: { window: 'minute', limit: 100 }
    });
    return false;
  }

  return true;
}
```

### Storage Quota Tracking

```typescript
// In storage middleware
export async function checkStorageQuota(userId: string, env: Env): Promise<boolean> {
  const usage = await calculateStorageUsage(userId, env);

  recordMetric(env, userId, 'storage_usage_bytes', usage.totalBytes);
  recordMetric(env, userId, 'storage_file_count', usage.fileCount);

  if (usage.totalBytes > 10 * 1024 * 1024 * 1024) { // 10GB
    log({
      level: LogLevel.ERROR,
      message: 'Storage quota exceeded',
      userId,
      metadata: { totalBytes: usage.totalBytes, limit: 10737418240 }
    });
    return false;
  }

  if (usage.totalBytes > 8 * 1024 * 1024 * 1024) { // 8GB (80% warning)
    log({
      level: LogLevel.WARN,
      message: 'Storage quota approaching limit',
      userId,
      metadata: { totalBytes: usage.totalBytes, percentage: 80 }
    });
  }

  return true;
}
```

---

## Dashboards

### CloudFlare Dashboard

**Location:** Workers & Pages → second-brain-mcp → Metrics

**Available Metrics:**
- Requests per second
- Error rate
- CPU time
- Duration (p50, p95, p99)
- Request volume by status code

### Custom Analytics Dashboard

Query Analytics Engine data:

```sql
-- Total tool calls per day
SELECT
  blob1 AS user_id,
  blob2 AS metric,
  COUNT(*) AS count,
  DATE(timestamp) AS date
FROM analytics_dataset
WHERE blob2 = 'tool_calls_total'
GROUP BY date, user_id
ORDER BY date DESC

-- Tool distribution
SELECT
  blob2 AS tool,
  COUNT(*) AS count
FROM analytics_dataset
WHERE blob2 LIKE 'tool_%_success'
GROUP BY tool
ORDER BY count DESC

-- Average latencies
SELECT
  blob2 AS tool,
  AVG(double1) AS avg_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY double1) AS p95_duration_ms
FROM analytics_dataset
WHERE blob2 LIKE 'tool_%_success'
GROUP BY tool
```

---

## Alerts

### CloudFlare Notifications

Configure in CloudFlare Dashboard → Notifications:

#### Error Rate Alert
- **Trigger:** Error rate >5% over 5 minutes
- **Action:** Email notification
- **Severity:** High

#### Request Spike Alert
- **Trigger:** Requests >10x average over 5 minutes
- **Action:** Email notification
- **Severity:** Medium

#### CPU/Memory Alert
- **Trigger:** CPU time >50ms average or memory >128MB
- **Action:** Email notification
- **Severity:** Medium

### Custom Alerts (Future)

```typescript
// src/monitoring.ts

export async function checkAlertConditions(env: Env): Promise<void> {
  // Query Analytics Engine for metrics
  const errorRate = await getErrorRate(env);
  const storageUsage = await getStorageUsage(env);
  const rateLimitHitRate = await getRateLimitHitRate(env);

  if (errorRate > 0.05) {
    await sendAlert({
      severity: 'high',
      message: `Error rate is ${errorRate * 100}%`,
      metric: 'error_rate',
      value: errorRate
    });
  }

  if (storageUsage > 8 * 1024 * 1024 * 1024) { // 8GB
    await sendAlert({
      severity: 'medium',
      message: 'Storage approaching 10GB limit',
      metric: 'storage_usage',
      value: storageUsage
    });
  }

  if (rateLimitHitRate > 0.1) {
    await sendAlert({
      severity: 'low',
      message: 'High rate limit hit rate',
      metric: 'rate_limit_hit_rate',
      value: rateLimitHitRate
    });
  }
}
```

---

## Logging Best Practices

### What to Log

**Always Log:**
- Tool calls (tool name, user ID, duration, success/failure)
- OAuth events (login, token refresh, failures)
- Rate limit violations
- Storage quota warnings and violations
- Errors with stack traces
- Backup status (success/failure, file count, duration)
- Security events (failed auth, path traversal attempts)

**Never Log:**
- File contents
- OAuth tokens or secrets
- User passwords (we don't have any, but principle applies)
- Sensitive file paths (may contain PII)

### Log Structure

```typescript
// Good: Structured, searchable
log({
  level: LogLevel.ERROR,
  message: 'Tool call failed',
  userId: 'user123',
  tool: 'read',
  error: new Error('File not found'),
  metadata: { path: '[REDACTED]', statusCode: 404 }
});

// Bad: Unstructured string
console.log('Error reading file /secret/path.md for user123: File not found');
```

### Log Levels

- **DEBUG:** Development only, verbose details
- **INFO:** Normal operations, tool calls, OAuth flows
- **WARN:** Potential issues, approaching limits, deprecated features
- **ERROR:** Failures, exceptions, security events

---

## Debugging Tools

### View Live Logs

```bash
# Tail all logs
wrangler tail

# Filter by text
wrangler tail --search "error"

# JSON format
wrangler tail --format json | jq .

# Specific log level
wrangler tail --format json | jq 'select(.level == "error")'
```

### Query Analytics

Access via CloudFlare Dashboard or API:

```bash
# Get analytics data
curl -X GET "https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql" \
  -H "Authorization: Bearer {api_token}" \
  -d "SELECT * FROM analytics_dataset WHERE timestamp > NOW() - INTERVAL '1' HOUR"
```

### Inspect KV State

```bash
# List OAuth tokens
wrangler kv:key list --binding OAUTH_KV

# Get token details
wrangler kv:key get "token:abc123" --binding OAUTH_KV

# List rate limits
wrangler kv:key list --binding RATE_LIMIT_KV

# Get rate limit counter
wrangler kv:key get "rate_limit:user123:minute" --binding RATE_LIMIT_KV
```

### Inspect R2 Storage

```bash
# List all files
wrangler r2 object list second-brain

# Get file metadata
wrangler r2 object get second-brain/projects/app/notes.md --metadata

# Check storage size
wrangler r2 object list second-brain | jq '[.objects[].size] | add'
```

---

## Performance Optimization

### Monitoring Performance

Track these metrics to identify optimization opportunities:

1. **Slow tool calls:** p95 > 500ms
2. **Large file operations:** Files >1MB
3. **Expensive glob patterns:** Patterns matching >1000 files
4. **Frequent searches:** Same grep pattern repeated

### Optimization Strategies

**Caching:**
- Cache frequently accessed files (e.g., README.md)
- Cache glob results for common patterns
- TTL: 5 minutes

**Batch Operations:**
- Batch R2 list operations
- Parallelize independent tool calls

**Query Optimization:**
- Use glob patterns efficiently
- Limit grep max_matches
- Use file metadata to avoid reads

---

## Cost Monitoring

### CloudFlare Pricing (Reference)

**Workers:**
- Free: 100k requests/day
- Paid: $5/month + $0.50 per million requests

**R2 Storage:**
- Storage: $0.015/GB/month
- Class A operations (write): $4.50 per million
- Class B operations (read): $0.36 per million

**KV:**
- Storage: $0.50/GB/month
- Reads: $0.50 per 10 million
- Writes: $5 per million

### Cost Forecasting

```typescript
// Estimate monthly cost based on usage
export function estimateMonthlyCost(metrics: UsageMetrics): number {
  const workerRequests = metrics.toolCallsPerDay * 30;
  const r2Storage = metrics.storageGB;
  const r2ClassAOps = metrics.writesPerDay * 30;
  const r2ClassBOps = metrics.readsPerDay * 30;

  const workerCost = Math.max(0, (workerRequests - 100000) * 0.50 / 1_000_000);
  const r2StorageCost = r2Storage * 0.015;
  const r2ClassACost = r2ClassAOps * 4.50 / 1_000_000;
  const r2ClassBCost = r2ClassBOps * 0.36 / 1_000_000;

  return workerCost + r2StorageCost + r2ClassACost + r2ClassBCost + 5; // +$5 base
}
```

---

## Incident Response

### Severity Levels

**P0 - Critical:**
- Service completely down
- Data loss or corruption
- Security breach

**P1 - High:**
- Major feature broken
- High error rate (>10%)
- Authentication failures

**P2 - Medium:**
- Single tool broken
- Performance degradation
- Rate limiting issues

**P3 - Low:**
- Minor bugs
- Feature requests
- Cosmetic issues

### Response Procedures

1. **Detect:** Alert fires or user reports issue
2. **Assess:** Check logs, metrics, determine severity
3. **Mitigate:** Rollback or hotfix if needed
4. **Communicate:** Update users if user-facing
5. **Resolve:** Deploy fix, verify resolution
6. **Document:** Post-mortem for P0/P1

---

## Related Documentation

- [Architecture](./architecture.md) - System components to monitor
- [Implementation](./implementation.md) - Monitoring code structure
- [Security](./security.md) - Security metrics and alerts
- [Deployment](./deployment.md) - Monitoring setup
- [Testing](./testing.md) - Performance testing
