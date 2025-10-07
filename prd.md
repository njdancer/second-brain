# Second Brain MCP - Product Requirements Document

**Version:** 1.1  
**Date:** October 7, 2025  
**Author:** Claude  
**Status:** Draft

---

## 1. Executive Summary

The Second Brain MCP is a Model Context Protocol server that enables Claude to act as a personal knowledge management assistant based on the Building a Second Brain (BASB) methodology by Tiago Forte. The server provides file system-like operations over Cloudflare R2 storage, allowing Claude to capture, organize, distill, and express knowledge using the PARA (Projects, Areas, Resources, Archives) organizational framework.

### Key Objectives
- Enable seamless knowledge capture and retrieval across desktop and mobile Claude clients
- Implement BASB methodology through prompts and guidance rather than hard-coded structure
- Provide simple, composable file operations that Claude can orchestrate into complex workflows
- Maintain single-user simplicity while avoiding architectural constraints for future multi-user support

---

## 2. Background & Methodology

### Building a Second Brain (BASB)

BASB is a personal knowledge management system that externalizes cognition into a digital repository. The methodology consists of two key frameworks:

#### CODE Method
The workflow for knowledge management:
- **Capture**: Keep what resonates (ideas, insights, inspiration)
- **Organize**: Save for actionability using PARA
- **Distill**: Progressively summarize and highlight key points
- **Express**: Transform knowledge into tangible outputs

#### PARA Method
The organizational structure based on actionability:
- **Projects**: Short-term efforts with defined goals and deadlines (most actionable)
- **Areas**: Ongoing responsibilities requiring sustained attention (moderately actionable)
- **Resources**: Topics of interest and reference material (low actionability)
- **Archives**: Inactive items from other categories (not actionable)

### Design Philosophy

The MCP should:
1. **Guide, don't enforce**: Provide methodology guidance through prompts, but allow Claude to determine structure
2. **Composable operations**: Simple file operations that Claude orchestrates into sophisticated workflows
3. **Progressive complexity**: Start minimal, let structure emerge organically through use
4. **Mobile-first capture**: Optimized for quick capture on mobile, with deeper processing on desktop

---

## 3. Technical Architecture

### Stack
- **Platform**: Cloudflare Workers
- **Framework**: Hono (for HTTP routing)
- **Protocol**: Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **OAuth**: `@cloudflare/workers-oauth-provider` (GitHub as identity provider)
- **Storage**: Cloudflare R2 (single bucket, configured via wrangler)
- **Transport**: Server-Sent Events (SSE) for remote MCP connection

### Architecture Pattern
```
Claude Client → MCP Client (OAuth) → Worker (Hono + OAuth Provider) → R2 Storage
                                              ↓
                                         GitHub OAuth
```

### Authentication Flow
1. Claude initiates OAuth with MCP server's client ID/secret
2. Worker redirects user to GitHub for authentication
3. GitHub returns authorization code to worker
4. Worker validates user is authorized (checks against allowed GitHub user ID)
5. Worker issues MCP access tokens to Claude
6. Claude uses tokens for subsequent MCP tool calls

**GitHub OAuth Scopes Required:**
- `read:user` - To verify user identity and retrieve GitHub user ID

---

## 4. Core Features

### 4.1 File Operations (Tools)

All tools operate on markdown files stored in R2 with paths like `projects/app-name/notes.md`.

#### Tool 1: `read`
Read file contents with optional range selection.

**Parameters:**
```typescript
{
  path: string,              // Path to file (e.g., "projects/app/notes.md")
  range?: [number, number],  // Optional line range [start, end] (1-indexed, inclusive)
  max_bytes?: number         // Optional byte limit for large files
}
```

**Returns:** File content (text)

**Error Codes:**
- `404` - File not found
- `400` - Invalid path or range
- `413` - File exceeds max_bytes limit
- `500` - Server error

**Use cases:**
- View entire note
- Read specific sections (head/tail equivalent)
- Preview large files

---

#### Tool 2: `write`
Create new file or overwrite existing file.

**Parameters:**
```typescript
{
  path: string,     // Path to file
  content: string   // Full content to write
}
```

**Returns:** Success confirmation with path

