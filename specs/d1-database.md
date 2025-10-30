# D1 Database Specification

This specification defines the database requirements for persistent metadata storage and queryable indexes. The system uses Cloudflare D1 (SQLite) to maintain file metadata, AI-generated summaries, and audit logs that enable efficient queries without scanning R2 storage.

---

## Purpose and Scope

The MCP server requires structured data storage for metadata that needs to be queried efficiently. While R2 provides object storage for file content, D1 enables the system to answer questions like "which files need AI summary regeneration?" or "what files were modified in the last week?" without scanning every object in R2.

**Primary use cases:**

The database MUST support file metadata tracking including AI-generated summaries, content change detection, and temporal queries. This enables the system to cache expensive AI operations and regenerate summaries only when file content changes.

The database SHOULD support audit logging for security and compliance requirements. Audit records enable historical analysis of user actions, security investigations, and debugging of production issues beyond the retention window of Cloudflare Workers Logs.

**Out of scope:**

File content storage remains in R2. The database stores only metadata, never full file contents. [OUT OF SCOPE: Full-text search indexes and semantic embeddings are deferred to future enhancements.]

---

## ORM and Migration Requirements

The system MUST use Drizzle ORM for type-safe database access and Drizzle Kit for schema migrations. This provides compile-time verification of queries, automated migration generation, and a consistent developer experience.

Drizzle was chosen for its TypeScript-native design, zero-runtime overhead, and excellent support for Cloudflare D1. The ORM MUST NOT introduce query performance degradation beyond 5ms per operation compared to raw SQL.

Schema migrations MUST be versioned and applied through Drizzle Kit's migration system. The deployment process MUST run pending migrations before deploying new worker code to prevent runtime errors from schema mismatches.

---

## File Metadata Schema

The database MUST maintain a `file_metadata` table tracking every file in the user's second brain. This table serves as the authoritative source for file metadata queries and enables efficient change detection for AI summary regeneration.

### Required Fields

Each file record MUST include the user identifier and file path as a composite primary key. The path field MUST exactly match the R2 object key to maintain referential consistency.

File size in bytes and modification timestamp MUST be stored to support quota calculations and temporal queries. The modification timestamp MUST reflect R2's `uploaded` timestamp to maintain consistency between systems.

A content hash field MUST store the SHA-256 digest of file contents. This enables change detection by comparing the current file hash against the stored hash without re-reading file contents. The system uses this hash to determine which files need AI summary regeneration.

### AI-Generated Metadata

The table MUST support optional AI-generated summary fields. The `ai_summary` field stores a single-sentence description of file contents (maximum 200 characters). The `summary_generated_at` timestamp records when the summary was created, enabling staleness detection. The `summary_model` field identifies which AI model generated the summary (e.g., "@cf/meta/llama-3-8b-instruct") for debugging and quality assessment.

Summary fields MAY be null for files that haven't been processed yet or for non-text files that cannot be summarized.

### User Metadata

The table SHOULD include a `tags` field storing a JSON array of user-applied tags and a `custom_metadata` JSON field for extensibility. These fields enable future features like tag-based filtering and user-defined metadata without schema changes.

### Indexing Requirements

The system MUST create indexes supporting common query patterns without full table scans. An index on `(user_id, modified_at DESC)` enables efficient "recently modified files" queries. An index on `(user_id, summary_generated_at)` supports finding files needing summary regeneration. An index on `(user_id, content_hash)` enables change detection queries.

---

## Data Consistency Requirements

The database serves as a secondary index for R2 objects. The system MUST maintain consistency between R2 and D1 despite the lack of distributed transactions.

### Write Consistency

When creating or updating a file, the system MUST write to R2 first, then update D1. This ordering ensures that D1 never references a file that doesn't exist in R2. If the D1 update fails after a successful R2 write, the file exists but has no metadata record. This is acceptable—the system can discover and backfill missing metadata during background jobs.

When deleting a file, the system MUST delete from D1 first, then R2. This ordering prevents orphaned metadata records that reference non-existent files. If the R2 deletion fails after successful D1 deletion, the file remains in R2 without metadata. This is also acceptable as orphaned files can be discovered through R2 listing operations.

### Eventual Consistency

The system SHOULD implement a reconciliation job that periodically compares R2 object listings against D1 metadata records. This job identifies and corrects inconsistencies caused by partial write failures. The reconciliation job MAY run daily during low-traffic periods.

