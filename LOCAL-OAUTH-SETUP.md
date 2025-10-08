# Local OAuth Testing Setup Guide

This guide walks you through setting up a GitHub OAuth app for local testing of the MCP server's OAuth flow.

## Why You Need This

The production MCP server uses a GitHub OAuth app configured with:
- **Callback URL:** `https://second-brain-mcp.nick-01a.workers.dev/oauth/callback`

For local testing, we need a **separate** OAuth app configured with:
- **Callback URL:** `http://localhost:3000/callback`

GitHub OAuth requires callback URLs to be pre-registered, so we can't use the production app for localhost testing.

---

## Step-by-Step Setup

### 1. Create Local Testing OAuth App

1. Go to: https://github.com/settings/developers
2. Click **"New OAuth App"**
3. Fill in the form:

   ```
   Application name:       Second Brain MCP - Local Testing
   Homepage URL:          http://localhost:3000
   Application description: Local development testing for Second Brain MCP
   Authorization callback URL: http://localhost:3000/callback
   ```

4. Click **"Register application"**

### 2. Get Your Credentials

1. You'll see your **Client ID** (starts with `Ov23...`)
   - Copy this - you'll need it!

2. Click **"Generate a new client secret"**
   - Copy the secret immediately - you can't see it again!
   - It should start with `gho_` or similar

### 3. Update Your `.env.test` File

Open `/Users/nickdancer/Code/Second Brain/second-brain/.env.test` and add:

```bash
# MCP Test Client Configuration
MCP_SERVER_URL=https://second-brain-mcp.nick-01a.workers.dev

# GitHub OAuth App for Local Testing
GITHUB_CLIENT_ID_LOCAL=Ov23xxxxxxxxxxxxxxxxx     # Your Client ID from step 2
GITHUB_CLIENT_SECRET_LOCAL=gho_xxxxxxxxxxxx      # Your Client Secret from step 2

# Optional: Custom callback port (default: 3000)
CALLBACK_PORT=3000

# Optional: For quick testing without OAuth flow
GITHUB_OAUTH_TOKEN=

# Your GitHub User ID (for authorization testing)
TEST_USER_ID=
```

### 4. Test the OAuth Flow

Run the test:

```bash
pnpm run test:mcp:oauth
```

**What happens:**
1. ✅ Starts a local HTTP server on `http://localhost:3000`
2. ✅ Opens your browser to GitHub OAuth authorization
3. ✅ You click "Authorize" on GitHub
4. ✅ GitHub redirects to `http://localhost:3000/callback?code=...`
5. ✅ Script captures the code automatically
6. ✅ Exchanges code for access token (using your local OAuth app)
7. ✅ Tests MCP server with the token
8. ✅ Verifies tools are available!

**Expected output:**

```
🧪 MCP OAuth Flow Test

============================================================

📡 Step 1: Starting local callback server...
Using port: 3000

🔗 Step 2: Generating OAuth URL...
OAuth URL: https://github.com/login/oauth/authorize?client_id=...

🌐 Step 3: Opening browser for authentication...
Please authorize the application in your browser.

⏳ Step 4: Waiting for OAuth callback...
Callback server listening on http://localhost:3000

[Browser opens - you authorize]

Exchanging code for token with GitHub...
✅ Got access token from GitHub!
GitHub user: your-username (ID: 12345)

✅ OAuth flow completed successfully!

🧪 Step 5: Testing MCP connection with token...
✅ MCP connection successful! Tools are available.
```

---

## Troubleshooting

### "GITHUB_CLIENT_ID_LOCAL not set"

Make sure you:
1. Created the `.env.test` file (not just `.env.test.example`)
2. Added `GITHUB_CLIENT_ID_LOCAL=...` with your actual Client ID
3. Restarted your terminal or ran `source .env.test`

### "redirect_uri is not associated with this application"

This means the callback URL doesn't match what's registered. Check:
1. OAuth app has callback: `http://localhost:3000/callback` (exact match!)
2. You're using the correct Client ID from the **local** OAuth app (not production)
3. Port in `.env.test` matches: `CALLBACK_PORT=3000`

### "Port 3000 is already in use"

Another app is using port 3000. Options:
1. Stop the other app
2. Change the port in both places:
   - `.env.test`: `CALLBACK_PORT=3001`
   - GitHub OAuth app callback: `http://localhost:3001/callback`

### Browser doesn't open automatically

The script will print the OAuth URL. Manually copy and paste it into your browser:
```
https://github.com/login/oauth/authorize?client_id=...
```

---

## What This Tests

The test verifies the **complete end-to-end OAuth flow**:

1. ✅ OAuth URL generation works
2. ✅ GitHub authorization works
3. ✅ Code exchange works
4. ✅ MCP server accepts Bearer token
5. ✅ Authenticated initialize returns capabilities
6. ✅ Tools are available and callable

This is the **exact same flow** that Claude desktop/mobile use!

---

## Security Notes

### Keep Your Client Secret Safe!

- ✅ **DO:** Store in `.env.test` (gitignored)
- ❌ **DON'T:** Commit to git
- ❌ **DON'T:** Share publicly
- ❌ **DON'T:** Use in client-side code

### Separate Apps for Security

We use **separate OAuth apps** for:
- **Production:** Server-side token exchange (client secret on Cloudflare)
- **Local Testing:** Direct token exchange (client secret in `.env.test`)

This is best practice - if your local credentials leak, production is unaffected!

### Token Scope

The OAuth app only requests `read:user` scope - minimal permissions needed for:
- Reading your GitHub profile
- Verifying your identity
- No repo access, no write access

---

## Alternative: GitHub Personal Access Token

If you don't want to set up OAuth, you can use a Personal Access Token:

1. Go to: https://github.com/settings/tokens/new
2. Name: `Second Brain MCP Testing`
3. Scope: `read:user` only
4. Generate token
5. Add to `.env.test`:
   ```bash
   GITHUB_OAUTH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

6. Run quick tests (no OAuth flow):
   ```bash
   pnpm run test:mcp:quick
   ```

This skips the OAuth flow but still tests authenticated MCP requests.

---

## Next Steps

After successful OAuth testing:

1. **Try with Claude Desktop:**
   - The production server should now work!
   - Add server: `https://second-brain-mcp.nick-01a.workers.dev`
   - Follow OAuth prompts
   - Tools should appear!

2. **Report Results:**
   - If OAuth test passes but Claude desktop still fails, we know it's a Claude client issue
   - If OAuth test fails, we need to debug the server further

---

**Questions?** Check the test output for detailed error messages and follow the troubleshooting steps above.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