**Error Codes:**
- `400` - Invalid path or content too large (>1MB)
- `413` - Content exceeds 1MB limit
- `429` - Rate limit exceeded
- `500` - Server error

**Use cases:**
- Capture new note
- Create new document from scratch
- Replace file entirely

---

#### Tool 3: `edit`
Edit existing file using string replacement, with optional move/rename/delete.

**Parameters:**
```typescript
{
  path: string,       // Path to file to edit (REQUIRED)
  old_str?: string,   // String to find and replace (must be unique in file)
  new_str?: string,   // Replacement string (empty string to delete text)
  new_path?: string,  // If provided, move/rename file after edit
  delete?: boolean    // If true, delete the file (path still required)
}
```

**Returns:** Success confirmation or error if old_str not found/not unique

**Error Codes:**
- `404` - File not found
- `400` - Invalid parameters (old_str not found or appears multiple times)
- `409` - Target path already exists (for moves)
- `429` - Rate limit exceeded
- `500` - Server error

**Use cases:**
- Update specific section of note
- Fix typos or update content
- Move file to different PARA category
- Rename file
- Delete file

**Notes:**
- If `delete: true`, deletes the file at `path` and ignores `old_str`, `new_str`, and `new_path`
- If `new_path` provided without `old_str`/`new_str`, acts as pure move/rename
- `old_str` must appear exactly once in file to prevent ambiguity
- For deletion, `path` is still required

---

#### Tool 4: `glob`
Find files matching a pattern.

**Parameters:**
```typescript
{
  pattern: string,       // Glob pattern (e.g., "projects/**/*.md", "*.md")
  max_results?: number   // Optional limit (default: 100, max: 1000)
}
```

**Returns:** Array of matching file paths with metadata (size, modified date)

**Error Codes:**
- `400` - Invalid glob pattern
- `413` - Results exceed max_results
- `500` - Server error

**Use cases:**
- List files in directory
- Find all notes in a project
- Search by file name pattern
- Explore PARA structure

**Pattern examples:**
- `**/*.md` - All markdown files recursively
- `projects/**/*.md` - All markdown files in projects
- `areas/health/*` - All files in health area
- `*.md` - All markdown files at root
- `**/*meeting*` - Files with "meeting" in name anywhere

---

#### Tool 5: `grep`
Search file contents using regex.

**Parameters:**
```typescript
{
  pattern: string,           // Regex pattern to search for
  path?: string,             // Optional path to scope search (supports globs)
  max_matches?: number,      // Max results to return (default: 50, max: 1000)
  context_lines?: number     // Lines of context before AND after match (default: 0)
}
```

**Returns:** Array of matches with file path, line number, matched line, and context

**Error Codes:**
- `400` - Invalid regex pattern
- `413` - Matches exceed max_matches
- `500` - Server error

**Use cases:**
- Find notes mentioning specific topics
- Search across all knowledge base
- Locate specific quotes or references
- Full-text search

**Notes:**
- If `path` omitted, searches all files
- If `path` is glob pattern, searches matching files
- Case-insensitive by default
- `context_lines: 2` returns 2 lines before and 2 lines after each match (5 lines total including match)

---

### 4.2 MCP Server Metadata

**Server Name:** `second-brain`

**Server Description:**
```
Your personal knowledge management assistant using Building a Second Brain (BASB) methodology.

BASB FRAMEWORK:
- CODE Workflow: Capture → Organize → Distill → Express
- PARA Structure: Projects (active goals) → Areas (ongoing responsibilities) → Resources (reference topics) → Archives (inactive items)

ORGANIZATION PRINCIPLES:
- Organize by actionability, not topic
- Projects have deadlines and defined outcomes
- Areas require sustained attention with no end date
- Resources are topics of interest for future use
- Archives preserve completed/inactive items

FILE STRUCTURE:
All notes are markdown files organized by path:
- projects/{project-name}/ - Active projects with specific goals
- areas/{area-name}/ - Ongoing responsibilities
- resources/{topic}/ - Reference material and interests
- archives/{year}/ - Completed/inactive items

Let the structure emerge naturally through use. Create folders as needed by creating files within them.

GUIDANCE FOR CLAUDE:
When working with the second brain:
1. Suggest descriptive, kebab-case filenames (e.g., product-launch-plan.md)
2. Help users decide PARA placement based on actionability
3. Create connections between related notes using markdown links
4. During capture, add metadata (date, source, tags) at the top of notes
5. Encourage progressive summarization (bold key points)
6. Suggest moving completed projects to archives with year prefix
7. During weekly reviews, identify orphaned notes and suggest categorization
8. Recommend specific, outcome-oriented project names over vague ones
```

