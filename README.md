# Second Brain MCP

A Model Context Protocol server that enables Claude to act as your personal knowledge management assistant using the Building a Second Brain (BASB) methodology.

**Version:** 1.1
**Status:** Draft
**Platform:** Cloudflare Workers

---

## Overview

The Second Brain MCP provides file system-like operations over Cloudflare R2 storage, allowing Claude to help you capture, organize, distill, and express knowledge using the PARA (Projects, Areas, Resources, Archives) organizational framework.

### Key Features

- 🎯 **BASB Methodology** - Implements CODE workflow and PARA structure
- 📱 **Mobile & Desktop** - Seamless capture across all Claude clients
- 🔍 **Powerful Search** - Full-text search with glob and grep tools
- 🔐 **Secure** - GitHub OAuth authentication with single-user authorization
- 💾 **Automatic Backups** - Daily S3 backups with 30-day retention
- ⚡ **Fast & Reliable** - Runs on Cloudflare's edge network

---

## Documentation

### Core Documentation

- **[Overview](specs/overview.md)** - BASB methodology, design philosophy, and project goals
- **[Architecture](specs/architecture.md)** - Technical stack, system design, and data flow
- **[API Reference](specs/api-reference.md)** - Complete tool specifications (read, write, edit, glob, grep)

### Setup & Operations

- **[Implementation](specs/implementation.md)** - Project structure, dependencies, and configuration
- **[Security](specs/security.md)** - Authentication, authorization, and data protection
- **[Deployment](specs/deployment.md)** - Setup instructions, deployment process, and rollback procedures
- **[Testing](specs/testing.md)** - Testing strategy, unit tests, and manual testing checklist
- **[Monitoring](specs/monitoring.md)** - Metrics, logging, and observability

### Usage & Planning

- **[MCP Configuration](specs/mcp-configuration.md)** - Server metadata, prompts, and bootstrap files
- **[User Workflows](specs/user-workflows.md)** - Common usage patterns and example interactions
- **[Roadmap](specs/roadmap.md)** - Future enhancements, success metrics, and known limitations
- **[Glossary](specs/glossary.md)** - Terms, acronyms, and technical references

---

## Quick Start

### Prerequisites