---

## Performance Requirements

Database operations MUST NOT add more than 20ms overhead to MCP tool calls. File metadata reads SHOULD complete in under 5ms. Batch operations (updating multiple records) SHOULD use D1's batch API to minimize round trips.

The system MUST cache file metadata in Durable Object instance memory when multiple operations access the same file within a single MCP session. This avoids redundant database queries during multi-step workflows.

AI summary generation queries (finding files needing regeneration) SHOULD limit results to prevent timeout issues. The daily cron job MUST process summaries in batches of no more than 50 files per execution to stay within Cloudflare Workers CPU limits.

---

## Audit Logging Schema

The database SHOULD maintain an `audit_log` table recording security-relevant events and tool executions. This table enables investigating security incidents, debugging production issues, and analyzing user behavior patterns.

### Audit Record Structure

Each audit record MUST include a unique auto-incrementing identifier, timestamp, and request correlation ID matching the Logger's `requestId` field. This enables joining audit records with structured logs.

Records MUST identify the user who performed the action and SHOULD include the IP address (when available) for security analysis.

The action field MUST use a namespaced format like "tool.write" or "oauth.login" for consistent categorization. The resource type and path fields SHOULD identify what the action affected (e.g., type: "file", path: "projects/app/notes.md").

The outcome field MUST be one of "success", "error", or "denied". The HTTP status code and error message fields provide additional context for failures.

A JSON details field MAY store action-specific metadata like tool parameters or changed field values. The duration_ms field SHOULD record how long the operation took for performance analysis.

### Retention and Cleanup

Audit logs MUST be retained for at least 90 days to support security investigations. The system SHOULD automatically delete audit records older than 90 days to prevent unbounded table growth. Error records MAY be retained longer (e.g., keep the most recent 1000 errors indefinitely) for debugging recurring issues.

---

## Migration Strategy

The system MUST implement a zero-downtime migration path from the current state (no D1) to the D1-enabled state.

### Initial Schema Creation

The first migration creates the `file_metadata` table with all required fields and indexes. This migration MUST be idempotent—running it multiple times produces the same result without errors.

### Backfill Existing Files

After schema creation, a backfill job MUST scan all R2 objects and insert corresponding metadata records. The backfill job SHOULD process files in batches to avoid memory exhaustion. For each file, the job reads the object metadata (size, upload time) and content (to compute SHA-256 hash), then inserts a record with null AI summary fields.

The backfill job MUST be restartable—if interrupted, it should resume from where it left off without duplicating work. This can be achieved by checking whether metadata already exists before inserting.

### Gradual Rollout

The system SHOULD support a feature flag controlling whether to use D1 for file operations. This enables gradual rollout: D1 can be deployed and backfilled while still operating in "read-only" mode (queries allowed but updates disabled). Once backfill completes and validation passes, the flag enables write mode.

---

## Integration Points

File operations in the tool executor (see [Tools](./tools.md)) MUST update D1 metadata alongside R2 operations. The `write` tool creates or updates metadata records. The `edit` tool updates the modification timestamp and clears content hash if file contents changed. File deletion operations remove metadata records.

The repo map generator (see [Repo Map](./repo-map.md)) reads file metadata and AI summaries from D1 to construct the ASCII tree without reading every file from R2. The daily cron job queries for files needing summary regeneration based on content hash changes.

The system prompt injection mechanism (see [AGENTS.md](./agents-md.md)) MAY cache AGENTS.md content in D1 to avoid repeated R2 reads. A `cached_content` table with TTL semantics could support this use case.

---

## Future Enhancements

The database design SHOULD accommodate future features without major schema changes. A full-text search index using D1's FTS5 extension would enable fast content search across summaries. User management tables (user profiles, quotas, preferences) would support multi-user deployments. Feature flag history tables could enable the flag governance features described in [Feature Flags](./feature-flags.md).

These enhancements are [DEFERRED] to future iterations but the schema design MUST NOT prevent their implementation.

---

## Related Documentation

- [Architecture](./architecture.md) - System component interactions and data flow
- [Tools](./tools.md) - File operations that update metadata
- [Repo Map](./repo-map.md) - Queries file metadata for map generation
- [AGENTS.md](./agents-md.md) - May cache content in D1
- [Deployment](./deployment.md) - Migration execution during deployment
