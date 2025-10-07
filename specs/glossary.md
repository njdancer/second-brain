# Glossary

Terms, acronyms, and references for the Second Brain MCP project.

---

## Terminology

### BASB (Building a Second Brain)
A personal knowledge management methodology created by Tiago Forte that focuses on capturing, organizing, distilling, and expressing knowledge in a digital system.

### CODE Method
The four-step workflow of BASB:
- **Capture**: Save what resonates
- **Organize**: Organize for actionability
- **Distill**: Find the essence
- **Express**: Show your work

### PARA Method
The organizational framework of BASB based on actionability:
- **Projects**: Short-term efforts with defined goals and deadlines
- **Areas**: Long-term responsibilities requiring sustained attention
- **Resources**: Topics of interest and reference material
- **Archives**: Inactive items from other categories

### Progressive Summarization
A technique for distilling notes by iteratively highlighting important information, making knowledge more actionable over time.

---

## Technical Terms

### MCP (Model Context Protocol)
An open protocol that standardizes how AI assistants (like Claude) connect to external data sources and tools.

### SSE (Server-Sent Events)
A protocol for servers to push real-time updates to web clients over HTTP. Used as transport layer for MCP connections.

### R2 (Cloudflare R2 Storage)
Cloudflare's S3-compatible object storage service with zero egress fees. Used for storing all notes and files.

### KV (Key-Value Store)
Cloudflare's globally distributed key-value storage. Used for OAuth tokens and rate limiting.

### OAuth 2.1
Authentication protocol that allows third-party applications to access user data without sharing passwords. Used for GitHub authentication.

### Cloudflare Workers
Serverless execution environment that runs code on Cloudflare's edge network. The platform for the MCP server.

### Hono
Lightweight web framework for Cloudflare Workers, used for HTTP routing.

### Wrangler
Command-line tool for managing and deploying Cloudflare Workers.

---

## MCP Concepts

### Tool
An operation that Claude can invoke to interact with external systems. Our MCP provides 5 tools: read, write, edit, glob, grep.

### Prompt
Pre-defined workflow template that users can invoke in Claude. Examples: capture-note, weekly-review, research-summary.

### Server
The MCP server that implements the protocol and provides tools/prompts to Claude.

### Client
The Claude application (web, desktop, or mobile) that connects to MCP servers.

### Transport
The communication layer between client and server. We use SSE (Server-Sent Events).

### Binding
A Cloudflare Workers concept for accessing resources like R2 buckets or KV namespaces.

---

## Project-Specific Terms

### Bootstrap Files
The initial README and PARA structure files created on first connection to help users get started.

### Tool Call
A single invocation of an MCP tool by Claude, such as reading a file or searching content.

### Rate Limit
Restrictions on the number of tool calls a user can make within a time window (minute/hour/day).

### Storage Quota
Hard limits on total storage (10GB) and file count (10,000) per user to prevent cost escalation.

### Backup Retention
The duration (30 days) that automated S3 backups are kept before deletion.

### User Namespace
Path prefix for multi-user deployments: `users/{user_id}/...` (Phase 2 feature).

---

## Acronyms

| Acronym | Full Term | Description |
|---------|-----------|-------------|
| BASB | Building a Second Brain | Knowledge management methodology |
| CODE | Capture, Organize, Distill, Express | BASB workflow |
| PARA | Projects, Areas, Resources, Archives | BASB organizational structure |
| MCP | Model Context Protocol | Protocol for AI tool integration |
| SSE | Server-Sent Events | Transport protocol |
| R2 | Really Really Fast (speculated) | Cloudflare object storage |
| KV | Key-Value | Cloudflare key-value store |
| S3 | Simple Storage Service | AWS object storage (backup target) |
| OAuth | Open Authorization | Authentication protocol |
| API | Application Programming Interface | Programmatic interface |
| CI/CD | Continuous Integration/Continuous Deployment | Automated testing and deployment |
| TTL | Time To Live | Expiration time for cached data |
| PoC | Proof of Concept | Early prototype phase |
| MVP | Minimum Viable Product | First production-ready version |
| UX | User Experience | User interaction design |
| PKM | Personal Knowledge Management | Knowledge organization practice |

---

## File Naming Conventions

### Kebab-Case
Lowercase words separated by hyphens: `my-project-notes.md`

### PARA Categories
- `projects/` - Active initiatives
- `areas/` - Ongoing responsibilities
- `resources/` - Reference material
- `archives/` - Completed/inactive items