- Cloudflare account with Workers and R2 enabled
- GitHub account for OAuth authentication
- AWS account for S3 backups (optional but recommended)
- [mise](https://mise.jdx.dev/) for managing Node.js and pnpm (recommended)
  - Or manually install Node.js 20+ and enable corepack for pnpm

### Basic Setup

**Option 1: Using mise (Recommended)**

```bash
# Clone repository
git clone <repo-url>
cd second-brain-mcp

# Install mise if you haven't already
# macOS/Linux: curl https://mise.run | sh
# Or see https://mise.jdx.dev/getting-started.html

# mise will automatically install Node.js 20 from .mise.toml
mise install

# Enable corepack for pnpm
mise run setup

# Install dependencies
pnpm install

# Create R2 bucket and KV namespaces
wrangler r2 bucket create second-brain
wrangler kv:namespace create OAUTH_KV
wrangler kv:namespace create RATE_LIMIT_KV

# Configure secrets
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY

# Run tests
pnpm test

# Deploy
wrangler deploy
```

**Option 2: Manual Setup**

```bash
# Clone repository
git clone <repo-url>
cd second-brain-mcp

# Ensure you have Node.js 20+ installed
node --version

# Enable corepack for pnpm
corepack enable

# Install dependencies (corepack will automatically install the correct pnpm version)
pnpm install

# Continue with R2 buckets, secrets, etc. (same as above)
```

See [Deployment Guide](specs/deployment.md) for detailed instructions.

---

## Tools

The MCP provides 5 core tools:

| Tool | Description | Use Case |
|------|-------------|----------|
| **read** | Read file contents with optional range | View notes, preview large files |
| **write** | Create or overwrite files | Capture new notes, create documents |
| **edit** | Replace text, move, rename, or delete files | Update content, reorganize notes |
| **glob** | Find files matching patterns | List files, explore structure |
| **grep** | Search file contents with regex | Full-text search, find topics |

See [API Reference](specs/api-reference.md) for detailed specifications.

---

## BASB Methodology

### CODE Workflow

- **Capture**: Keep what resonates (ideas, insights, inspiration)
- **Organize**: Save for actionability using PARA
- **Distill**: Progressively summarize and highlight key points
- **Express**: Transform knowledge into tangible outputs

### PARA Structure

- **Projects**: Active efforts with specific goals and deadlines
- **Areas**: Ongoing responsibilities requiring sustained attention
- **Resources**: Topics of interest and reference material
- **Archives**: Completed or inactive items

See [Overview](specs/overview.md) for more on the methodology.

---

## Usage Examples

### Capture a Note

```
User: "Save this idea to my second brain: Add dark mode toggle to settings"

Claude: [Uses write tool]
"I've saved your idea to projects/app-improvements/dark-mode-toggle.md"
```

### Search Notes

```
User: "What notes do I have about user research?"

Claude: [Uses grep tool]
"I found 8 notes mentioning user research across Projects, Areas, and Resources..."
```

### Weekly Review

```
User: [Invokes weekly-review prompt]

Claude: [Uses glob and read tools]
"Here's your weekly review - you have 5 active projects, 2 need attention..."
```

See [User Workflows](specs/user-workflows.md) for more examples.

---

## Architecture

```
Claude Client → MCP Client (OAuth) → Worker (Hono + MCP) → R2 Storage
                                              ↓
                                         GitHub OAuth
                                              ↓
                                          S3 Backup
```

### Tech Stack

- **Platform**: Cloudflare Workers
- **Storage**: Cloudflare R2
- **Framework**: Hono
- **Protocol**: MCP via `@modelcontextprotocol/sdk`
- **OAuth**: GitHub OAuth via `@cloudflare/workers-oauth-provider`
- **Backup**: AWS S3 via `@aws-sdk/client-s3`

See [Architecture](specs/architecture.md) for details.

---

## Security

- **Authentication**: OAuth 2.1 via GitHub
- **Authorization**: Single-user allowlist (GitHub user ID)
- **Data Protection**: HTTPS/TLS, R2 server-side encryption
- **Rate Limiting**: 100 requests/minute, 10,000/day
- **Storage Caps**: 10GB total, 10,000 files max

See [Security](specs/security.md) for comprehensive security details.

---

## Roadmap

### MVP (Current)
✅ Core tools (read, write, edit, glob, grep)
✅ GitHub OAuth authentication
✅ Bootstrap files and PARA structure
✅ Rate limiting and storage quotas
✅ Automated S3 backups

### Phase 2 (3-6 months)
- Multi-user support
- Backlink indexing and graph view
- Tag management
- Version history
- Progressive summarization tracking

### Phase 3 (6-12 months)
- AI-powered connections
- Template system
- Smart review scheduling
- Export functionality

See [Roadmap](specs/roadmap.md) for complete feature plan.

---

## Testing

### Unit Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm run coverage

# Watch mode
pnpm run test:watch
```

Target: 95%+ code coverage on all core modules.

### Manual Testing

See [Testing Guide](specs/testing.md) for comprehensive manual testing checklist.

---

## Monitoring

### Key Metrics

- **Usage**: Tool calls per day, file creation rate, storage usage
- **Performance**: Tool call latency (p50, p95, p99), error rates
- **Cost**: Workers requests, R2 operations, storage size
- **Security**: Failed auth attempts, rate limit hits

### Alerts

Configure in Cloudflare Dashboard:
- Error rate >5%
- Storage approaching 10GB limit
- Unusual request spikes

See [Monitoring](specs/monitoring.md) for implementation details.

---

## Contributing

This is currently a personal project (PoC phase). Future contributions welcome after MVP stabilization.

### Development Workflow

1. Create feature branch
2. Write tests first
3. Implement feature
4. Run tests: `pnpm test` (or `mise run test`)
5. Deploy to dev: `wrangler deploy --env development` (or `mise run deploy:dev`)
6. Manual testing on dev environment
7. Create PR with detailed description

### Using mise Tasks

The project includes mise task shortcuts for common commands:

```bash
mise run setup      # Enable corepack for pnpm
mise run dev        # Start development server
mise run test       # Run tests
mise run build      # Run type checking
mise run deploy     # Deploy to production
mise run deploy:dev # Deploy to development
```

---

## Known Limitations

- Single-user only (MVP)
- Text/markdown files only (no images, PDFs)
- No offline access
- No version history (Phase 2)
- Daily backups (up to 24h data loss window)
- Storage cap: 10GB, 10,000 files

See [Roadmap](specs/roadmap.md#known-limitations) for complete list.

---

## License

[To be determined]

---

## Resources

### BASB Resources
- [Building a Second Brain](https://www.buildingasecondbrain.com) - Official website
- [PARA Method Guide](https://fortelabs.com/blog/para/) - Organizational framework

### Technical References
- [MCP Specification](https://spec.modelcontextprotocol.io) - Protocol documentation
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) - Platform docs
- [Cloudflare R2](https://developers.cloudflare.com/r2/) - Storage docs

See [Glossary](specs/glossary.md) for comprehensive references.

---

## Support

For issues or questions:
- Check [Documentation](specs/) first
- Review [User Workflows](specs/user-workflows.md) for examples
- See [Deployment Guide](specs/deployment.md) for setup help
- Check [Testing Guide](specs/testing.md) for troubleshooting

---

## Acknowledgments

- **Tiago Forte** - Building a Second Brain methodology
- **Anthropic** - Claude and MCP protocol
- **Cloudflare** - Workers and R2 platform

---

**Built with Claude Code**