---

### 4.3 MCP Prompts (Optional Workflows)

Prompts are pre-defined workflows users can explicitly invoke through Claude's MCP prompt interface.

#### Prompt 1: `capture-note`
Quick capture workflow for mobile.

**Arguments:**
- `content` (required): The note content to capture
- `context` (optional): Where this came from (conversation, article URL, etc.)
- `tags` (optional): Comma-separated tags

**Template:**
```
I need to capture this note into my second brain:

Content: {content}
Context: {context}
Tags: {tags}

Please:
1. Determine the best PARA category based on content
2. Suggest a descriptive filename (kebab-case)
3. Add metadata (date, source, tags) to the note
4. Save to appropriate location
5. Confirm where you saved it
```

---

#### Prompt 2: `weekly-review`
Guided weekly review of the second brain.

**Arguments:**
- `focus_areas` (optional): Specific projects or areas to review

**Template:**
```
Let's do a weekly review of my second brain.

Focus areas: {focus_areas}

Please:
1. List active projects and their status
2. Identify projects that should move to archives
3. Find orphaned notes that need categorization
4. Suggest connections between related notes
5. Highlight areas needing attention
6. Recommend quick wins for the coming week
```

---

#### Prompt 3: `research-summary`
Process and summarize research on a topic.

**Arguments:**
- `topic` (required): The research topic
- `output_location` (optional): Where to save summary

**Template:**
```
I've been researching {topic}. Let's process this into my second brain.

Please:
1. Search existing notes about {topic}
2. Identify key themes and insights
3. Create a progressive summary (bold key points)
4. Suggest related resources to explore
5. Save summary to {output_location or suggest appropriate location}
```

---

### 4.4 Initial Bootstrap Files

Bootstrap is triggered when `/README.md` does not exist in the R2 bucket. On first successful OAuth connection, create these files:

#### `/README.md`
```markdown
# My Second Brain

This is your personal knowledge management system using the BASB methodology.

## PARA Structure

- **projects/** - Active initiatives with specific goals and deadlines
- **areas/** - Ongoing responsibilities that need sustained attention
- **resources/** - Topics of interest and reference material
- **archives/** - Completed projects and inactive items

## Getting Started

Start capturing notes! The structure will emerge naturally as you use it.

Ask Claude to help you:
- Capture new notes: "Save this idea to my second brain"
- Find information: "What notes do I have about [topic]?"
- Weekly review: "Let's review my projects and areas"
- Process research: "Summarize my research on [topic]"

## Tips

- Notes are markdown files - use headers, lists, and links freely
- Link between notes using relative paths: `[related note](./other-note.md)`
- Let Claude suggest organization - it understands BASB principles
- Review and refine regularly - knowledge management is iterative
```

#### `/projects/README.md`
```markdown
# Projects

Short-term efforts with defined goals and deadlines.

A project should:
- Have a clear outcome you're working toward
- Have a deadline (even if approximate)
- End at some point (then move to archives)

Examples:
- Launch new website by Q4
- Learn Spanish for vacation in June
- Plan and execute office move
```

#### `/areas/README.md`
```markdown
# Areas

Ongoing responsibilities requiring sustained attention.

An area should:
- Be a long-term responsibility
- Require maintenance to uphold a standard
- Never truly be "done"

Examples:
- Health & Fitness
- Career Development
- Home Maintenance
- Relationships
```

#### `/resources/README.md`
```markdown
# Resources

Topics of interest and reference material.

Resources are:
- Things you're interested in learning about
- Reference material for future use
- Not tied to current responsibilities

Examples:
- Web Design principles
- Productivity techniques
- Favorite recipes
- Book notes
```

