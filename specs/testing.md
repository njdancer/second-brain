# Testing Strategy

Comprehensive testing approach for the Second Brain MCP server, including unit tests, integration tests, and manual testing procedures.

---

## Overview

Heavy unit test coverage is critical due to difficulty of integration testing MCP protocol. Target 95%+ code coverage with emphasis on:
- Edge cases and error conditions
- Concurrent operations
- Rate limiting boundaries
- Security validation

---

## Unit Tests

### Coverage Requirements

**100% Coverage Required:**
- Individual tool functions (read, write, edit, glob, grep)
- OAuth flow handlers
- R2 operations abstraction
- Rate limiting logic
- Bootstrap file generation
- Backup sync logic
- Error handling for all edge cases

**95%+ Coverage Required:**
- MCP server implementation
- Monitoring and logging
- Utility functions

### Test Framework

```json
{
  "test": "jest",
  "coverage": "jest --coverage",
  "test:watch": "jest --watch"
}
```

**Note:** Use `pnpm` instead of `npm` for all commands.

**Configuration (`jest.config.js`):**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
};
```

### Future: vitest-pool-workers

**Status: Blocked by CommonJS dependency compatibility (as of Jan 2025)**

**What We'd Like:**

Use `@cloudflare/vitest-pool-workers` to run tests in actual workerd runtime instead of Node.js. This would:
- Test with production environment (Cloudflare Workers APIs)
- Catch workerd-specific compatibility issues during testing
- Eliminate differences between test and production runtimes

**Why We Can't:**

Our dependencies use CommonJS modules that import JSON files:
- `ajv` (via `@modelcontextprotocol/sdk`) uses `require('./schema.json')`
- `express` modules (via MCP SDK) use `require('./statuses.json')`
- `@aws-sdk/client-s3` (in backup.ts) uses various CJS JSON imports

workerd doesn't support CommonJS `require()`, so these fail with `SyntaxError: Unexpected token ':'` when JSON files are parsed as JavaScript.

**Why Production Works:**

Wrangler's bundler (esbuild) pre-processes everything before deployment:
- Reads JSON files at build time and inlines them as JS objects
- Transpiles CommonJS to ESM
- Bundles into pure ESM that workerd can execute

**When to Revisit:**

- vitest-pool-workers improves CommonJS compatibility
- Dependencies migrate to pure ESM (ajv v9+ is ESM-only)
- We can pre-bundle dependencies for testing (similar to production)

### Mock Implementations

**R2 Bucket Mock:**
```typescript
// test/mocks/r2.ts
export class MockR2Bucket {
  private storage = new Map<string, ArrayBuffer>();

  async get(key: string): Promise<R2Object | null> {
    const data = this.storage.get(key);
    if (!data) return null;
    return {
      key,
      body: data,
      size: data.byteLength,
      httpMetadata: {},
      customMetadata: {}
    } as R2Object;
  }

