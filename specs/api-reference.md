# API Reference

Complete specification of all MCP tools provided by the Second Brain server.

---

## Tool 1: `read`

Read file contents with optional range selection.

### Parameters

```typescript
{
  path: string,              // Path to file (e.g., "projects/app/notes.md")
  range?: [number, number],  // Optional line range [start, end] (1-indexed, inclusive)
  max_bytes?: number         // Optional byte limit for large files
}
```

### Returns

File content (text)

### Error Codes

- `404` - File not found
- `400` - Invalid path or range
- `413` - File exceeds max_bytes limit
- `500` - Server error

### Use Cases

- View entire note
- Read specific sections (head/tail equivalent)
- Preview large files

### Examples

```json
// Read entire file
{"path": "projects/launch/plan.md"}

// Read first 10 lines
{"path": "areas/health/log.md", "range": [1, 10]}

// Preview large file (first 1KB)
{"path": "resources/reference.md", "max_bytes": 1024}
```

---

## Tool 2: `write`

Create new file or overwrite existing file.

### Parameters

```typescript
{
  path: string,     // Path to file
  content: string   // Full content to write
}
```

### Returns

Success confirmation with path

### Error Codes

- `400` - Invalid path or content too large (>1MB)
- `413` - Content exceeds 1MB limit
- `429` - Rate limit exceeded
- `500` - Server error

### Use Cases

- Capture new note
- Create new document from scratch
- Replace file entirely

### Examples

```json
// Create new note
{
  "path": "projects/app/feature-spec.md",
  "content": "# Feature Specification\n\n## Overview\n..."
}

// Overwrite existing file
{
  "path": "areas/goals/q4-objectives.md",
  "content": "# Q4 Objectives (Updated)\n..."
}
```

---

## Tool 3: `edit`

Edit existing file using string replacement, with optional move/rename/delete.

### Parameters

```typescript
{
  path: string,       // Path to file to edit (REQUIRED)
  old_str?: string,   // String to find and replace (must be unique in file)
  new_str?: string,   // Replacement string (empty string to delete text)
  new_path?: string,  // If provided, move/rename file after edit
  delete?: boolean    // If true, delete the file (path still required)
}
```

### Returns

Success confirmation or error if old_str not found/not unique

### Error Codes

- `404` - File not found
- `400` - Invalid parameters (old_str not found or appears multiple times)
- `409` - Target path already exists (for moves)
- `429` - Rate limit exceeded
- `500` - Server error

### Use Cases

- Update specific section of note
- Fix typos or update content
- Move file to different PARA category
- Rename file
- Delete file

### Examples

```json
// Edit content
{
  "path": "projects/launch/plan.md",
  "old_str": "Launch date: TBD",
  "new_str": "Launch date: March 15, 2025"
}

// Move to archives
{
  "path": "projects/old-feature/spec.md",
  "new_path": "archives/2024/old-feature/spec.md"
}

// Rename file
{
  "path": "projects/app/notes.md",
  "new_path": "projects/app/design-notes.md"
}

// Delete file
{
  "path": "projects/temp/scratch.md",
  "delete": true
}

// Edit and move
{
  "path": "projects/launch/plan.md",
  "old_str": "Status: In Progress",
  "new_str": "Status: Completed",
  "new_path": "archives/2024/launch/plan.md"
}
```

### Notes

- If `delete: true`, deletes the file at `path` and ignores `old_str`, `new_str`, and `new_path`
- If `new_path` provided without `old_str`/`new_str`, acts as pure move/rename
- `old_str` must appear exactly once in file to prevent ambiguity
- For deletion, `path` is still required

---

## Tool 4: `glob`

Find files matching a pattern.

### Parameters

```typescript
{
  pattern: string,       // Glob pattern (e.g., "projects/**/*.md", "*.md")
  max_results?: number   // Optional limit (default: 100, max: 1000)
}
```

### Returns

Array of matching file paths with metadata (size, modified date)

### Error Codes

- `400` - Invalid glob pattern
- `413` - Results exceed max_results
- `500` - Server error

### Use Cases

- List files in directory
- Find all notes in a project
- Search by file name pattern
- Explore PARA structure

### Pattern Examples

- `**/*.md` - All markdown files recursively
- `projects/**/*.md` - All markdown files in projects
- `areas/health/*` - All files in health area
- `*.md` - All markdown files at root
- `**/*meeting*` - Files with "meeting" in name anywhere

### Example Response

```json
[
  {
    "path": "projects/app/notes.md",
    "size": 2048,
    "modified": "2025-10-07T14:30:00Z"
  },
  {
    "path": "projects/launch/plan.md",
    "size": 4096,
    "modified": "2025-10-06T09:15:00Z"
  }
]
```

---

## Tool 5: `grep`

Search file contents using regex.

### Parameters

```typescript
{
  pattern: string,           // Regex pattern to search for
  path?: string,             // Optional path to scope search (supports globs)
  max_matches?: number,      // Max results to return (default: 50, max: 1000)
  context_lines?: number     // Lines of context before AND after match (default: 0)
}
```

### Returns

Array of matches with file path, line number, matched line, and context

### Error Codes

- `400` - Invalid regex pattern
- `413` - Matches exceed max_matches
- `500` - Server error

### Use Cases

- Find notes mentioning specific topics
- Search across all knowledge base
- Locate specific quotes or references
- Full-text search

### Examples

```json
// Search all files
{"pattern": "user research"}

// Search in specific directory
{
  "pattern": "TODO",
  "path": "projects/**"
}

// Search with context
{
  "pattern": "launch date",
  "context_lines": 2
}

// Case-sensitive search with glob
{
  "pattern": "(?-i)API",
  "path": "resources/technical/*.md"
}
```

### Notes

- If `path` omitted, searches all files
- If `path` is glob pattern, searches matching files
- Case-insensitive by default
- `context_lines: 2` returns 2 lines before and 2 lines after each match (5 lines total including match)

### Example Response

```json
[
  {
    "path": "projects/launch/plan.md",
    "line": 15,
    "match": "Launch date: March 15, 2025",
    "context": [
      "## Timeline",
      "",
      "Launch date: March 15, 2025",
      "",
      "## Dependencies"
    ]
  }
]
```

---

## Rate Limits

### Per-User Limits

- 100 tool calls per minute
- 1000 tool calls per hour
- 10,000 tool calls per day

### Per-Tool Limits

- `write`: Max 1MB file size
- `read`: Max 10MB file size
- `glob`: Max 1000 results
- `grep`: Max 1000 matches

### Storage Limits

- Max 10GB total storage per user
- Max 10,000 files per user
- Max 10MB per individual file

### Rate Limit Response

When rate limit is exceeded, the server returns:
- HTTP Status: `429 Too Many Requests`
- Header: `Retry-After: <seconds>`
- Error message with details about limit exceeded

---

## Related Documentation

- [Architecture](./architecture.md) - System design and components
- [User Workflows](./user-workflows.md) - Common usage patterns
- [Testing](./testing.md) - Tool test specifications