#### `/archives/README.md`
```markdown
# Archives

Inactive items from Projects, Areas, and Resources.

Move here when:
- Projects are completed or abandoned
- Areas are no longer responsibilities
- Resources are no longer interesting

Keep archives organized by year for easy retrieval.
```

---

## 5. Implementation Details

### 5.1 Project Structure

```
second-brain-mcp/
├── .github/
│   └── workflows/
│       ├── deploy.yml           # Production deployment
│       ├── test.yml             # CI testing
│       └── rollback.yml         # Rollback workflow
├── src/
│   ├── index.ts                 # Worker entrypoint
│   ├── oauth-handler.ts         # GitHub OAuth flow
│   ├── mcp-server.ts            # MCP protocol implementation
│   ├── tools/                   # Individual tool implementations
│   │   ├── read.ts
│   │   ├── write.ts
│   │   ├── edit.ts
│   │   ├── glob.ts
│   │   └── grep.ts
│   ├── storage.ts               # R2 operations abstraction
│   ├── backup.ts                # S3 backup integration
│   ├── monitoring.ts            # Metrics and logging
│   └── bootstrap.ts             # Initial file creation
├── test/
│   ├── unit/                    # Unit tests for each module
│   ├── integration/             # Integration tests
│   └── fixtures/                # Test data
├── wrangler.toml                # Cloudflare configuration
├── package.json
└── README.md
```

---

### 5.2 Dependencies

```json
{
  "dependencies": {
    "@cloudflare/workers-oauth-provider": "1.0.0",
    "@modelcontextprotocol/sdk": "1.0.0",
    "@aws-sdk/client-s3": "3.600.0",
    "hono": "4.5.0",
    "octokit": "3.2.0",
    "zod": "3.23.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "4.20241001.0",
    "@types/jest": "29.5.0",
    "jest": "29.7.0",
    "wrangler": "3.70.0",
    "typescript": "5.5.0",
    "ts-jest": "29.2.0"
  }
}
```

**Note:** Exact versions specified to prevent breaking changes during PoC phase.

---

### 5.3 Wrangler Configuration

```toml
name = "second-brain-mcp"
main = "src/index.ts"
compatibility_date = "2024-10-01"

[vars]
# Get GitHub user ID from: https://api.github.com/users/YOUR_USERNAME
# or check your GitHub profile URL
GITHUB_ALLOWED_USER_ID = "your-github-user-id"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "second-brain"

[[kv_namespaces]]
binding = "OAUTH_KV"
id = "your-oauth-kv-namespace-id"

[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-rate-limit-kv-namespace-id"

[env.development]
vars = { GITHUB_ALLOWED_USER_ID = "dev-user-id" }

[[env.development.r2_buckets]]
binding = "STORAGE"
bucket_name = "second-brain-dev"

[[env.development.kv_namespaces]]
binding = "OAUTH_KV"
id = "dev-oauth-kv-namespace-id"

[[env.development.kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "dev-rate-limit-kv-namespace-id"
```

**Secrets (set via `wrangler secret put`):**
- `GITHUB_CLIENT_ID` - From GitHub OAuth App
- `GITHUB_CLIENT_SECRET` - From GitHub OAuth App
- `COOKIE_ENCRYPTION_KEY` - Random 32-byte hex string
- `S3_BACKUP_ACCESS_KEY` - AWS access key for S3 backups
- `S3_BACKUP_SECRET_KEY` - AWS secret key for S3 backups
- `S3_BACKUP_BUCKET` - AWS S3 bucket name for backups
- `S3_BACKUP_REGION` - AWS region (e.g., us-east-1)

---

### 5.4 Rate Limiting

Implement basic rate limiting to prevent abuse and cost escalation.

**Per-user rate limits:**
- 100 tool calls per minute
- 1000 tool calls per hour
- 10,000 tool calls per day

**Per-tool specific limits:**
- `write`: Max 1MB file size
- `read`: Max 10MB file size
- `glob`: Max 1000 results
- `grep`: Max 1000 matches

**Storage limits (hard caps to prevent cost escalation):**
- Max 10GB total storage per user
- Max 10,000 files per user
- Max 10MB per individual file

