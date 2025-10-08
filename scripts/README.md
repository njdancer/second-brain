# MCP Test Client

Comprehensive test script that simulates Claude's MCP connection flow to debug and verify server behavior.

## Purpose

This test client helps identify whether connection issues are server-side or client-side by programmatically testing each step of the MCP protocol independently.

## Setup

### Quick Setup for OAuth Testing

**See [LOCAL-OAUTH-SETUP.md](../LOCAL-OAUTH-SETUP.md) for detailed step-by-step instructions!**

**Quick version:**

1. Create a GitHub OAuth app at https://github.com/settings/developers
   - Callback URL: `http://localhost:3000/callback`

2. Copy configuration file:
   ```bash
   cp .env.test.example .env.test
   ```

3. Add your OAuth app credentials to `.env.test`:
   ```bash
   GITHUB_CLIENT_ID_LOCAL=<your_client_id>
   GITHUB_CLIENT_SECRET_LOCAL=<your_client_secret>
   ```

### Alternative: Quick Testing Without OAuth Setup

**Use a GitHub Personal Access Token:**

1. Generate token: https://github.com/settings/tokens/new
   - Scope: `read:user` only
   - Copy token

2. Add to `.env.test`:
   ```bash
   GITHUB_OAUTH_TOKEN=ghp_xxxxxxxxxxxx
   ```

3. Run quick tests:
   ```bash
   pnpm run test:mcp:quick
   ```

## Usage

### Quick Check (Recommended)

Runs all scenarios except OAuth flow. Uses pre-configured token from `.env.test`.

```bash
pnpm run test:mcp:quick
```

Takes ~30 seconds.

### Full Flow (With OAuth)

Runs ALL scenarios including OAuth flow. Opens browser for GitHub authorization.

```bash
pnpm run test:mcp:full
```

Takes ~2-3 minutes.

### Single Scenario

Run just one specific scenario for debugging:

```bash
pnpm run test:mcp:scenario -- "authenticated initialize"
pnpm run test:mcp:scenario -- "tools list"
pnpm run test:mcp:scenario -- "tool call - read"
```

## Test Scenarios

The test client runs the following scenarios:

1. **Discovery (unauthenticated)** - Tests unauthenticated initialize request
2. **OAuth authorization URL** - Tests OAuth URL generation
3. **Authenticated initialize** - Tests authenticated initialize with full capabilities
4. **Tools list** - Tests tools/list request (expects 5 tools)
5. **Tool call - write** - Tests write tool (triggers bootstrap)
6. **Tool call - read** - Tests read tool (verifies bootstrap)
7. **Tool call - glob** - Tests glob pattern matching
8. **Prompts list** - Tests prompts/list request (expects 3 prompts)
9. **Invalid token** - Tests token validation (expects 401)

## Output

The script provides colored, hierarchical output:

```
🧪 MCP Client Test Suite

Testing server: https://second-brain-mcp.nick-01a.workers.dev
Mode: quick
============================================================

✅ PASS: Discovery (unauthenticated initialize) (234ms)
  ✅ Response status
  ✅ Protocol version
  ✅ Server name
  ✅ OAuth instructions present
  ✅ No session ID for unauthenticated

✅ PASS: Authenticated initialize (187ms)
  ✅ Response status
  ✅ Protocol version
  ✅ Tools capability present
  ✅ Prompts capability present
  ✅ No OAuth instructions for authenticated

❌ FAIL: Tools list request (203ms)
  ✅ Response status
  ❌ Tool count - expected: 5, actual: 0
  ❌ Tool: read - expected: "present", actual: "missing"
  ...

============================================================
Summary:
  ✅ 7 passed
  ❌ 2 failed
  ⏱️  Total time: 1842ms

⚠️  Failed scenarios:
  - Tools list request
  - Tool call - write
```

## Expected Outcomes

### If All Tests Pass
- ✅ Server implementation is correct
- ✅ Issue is in Claude client configuration/implementation
- ✅ Can provide test results to Claude support
- ✅ Can confidently use the server

### If Tests Fail
- ❌ Identifies exact point of failure
- ❌ Provides detailed error information
- ❌ Can reproduce issue independently of Claude
- ❌ Can fix and re-test quickly

## Common Issues

### "No auth token configured"
- Make sure you've created `.env.test` (not just `.env.test.example`)
- Set `GITHUB_OAUTH_TOKEN` in `.env.test`

### "Response status: 401"
- Your OAuth token is invalid or expired
- Generate a new token using the steps above

### "Response status: 403"
- Your GitHub user ID is not in the allowlist
- Make sure `GITHUB_ALLOWED_USER_ID` is set in your server secrets

### "ECONNREFUSED"
- Server is not running or URL is incorrect
- Check `MCP_SERVER_URL` in `.env.test`

## Troubleshooting

Enable verbose output by modifying the script:
```typescript
// At the top of test-mcp-client.ts
const DEBUG = true;
```

This will log full request/response bodies for debugging.

## Integration with CI/CD

Add to GitHub Actions for continuous monitoring:

```yaml
# .github/workflows/e2e-test.yml
name: E2E MCP Client Test

on:
  workflow_dispatch:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - name: Run MCP client test
        env:
          MCP_SERVER_URL: https://second-brain-mcp.nick-01a.workers.dev
          GITHUB_OAUTH_TOKEN: ${{ secrets.TEST_OAUTH_TOKEN }}
        run: pnpm run test:mcp:quick
```

## Development

To modify the test scenarios, edit `scripts/test-mcp-client.ts`:

1. Add new test method to `MCPTestClient` class
2. Add scenario to `scenarios` array
3. Run with `pnpm run test:mcp:quick`

See inline comments in the script for guidance.
