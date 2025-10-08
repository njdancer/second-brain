# Getting a Test OAuth Token

To run authenticated test scenarios, you need a GitHub OAuth token. Choose one of these methods:

## Option 1: GitHub Personal Access Token (Easiest)

1. Go to https://github.com/settings/tokens/new
2. Fill in:
   - **Note**: `Second Brain MCP Test Client`
   - **Expiration**: 30 days (or longer)
   - **Scopes**: Select `read:user` only
3. Click "Generate token"
4. Copy the token (starts with `ghp_`)
5. Add to `.env.test`:
   ```bash
   GITHUB_OAUTH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

## Option 2: Manual OAuth Flow

1. Open your browser to: https://second-brain-mcp.nick-01a.workers.dev/oauth/authorize

2. You'll be redirected to GitHub to authorize the app

3. After authorizing, you'll be redirected back to the callback URL

4. Open browser DevTools (F12) → Network tab

5. Look for the callback request (`/oauth/callback?code=...`)

6. In the response, find the OAuth token (it might be in a cookie or response body)

7. Add the token to `.env.test`:
   ```bash
   GITHUB_OAUTH_TOKEN=<token_from_response>
   ```

## Option 3: Extract Token from Claude Desktop

If you've already connected Claude Desktop to the server:

1. Open Claude Desktop
2. Go to Settings → MCP Servers
3. Find "Second Brain MCP"
4. The token might be stored in Claude's config file:
   - macOS: `~/Library/Application Support/Claude/`
   - Windows: `%APPDATA%\Claude\`
   - Linux: `~/.config/Claude/`

## Getting Your GitHub User ID

You also need to set `TEST_USER_ID` in `.env.test`. To find your GitHub user ID:

**Method 1: GitHub API**
```bash
curl https://api.github.com/users/YOUR_GITHUB_USERNAME
```

Look for the `id` field in the response.

**Method 2: GitHub Profile**
1. Go to https://github.com/settings/profile
2. Your user ID is in the URL when you hover over your profile picture

## Testing After Setup

Once you have the token configured:

```bash
# Test all authenticated scenarios
pnpm run test:mcp:quick

# Test specific scenario
pnpm run test:mcp:scenario "authenticated initialize"
pnpm run test:mcp:scenario "tools list"
```

## Troubleshooting

### "Response status: 401"
Your token is invalid or expired. Generate a new one.

### "Response status: 403"
Your GitHub user ID is not in the allowlist. Make sure `GITHUB_ALLOWED_USER_ID` is set correctly in your Cloudflare Worker secrets.

Check the configured user ID:
```bash
pnpm wrangler secret list
```

### "No auth token configured"
Make sure `.env.test` exists (not just `.env.test.example`) and has `GITHUB_OAUTH_TOKEN` set.

## Security Note

⚠️ **Never commit `.env.test` to git!** It's already in `.gitignore`.

The OAuth token gives read-only access to your GitHub profile, but it's still sensitive. Treat it like a password.