**Implementation:**
- Use `RATE_LIMIT_KV` namespace with TTL for rate limit counters
- Key format: `rate_limit:{user_id}:{window}` (e.g., `rate_limit:12345:minute`)
- Return `429 Too Many Requests` when exceeded
- Include `Retry-After` header with seconds until reset
- Storage limits checked before write operations, return `507 Insufficient Storage`

---

### 5.5 File Naming Conventions

**Guidance provided to Claude via server description:**

- Use kebab-case for filenames: `my-project-notes.md`
- Use descriptive names: `product-launch-plan.md` not `notes.md`
- Use `.md` extension for all notes
- Avoid special characters except hyphens (underscores acceptable but discouraged)
- Keep names concise but meaningful (under 50 characters recommended)

**Note:** These are suggestions embedded in the server description, not enforced by the system. Claude has flexibility to adapt based on user preferences.

---

### 5.6 Backup Strategy

**Automated R2 to S3 Backup:**
- Daily backup of entire R2 bucket to AWS S3
- Implemented via Cloudflare Cron Trigger
- Uses AWS SDK for S3 to sync files
- Preserves directory structure
- Incremental backups (only changed files)
- Retention: 30 days of daily backups

**Cron Configuration:**
```toml
[triggers]
crons = ["0 2 * * *"]  # Daily at 2 AM UTC
```

**Backup Process:**
1. List all objects in R2
2. For each object, check if it exists in S3 with same ETag
3. If different or missing, copy to S3 with date prefix: `backups/YYYY-MM-DD/path/to/file.md`
4. Log backup statistics to CloudFlare Analytics
5. Clean up backups older than 30 days

**Manual Backup:**
Users can manually trigger backup via special endpoint: `POST /admin/backup` (requires OAuth token)

---

## 6. User Experience

### 6.1 Connection Flow

1. User opens Claude (web, desktop, or mobile)
2. User adds MCP server via URL: `https://second-brain.your-domain.workers.dev/sse`
3. Claude requests OAuth credentials
4. User enters client ID and secret (provided during setup)
5. Browser opens to OAuth consent page
6. User signs in with GitHub
7. Worker validates user against allowed list (`GITHUB_ALLOWED_USER_ID`)
8. User approves MCP access (scopes: `read:user`)
9. Worker issues tokens to Claude and stores in `OAUTH_KV`
10. MCP server becomes available in Claude's tools
11. On first use, bootstrap files are created if `/README.md` doesn't exist

---

### 6.2 Capture Workflow (Mobile)

**User:** "I just had an idea for improving our onboarding flow. Can you save this to my second brain? The idea is to add a progress indicator showing users how far they are through setup."

**Claude:**
1. Recognizes capture intent
2. Analyzes content to determine PARA category (likely a Project or Area)
3. Suggests filename based on content
4. Calls `write` tool with formatted note
5. Confirms: "I've saved your onboarding improvement idea to `projects/product-improvements/onboarding-progress-indicator.md`. Would you like me to add any additional context or link it to related notes?"

---

### 6.3 Search Workflow (Desktop)

**User:** "What notes do I have about user research?"

**Claude:**
1. Calls `grep` with pattern "user research"
2. Analyzes results across PARA categories
3. Presents organized summary:

"I found 8 notes mentioning user research:

**Active Projects:**
- projects/feature-redesign/user-interviews.md
- projects/q4-roadmap/research-findings.md

**Areas:**
- areas/product-management/research-methods.md

**Resources:**
- resources/ux-design/user-research-best-practices.md
- resources/books/lean-ux-notes.md

**Archives:**
- archives/2024/old-project/initial-research.md

Would you like me to summarize the key insights from any of these?"

---

### 6.4 Weekly Review Workflow

**User:** Uses prompt: `weekly-review`

**Claude:**
1. Calls `glob` to list all projects
2. Calls `read` on recent project files
3. Analyzes progress and status
4. Provides structured review:

"**Weekly Review - October 7, 2025**

**Active Projects (5):**
1. ✅ Launch marketing campaign - Ready to move to archives (completed)
2. 🟡 Website redesign - In progress, deadline next week
3. 🔴 Q4 planning - Needs attention, deadline approaching
4. 🟢 Learn TypeScript - On track
5. 🟡 Home office setup - Stalled, no recent updates

**Recommendations:**
- Archive the marketing campaign project
- Focus on Q4 planning this week
- Consider if home office setup is still a priority