  async put(key: string, value: ArrayBuffer): Promise<void> {
    this.storage.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async list(options?: R2ListOptions): Promise<R2Objects> {
    // Implementation for listing with prefix/delimiter support
  }
}
```

**KV Namespace Mock:**
```typescript
// test/mocks/kv.ts
export class MockKVNamespace {
  private storage = new Map<string, { value: string; expiration?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.storage.get(key);
    if (!entry) return null;
    if (entry.expiration && Date.now() > entry.expiration) {
      this.storage.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.storage.set(key, {
      value,
      expiration: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined
    });
  }
}
```

---

## Key Test Cases

### Tool: `read`

```typescript
describe('read tool', () => {
  it('should read entire file', async () => {
    // Test reading full file content
  });

  it('should read line range', async () => {
    // Test range [10, 20]
  });

  it('should return 404 for missing file', async () => {
    // Test error handling
  });

  it('should enforce max_bytes limit', async () => {
    // Test byte limit enforcement
  });

  it('should handle files with unicode characters', async () => {
    // Test UTF-8 encoding
  });

  it('should reject invalid line ranges', async () => {
    // Test [0, 10], [-1, 10], [20, 10]
  });
});
```

### Tool: `write`

```typescript
describe('write tool', () => {
  it('should create new file', async () => {});

  it('should overwrite existing file', async () => {});

  it('should reject files over 1MB', async () => {});

  it('should reject invalid paths', async () => {
    // Test path traversal: '../etc/passwd'
  });

  it('should handle concurrent writes to same file', async () => {
    // Test race conditions
  });

  it('should enforce storage quotas', async () => {
    // Test 10GB and 10k file limits
  });
});
```

### Tool: `edit`

```typescript
describe('edit tool', () => {
  it('should replace unique string', async () => {});

  it('should reject non-unique old_str', async () => {
    // Test string appearing multiple times
  });

  it('should reject missing old_str', async () => {});

  it('should move file to new path', async () => {});

  it('should rename file', async () => {});

  it('should delete file', async () => {});

  it('should edit and move in one operation', async () => {});

  it('should reject move to existing path', async () => {});

  it('should handle special characters in old_str', async () => {
    // Test quotes, backslashes, unicode
  });
});
```

### Tool: `glob`

```typescript
describe('glob tool', () => {
  it('should match all markdown files', async () => {
    // Pattern: **/*.md
  });

  it('should match files in directory', async () => {
    // Pattern: projects/**
  });

  it('should match files with name pattern', async () => {
    // Pattern: **/*meeting*
  });

  it('should handle empty results', async () => {});

  it('should enforce max_results limit', async () => {});

  it('should reject invalid patterns', async () => {
    // Test malformed globs
  });

  it('should return metadata', async () => {
    // Test size, modified date
  });
});
```

### Tool: `grep`

```typescript
describe('grep tool', () => {
  it('should find matches across all files', async () => {});

  it('should scope search to path', async () => {
    // Test path: projects/**
  });

  it('should return context lines', async () => {
    // Test context_lines: 2
  });

  it('should handle regex patterns', async () => {
    // Test: \\buser\\s+research\\b
  });

  it('should be case-insensitive by default', async () => {});

  it('should enforce max_matches limit', async () => {});

  it('should reject invalid regex', async () => {});

  it('should handle multiline matches', async () => {});
});
```

### OAuth Handler

```typescript
describe('OAuth handler', () => {
  it('should complete OAuth flow', async () => {});

  it('should reject unauthorized users', async () => {
    // Test user not in allowed list
  });

  it('should store tokens in KV', async () => {});

  it('should validate tokens', async () => {});

  it('should handle token expiry', async () => {});

  it('should refresh expired tokens', async () => {});

  it('should encrypt tokens', async () => {});
});
```

### Rate Limiting

```typescript
describe('rate limiting', () => {
  it('should allow requests within limit', async () => {});

  it('should block requests over limit', async () => {
    // Test 100 requests/minute
  });

  it('should reset counters after TTL', async () => {});

  it('should enforce per-window limits', async () => {
    // Test minute, hour, day windows
  });

  it('should return retry-after header', async () => {});

  it('should enforce storage quotas', async () => {
    // Test 10GB limit
  });
});
```

### Bootstrap

```typescript
describe('bootstrap', () => {
  it('should create bootstrap files on first run', async () => {});

  it('should be idempotent', async () => {
    // Don't overwrite existing README
  });

  it('should create PARA directory structure', async () => {});

  it('should handle bootstrap errors gracefully', async () => {});
});
```

### Backup

```typescript
describe('backup', () => {
  it('should sync all files to S3', async () => {});

  it('should only sync changed files', async () => {
    // Test ETag comparison
  });

  it('should preserve directory structure', async () => {});

  it('should clean up old backups', async () => {
    // Test 30-day retention
  });

  it('should log backup statistics', async () => {});

  it('should handle S3 errors gracefully', async () => {});
});
```

---

## Integration Tests

Limited integration testing due to MCP protocol complexity.

### Test Coverage

```typescript
describe('Integration: OAuth + Tool Call', () => {
  it('should complete full OAuth flow and call tool', async () => {
    // 1. Mock GitHub OAuth
    // 2. Complete OAuth
    // 3. Call read tool with token
    // 4. Verify success
  });
});

describe('Integration: Tool Sequences', () => {
  it('should create, read, edit, delete file', async () => {
    // Test full lifecycle
  });

  it('should handle errors in sequence', async () => {
    // Test write → read (404) → error
  });
});

describe('Integration: SSE Connection', () => {
  it('should maintain SSE connection', async () => {
    // Test MCP over SSE
  });

  it('should handle connection drops', async () => {});
});
```

---

## Manual Testing Checklist

Core functionality must be manually verified with real Claude client:

### Initial Setup
- [ ] OAuth connection from Claude desktop
- [ ] OAuth connection from Claude mobile
- [ ] Bootstrap files appear on first connection
- [ ] Bootstrap is idempotent (doesn't recreate files)

### Tool: `read`
- [ ] Read entire file
- [ ] Read with line range [1, 10]
- [ ] Read non-existent file (404 error)
- [ ] Read large file (>1MB)
- [ ] Read file with unicode characters

### Tool: `write`
- [ ] Create new file in projects/
- [ ] Overwrite existing file
- [ ] Create file with special characters in content
- [ ] Attempt to write file >1MB (413 error)
- [ ] Create files in all PARA categories

### Tool: `edit`
- [ ] Replace text in file
- [ ] Replace text with special characters (quotes, backslashes)
- [ ] Attempt to replace non-existent text (400 error)
- [ ] Attempt to replace non-unique text (400 error)
- [ ] Move file between directories
- [ ] Rename file
- [ ] Delete file
- [ ] Edit and move in one operation

### Tool: `glob`
- [ ] List all files: `**/*.md`
- [ ] List files in directory: `projects/**`
- [ ] Find files by name pattern: `**/*meeting*`
- [ ] Empty results (no matches)
- [ ] Verify metadata (size, modified date)

### Tool: `grep`
- [ ] Search all files for keyword
- [ ] Search with regex pattern
- [ ] Search scoped to directory
- [ ] Search with context lines
- [ ] Case-insensitive search (default)
- [ ] Case-sensitive search
- [ ] No matches found

### Rate Limiting
- [ ] Make 100 requests in 1 minute (should work)
- [ ] Make 101st request (should get 429)
- [ ] Wait 1 minute and retry (should work)
- [ ] Verify Retry-After header

### Storage Limits
- [ ] Create multiple files approaching 10GB limit
- [ ] Attempt to exceed 10GB (507 error)
- [ ] Create 10,000 files
- [ ] Attempt to create 10,001st file (507 error)

### Error Scenarios
- [ ] Invalid path (path traversal attempt)
- [ ] Malformed tool parameters
- [ ] Expired OAuth token
- [ ] Invalid OAuth token

### Prompts
- [ ] Use `capture-note` prompt
- [ ] Use `weekly-review` prompt
- [ ] Use `research-summary` prompt

### Backup
- [ ] Wait for scheduled backup (2 AM UTC)
- [ ] Trigger manual backup: `POST /admin/backup`
- [ ] Verify files in S3
- [ ] Verify incremental backup (only changed files)

### Cross-Platform
- [ ] Test on Claude web
- [ ] Test on Claude desktop (macOS/Windows/Linux)
- [ ] Test on Claude mobile (iOS/Android)

---

## Performance Testing

### Load Tests

```typescript
describe('Performance', () => {
  it('should handle 100 concurrent reads', async () => {
    // Test concurrent tool calls
  });

  it('should complete tool call in <500ms', async () => {
    // Test p95 latency
  });

  it('should handle large file operations', async () => {
    // Test 10MB read, 1MB write
  });

  it('should list 1000 files efficiently', async () => {
    // Test glob performance
  });
});
```

### Stress Tests

- Create 10,000 files
- Search 10,000 files with grep
- Rapid tool calls (rate limit testing)
- Large file operations near limits

---

## Test Data

### Fixtures

Create test fixtures in `test/fixtures/`:

```
test/fixtures/
├── notes/
│   ├── simple.md              # Basic markdown
│   ├── unicode.md             # UTF-8 characters
│   ├── large.md               # >1MB file
│   ├── special-chars.md       # Quotes, backslashes
│   └── multiline.md           # Multiple sections
└── expected/
    ├── bootstrap-readme.md    # Expected bootstrap output
    └── para-structure.json    # Expected directory structure
```

---

## Continuous Integration

### GitHub Actions: `.github/workflows/test.yml`

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

pnpm test
if [ $? -ne 0 ]; then
  echo "Tests failed. Commit aborted."
  exit 1
fi
```

---

## Test Maintenance

### When to Update Tests

- When adding new features
- When fixing bugs (add regression test)
- When changing tool behavior
- When updating dependencies

### Test Review Checklist

- [ ] All edge cases covered
- [ ] Error conditions tested
- [ ] Concurrent operations tested
- [ ] Security validations tested
- [ ] Performance acceptable
- [ ] Tests are readable and maintainable

---

## Related Documentation

- [API Reference](./api-reference.md) - Tool specifications to test
- [Implementation](./implementation.md) - Code structure
- [Deployment](./deployment.md) - Manual testing in production
- [Monitoring](./monitoring.md) - Production verification