### Date Formats
- ISO 8601: `2025-10-07` (used in file names and metadata)
- Year-only: `archives/2024/` (for archive organization)

---

## HTTP Status Codes

| Code | Meaning | Usage in MCP |
|------|---------|--------------|
| 200 | OK | Successful operation |
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Missing/invalid OAuth token |
| 403 | Forbidden | Valid token but not allowed |
| 404 | Not Found | File doesn't exist |
| 409 | Conflict | Resource already exists (moves) |
| 413 | Payload Too Large | File size limit exceeded |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server failure |
| 507 | Insufficient Storage | Storage quota exceeded |

---

## Rate Limit Windows

| Window | Limit | Purpose |
|--------|-------|---------|
| Minute | 100 requests | Prevent burst abuse |
| Hour | 1000 requests | Daily usage distribution |
| Day | 10,000 requests | Overall usage cap |

---

## BASB Resources

### Books
- **Building a Second Brain** by Tiago Forte - The definitive guide to the methodology

### Websites
- [buildingasecondbrain.com](https://www.buildingasecondbrain.com) - Official BASB website
- [Forte Labs Blog](https://fortelabs.com/blog/) - Articles about BASB and productivity
- [PARA Method Guide](https://fortelabs.com/blog/para/) - Detailed explanation of PARA

### Related Concepts
- **Zettelkasten** - Note-linking system by Niklas Luhmann
- **GTD (Getting Things Done)** - Productivity system by David Allen
- **Evergreen Notes** - Andy Matuschak's approach to lasting notes

---

## Technical References

### MCP
- [MCP Specification](https://spec.modelcontextprotocol.io) - Official protocol specification
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - TypeScript/Python SDKs

### Cloudflare
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/) - Platform documentation
- [R2 Documentation](https://developers.cloudflare.com/r2/) - Object storage guide
- [KV Documentation](https://developers.cloudflare.com/kv/) - Key-value store guide
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) - Scheduled tasks
- [Workers OAuth Provider](https://github.com/cloudflare/workers-oauth-provider) - OAuth implementation

### Frameworks & Tools
- [Hono](https://hono.dev/) - Web framework for Workers
- [Zod](https://zod.dev/) - TypeScript schema validation
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) - CLI tool

### AWS
- [S3 Documentation](https://docs.aws.amazon.com/s3/) - Backup storage
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/) - S3 client

### GitHub
- [GitHub OAuth Apps](https://docs.github.com/en/developers/apps/building-oauth-apps) - OAuth setup
- [GitHub API](https://docs.github.com/en/rest) - User identity API

---

## Common File Extensions

| Extension | Description | Usage |
|-----------|-------------|-------|
| `.md` | Markdown | All notes and documentation |
| `.ts` | TypeScript | Source code |
| `.json` | JSON | Configuration, test fixtures |
| `.toml` | TOML | Wrangler configuration |
| `.yml`/`.yaml` | YAML | GitHub Actions workflows |

---

## Related Projects & Tools

### Knowledge Management Tools
- **Obsidian** - Markdown-based PKM with graph view
- **Notion** - All-in-one workspace
- **Roam Research** - Networked thought tool
- **Logseq** - Open-source knowledge base
- **DEVONthink** - Document management for macOS

### MCP Servers
- [MCP Servers Repository](https://github.com/modelcontextprotocol/servers) - Example MCP implementations
- File system servers
- Database connectors
- API integrations

---

## Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `GITHUB_ALLOWED_USER_ID` | Public | GitHub user ID for authorization |
| `GITHUB_CLIENT_ID` | Secret | OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Secret | OAuth App client secret |
| `COOKIE_ENCRYPTION_KEY` | Secret | 32-byte hex for token encryption |
| `S3_BACKUP_ACCESS_KEY` | Secret | AWS access key |
| `S3_BACKUP_SECRET_KEY` | Secret | AWS secret key |
| `S3_BACKUP_BUCKET` | Secret | S3 bucket name |
| `S3_BACKUP_REGION` | Secret | AWS region |

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | 2025-10-07 | Initial MVP release |
| 1.1 | 2025-10-07 | Added backup, rollback, enhanced documentation |

---

## Related Documentation

- [Overview](./overview.md) - BASB methodology and project background
- [Architecture](./architecture.md) - Technical system design
- [API Reference](./api-reference.md) - Tool specifications
- [Implementation](./implementation.md) - Code structure and configuration
- [Deployment](./deployment.md) - Setup and deployment guide