**Quick Wins:**
- Update website redesign status
- Add deadline to TypeScript learning project
- Create next actions list for Q4 planning

Would you like me to help with any of these?"

---

## 7. Security & Privacy

### 7.1 Authentication

- OAuth 2.1 via GitHub
- Required scope: `read:user` for identity verification
- User must be in allowed list (GitHub user ID configured in `GITHUB_ALLOWED_USER_ID`)
- Tokens stored in `OAUTH_KV` with TTL
- Refresh token support for long sessions

### 7.2 Authorization

- Single user initially (yourself)
- All operations scoped to authenticated user's bucket
- No cross-user data access possible
- Future: Multi-user support would add user namespacing in R2 paths

### 7.3 Data Protection

- All data stored in private R2 bucket
- HTTPS/TLS for all connections
- OAuth tokens encrypted in KV
- No logging of file contents (only metadata)
- Rate limiting prevents abuse and cost escalation
- Hard storage caps prevent runaway costs

### 7.4 Access Control

- Only authorized GitHub user can access MCP (verified against `GITHUB_ALLOWED_USER_ID`)
- Claude requires explicit permission for tool use
- User sees all tool calls in Claude UI
- Can revoke OAuth tokens at any time via GitHub or KV cleanup
- Admin endpoints (backup) require OAuth token

---

## 8. Deployment

### 8.1 Prerequisites

1. Cloudflare account with Workers enabled
2. GitHub account
3. AWS account (for S3 backups)
4. GitHub OAuth App created:
   - Homepage URL: `https://second-brain.your-domain.workers.dev`
   - Callback URL: `https://second-brain.your-domain.workers.dev/callback`
   - Scopes: `read:user`
5. Note your GitHub user ID from: `https://api.github.com/users/YOUR_USERNAME`

### 8.2 Setup Steps

```bash
# 1. Clone and install
git clone <repo>
cd second-brain-mcp
npm install

# 2. Create R2 buckets
wrangler r2 bucket create second-brain
wrangler r2 bucket create second-brain-dev

# 3. Create KV namespaces
wrangler kv:namespace create OAUTH_KV
wrangler kv:namespace create RATE_LIMIT_KV
wrangler kv:namespace create OAUTH_KV --preview  # For dev
wrangler kv:namespace create RATE_LIMIT_KV --preview  # For dev

# 4. Set secrets (production)
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY  # Generate: openssl rand -hex 32
wrangler secret put S3_BACKUP_ACCESS_KEY
wrangler secret put S3_BACKUP_SECRET_KEY
wrangler secret put S3_BACKUP_BUCKET
wrangler secret put S3_BACKUP_REGION

# 5. Update wrangler.toml with your values (KV IDs, GitHub user ID)

# 6. Run tests
npm test

# 7. Deploy to development
wrangler deploy --env development

# 8. Test in development, then deploy to production
wrangler deploy

# 9. Note the deployed URL for Claude configuration
```

### 8.3 Claude Configuration

In Claude (web/desktop/mobile):
1. Settings → Integrations → Add MCP Server
2. URL: `https://second-brain.your-domain.workers.dev/sse`
3. OAuth Client ID: (from GitHub OAuth App)
4. OAuth Client Secret: (from GitHub OAuth App)
5. Complete OAuth flow
6. Server appears in tools list

### 8.4 Rollback Plan

Rollback is facilitated via GitHub Actions and Wrangler deployments.

**Automated Rollback via GitHub Actions:**

`.github/workflows/rollback.yml`:
```yaml
name: Rollback Deployment

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Deployment version to rollback to'
        required: true
        type: string

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.version }}
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Deploy to production
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      
      - name: Notify rollback
        run: echo "Rolled back to version ${{ inputs.version }}"
```

**Manual Rollback:**
```bash
# Rollback to specific git tag/commit
git checkout <version-tag>
npm ci
npm test
wrangler deploy

# Or use Cloudflare dashboard to rollback to previous deployment
```

**Rollback Strategy:**
1. Keep last 10 production deployments accessible in Cloudflare
2. Tag each production deployment in Git: `v1.0.0`, `v1.0.1`, etc.
3. On critical issues, trigger rollback workflow via GitHub Actions
4. Automated rollback runs tests before deploying previous version
5. Manual rollback option via Cloudflare dashboard for emergencies

---

## 9. Testing Strategy

### 9.1 Unit Tests

Heavy unit test coverage is critical due to difficulty of integration testing MCP protocol.

**Required Coverage:**
- Individual tool functions (read, write, edit, glob, grep) - 100%
- OAuth flow handlers - 100%
- R2 operations abstraction - 100%
- Rate limiting logic - 100%
- Bootstrap file generation - 100%
- Backup sync logic - 100%
- Error handling for all edge cases - 100%

**Test Framework:**
- Jest with ts-jest
- Mock R2 bindings using in-memory storage
- Mock KV bindings with Map-based implementation
- Test fixtures for various markdown files

**Key Test Cases:**
- File operations with special characters in paths and content
- Concurrent tool calls (race conditions)
- Rate limit boundary conditions
- Large file handling (near limits)
- Glob pattern edge cases (empty results, wildcards)
- Regex escaping in grep
- OAuth token expiry and refresh
- Bootstrap idempotency (don't overwrite existing files)

### 9.2 Integration Tests

Limited integration testing due to MCP protocol complexity.

**Test Coverage:**
- Full OAuth flow with mock GitHub API
- Tool call sequences (create → read → edit → delete)
- Error propagation through layers
- SSE connection handling

**Note:** Full end-to-end testing with real Claude client is manual due to MCP SDK limitations.

### 9.3 Manual Testing Checklist

Core functionality must be manually verified:

- [ ] OAuth connection from Claude desktop
- [ ] OAuth connection from Claude mobile
- [ ] Create first note (bootstrap files appear correctly)
- [ ] Read existing note (full content)
- [ ] Read note with line range
- [ ] Edit note content (replace text)
- [ ] Edit note with special characters (quotes, backslashes)
- [ ] Move note between PARA categories
- [ ] Rename note
- [ ] Delete note
- [ ] Search with glob patterns (all pattern types)
- [ ] Search with very long file paths
- [ ] Search content with grep (case sensitivity, special chars)
- [ ] Test on mobile Claude (capture workflow)
- [ ] Test on desktop Claude (review workflow)
- [ ] Test rate limiting (approach limits, verify 429 responses)
- [ ] Test storage limits (approach 10GB, verify 507 responses)
- [ ] Test error scenarios (missing files, invalid paths, malformed requests)
- [ ] Weekly review prompt execution
- [ ] Capture note prompt execution
- [ ] Backup execution (manual trigger)
- [ ] Verify S3 backup contents match R2

---

## 10. Monitoring & Observability

### 10.1 Metrics to Track

**Usage Metrics:**
- Tool calls per user per day/week/month
- Tool call distribution (which tools used most)
- File creation rate
- File read/write ratio
- Average file size
- Total storage used per user
- PARA category distribution (which folders used most)

**Performance Metrics:**
- Tool call latency (p50, p95, p99)
- R2 operation latency
- OAuth flow completion time
- Backup duration
- Error rates by tool
- Rate limit hit rate

**Cost Metrics:**
- Cloudflare Workers requests
- R2 storage size
- R2 operation count
- KV read/write operations
- Data egress

### 10.2 Implementation

Use CloudFlare Analytics for metrics collection:

```typescript
// In monitoring.ts
export function recordMetric(
  env: Env,
  userId: string,
  metric: string,
  value: number
) {
  // Use Workers Analytics Engine
  env.ANALYTICS.writeDataPoint({
    blobs: [userId, metric],
    doubles: [value],
    indexes: [userId]
  });
}
```

**Dashboard:**
- Use CloudFlare dashboard for real-time metrics
- Set up alerts for:
  - Error rate > 5%
  - Storage approaching 10GB limit
  - Unusual spike in operations (potential abuse)
  - Backup failures

### 10.3 Logging

**What to Log:**
- Tool calls (path, tool name, user ID, timestamp) - NOT file contents
- OAuth events (login, token refresh, failures)
- Rate limit violations
- Errors with stack traces
- Backup status (success/failure, file count, duration)

**What NOT to Log:**
- File contents
- File names (may contain sensitive info)
- OAuth tokens or secrets

---

## 11. Future Enhancements

### Phase 2 (Post-MVP)
- Multi-user support with user namespacing
- Backlink indexing and graph view
- Tag management and tag-based search
- Progressive summarization tracking
- Template system for common note types
- Version history using R2 versioning
- Export functionality (zip archive)

### Phase 3 (Advanced)
- AI-powered connections and suggestions
- Automatic categorization assistance
- Smart review scheduling
- Integration with calendar/tasks
- Mobile PWA for capture
- Collaboration features
- Public sharing of selected notes

### Potential Integrations
- Obsidian sync adapter
- Notion export/import
- Email to second brain
- Voice memo capture
- Web clipper browser extension

---

## 12. Success Metrics

### MVP Success Criteria
- [ ] Successfully deployed to Cloudflare Workers
- [ ] OAuth authentication working (>95% success rate)
- [ ] All 5 tools functional and tested
- [ ] Bootstrap files created on first use
- [ ] Can capture notes from mobile Claude
- [ ] Can search and retrieve notes
- [ ] Can organize notes using PARA structure
- [ ] Rate limiting prevents abuse
- [ ] Storage limits prevent cost escalation
- [ ] Automated backups to S3 working
- [ ] No data loss or corruption
- [ ] Unit test coverage >95%

### Usage Metrics (Post-Launch)
- Notes created per week
- Tool usage frequency
- Search query patterns
- PARA category distribution
- Average note size
- Links between notes
- Weekly review completion rate

### Quality Metrics
- Tool error rate < 1%
- OAuth success rate > 95%
- Average tool response time < 500ms
- User satisfaction with organization
- Knowledge retrieval success rate

---

## 13. Known Limitations

1. **No offline access**: Requires internet connection for both Claude and R2
2. **File format**: Only text/markdown files (no images, PDFs, etc.)
3. **Search limitations**: Regex only, no semantic search
4. **No version history**: Edits overwrite previous versions (until Phase 2)
5. **Rate limits**: Prevents very large operations (intentional)
6. **Storage caps**: 10GB per user, 10,000 files max (cost control)
7. **Single bucket**: All data in one R2 bucket (simplicity choice)
8. **GitHub dependency**: OAuth tied to GitHub (could add other providers later)
9. **Backup delay**: Daily backups mean up to 24h data loss window
10. **PoC status**: No formal documentation or support structure yet

---

## 14. Open Questions

1. **Prompt defaults**: Should prompts be included in MVP or added later based on usage patterns?
2. **Error verbosity**: Should error messages expose internal details or stay generic?
3. **Backup timing**: Is 2 AM UTC appropriate or should it be configurable?
4. **File size limits**: Are 1MB write / 10MB read limits appropriate for typical use?
5. **Mobile optimization**: Do we need special mobile-specific tools or are existing tools sufficient?

---

## 15. Appendix

### A. BASB Resources
- Book: "Building a Second Brain" by Tiago Forte
- Website: https://www.buildingasecondbrain.com
- PARA Guide: https://fortelabs.com/blog/para/

### B. Technical References
- MCP Specification: https://spec.modelcontextprotocol.io
- Cloudflare Workers OAuth: https://github.com/cloudflare/workers-oauth-provider
- Cloudflare R2 Docs: https://developers.cloudflare.com/r2/
- Cloudflare Workers Cron: https://developers.cloudflare.com/workers/configuration/cron-triggers/

### C. Glossary
- **BASB**: Building a Second Brain methodology
- **PARA**: Projects, Areas, Resources, Archives organizational system
- **CODE**: Capture, Organize, Distill, Express workflow
- **MCP**: Model Context Protocol
- **R2**: Cloudflare's object storage (S3-compatible)
- **SSE**: Server-Sent Events (transport for remote MCP)
- **Progressive Summarization**: Iteratively highlighting key points in notes
- **PoC**: Proof of Concept

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-07 | Claude | Initial PRD draft |
| 1.1 | 2025-10-07 | Claude | Fixed critical, important, and minor issues. Added backup strategy, rollback plan, monitoring, expanded testing requirements, clarified OAuth scopes, improved error codes, added storage limits |

---

**End of Document**