# Second Brain MCP User Guide

Welcome! This guide will help you get started with your Second Brain MCP server.

---

## What is Second Brain MCP?

Second Brain MCP is a personal knowledge management system that works with Claude (AI assistant). It helps you capture, organize, and retrieve ideas, notes, and knowledge using the Building a Second Brain (BASB) methodology.

**Key Benefits:**
- 📱 Capture notes from any Claude client (mobile, desktop, web)
- 🗂️ Automatic organization using the PARA method
- 🔍 Powerful search across all your notes
- 🔒 Secure and private (only you can access)
- 💾 Automatic daily backups

---

## Getting Started

### Prerequisites

Before you begin, you'll need:
1. A Cloudflare account (for hosting)
2. A GitHub account (for authentication)
3. Claude access (desktop, web, or mobile)

### Setup Steps

1. **Deploy the Server**
   - Follow the [Deployment Checklist](DEPLOYMENT_CHECKLIST.md)
   - Your administrator should provide you with the server URL

2. **Connect Claude to Your Second Brain**
   - Open Claude (any client)
   - Go to Settings → Integrations → MCP Servers
   - Click "Add MCP Server"
   - Enter:
     - **Name:** Second Brain
     - **URL:** `https://your-server-url.workers.dev/sse`
   - Click "Connect"

3. **Authenticate with GitHub**
   - Browser will open to GitHub
   - Sign in (if not already)
   - Click "Authorize" to grant access
   - You'll be redirected back to Claude

4. **Start Using Your Second Brain!**
   - Your PARA folders are automatically created on first use
   - Try capturing your first note (see examples below)

---

## Understanding BASB

### The CODE Workflow

**C**apture → **O**rganize → **D**istill → **E**xpress

1. **Capture**: Save ideas, insights, and inspiration as they come to you
2. **Organize**: File them into PARA categories based on actionability
3. **Distill**: Progressively summarize and highlight key points
4. **Express**: Transform your knowledge into tangible outputs

### The PARA Method

Your Second Brain is organized into four main folders:

#### 📁 Projects
Active efforts with specific goals and deadlines.

**Examples:**
- `projects/website-redesign/`
- `projects/q4-marketing-campaign/`
- `projects/learn-spanish/`

**When to use:** The work has a clear end state and deadline.

#### 📁 Areas
Ongoing responsibilities requiring sustained attention.

**Examples:**
- `areas/health/`
- `areas/finances/`
- `areas/professional-development/`

**When to use:** It's a sphere of activity with standards to maintain over time.

#### 📁 Resources
Topics of interest and reference material.

**Examples:**
- `resources/books/`
- `resources/recipes/`
- `resources/design-inspiration/`

**When to use:** It's something you want to learn about or reference later.

#### 📁 Archives
Completed or inactive items from other categories.

**Examples:**
- `archives/2024/completed-projects/`
- `archives/old-notes/`

**When to use:** A project is complete or an area is no longer relevant.

---

## How to Use Your Second Brain

### Capture a Note

Just tell Claude what you want to save:

```
You: "Save this to my second brain: Meeting with Sarah tomorrow at 2pm
to discuss Q4 goals. Need to prepare slides on user growth metrics."

Claude: "I've saved your note to projects/q4-planning/meeting-sarah.md"
```

Claude will:
- Automatically determine the best location (Projects/Areas/Resources/Archives)
- Create a descriptive filename
- Format the content as markdown
- Organize it in your PARA structure

### Find Notes

Ask Claude to search your notes:

```
You: "What notes do I have about user growth?"

Claude: [Searches your Second Brain]
"I found 5 notes mentioning user growth:
1. projects/q4-planning/meeting-sarah.md
2. areas/product-metrics/growth-tracking.md
3. resources/articles/growth-strategies.md
..."
```

### Read a Note

Ask Claude to read a specific note:

```
You: "Show me my meeting notes with Sarah"

Claude: [Reads the file]
"Here are your meeting notes from projects/q4-planning/meeting-sarah.md:
..."
```

### Update a Note

Ask Claude to modify existing notes:

```
You: "Update my meeting notes to add: 'Decided to focus on mobile conversion rate'"

Claude: [Updates the file]
"I've updated your meeting notes with the new decision."
```

### Organize Notes

Move or rename notes as your projects evolve:

```
You: "Move the Q4 planning notes to archives - we finished that project"

Claude: [Moves files to archives]
"I've moved your Q4 planning notes to archives/2024/q4-planning/"
```

---

## Example Workflows

### Morning Capture (Mobile)

**Scenario:** You're commuting and have ideas you want to capture quickly.

```
You: "Quick capture: Idea for improving onboarding - add progress bar
showing users their setup completion percentage"

Claude: "Captured! Saved to projects/product-improvements/onboarding-progress-bar.md"
```

### Research & Learning (Desktop)

**Scenario:** You're reading articles and want to save key insights.

```
You: "I just read an interesting article about habit formation.
Save these key points:
- Habits form through repetition over 66 days on average
- Environment design is more important than willpower
- Stack new habits onto existing ones"

Claude: "I've saved your notes to resources/learning/habit-formation.md
with your three key points formatted and ready for future reference."
```

### Weekly Review (Desktop)

**Scenario:** Every Sunday, you review your week and plan ahead.

```
You: "Let's do my weekly review"

Claude: [Uses weekly-review prompt]
"Here's your weekly review:

📊 Active Projects (5):
1. Website redesign - 3 notes this week
2. Q4 marketing - 2 notes
...

✅ Completed Items (2):
- Blog post draft finished (move to archives?)
...

💡 Insights:
- You captured 12 notes this week about product improvements
- Consider creating a dedicated product roadmap document
...

Would you like to organize anything or update project statuses?"
```

### Project Completion

**Scenario:** You've finished a project and want to archive it.

```
You: "The website redesign project is done. Can you help me wrap it up?"

Claude: [Reviews project files]
"Congratulations! I can help archive the website redesign project.

I found 15 files in projects/website-redesign/. Would you like me to:
1. Move them to archives/2024/website-redesign/
2. Create a project summary document with key learnings
3. Tag any reusable resources for future projects?"

You: "Yes to all"

Claude: [Executes cleanup]
"Done! I've:
✅ Archived all project files
✅ Created archives/2024/website-redesign/PROJECT_SUMMARY.md
✅ Copied reusable design components to resources/design-system/"
```

---

## Available Tools

Your Second Brain provides 5 core tools (you don't need to use these directly - Claude uses them for you):

| Tool | What It Does | Example Use |
|------|--------------|-------------|
| **write** | Create new notes | Capturing ideas |
| **read** | Read note contents | Reviewing past notes |
| **edit** | Modify, move, or delete notes | Updating or reorganizing |
| **glob** | Find files by pattern | "Show all markdown files" |
| **grep** | Search within notes | "Find notes about X" |

---

## Tips & Best Practices

### Capture Liberally

- Don't overthink where things go - Claude helps organize
- Capture quickly, organize later
- It's better to have too much than to forget something important

### Use Descriptive Titles

Good titles help you find notes later:
- ✅ `customer-feedback-mobile-app.md`
- ❌ `notes.md`

### Regular Reviews

Schedule weekly reviews to:
- Archive completed projects
- Move inactive areas to archives
- Identify patterns and insights
- Plan next week

### Progressive Summarization

As notes become important, refine them:
1. **First pass:** Highlight key sentences
2. **Second pass:** Bold the most important phrases
3. **Third pass:** Create a summary at the top
4. **Final pass:** Extract into a new note if needed

### Trust the System

- Your notes are backed up daily
- Search works across everything
- Claude remembers where you put things
- Focus on capturing, not organizing

---

## Troubleshooting

### "I can't connect to my Second Brain"

**Possible causes:**
1. Server not deployed - check with administrator
2. OAuth not configured - verify GitHub OAuth App setup
3. Network issues - try again in a few minutes

**Solutions:**
- Check the [Deployment Checklist](DEPLOYMENT_CHECKLIST.md)
- Review [Deployment Guide](specs/deployment.md)
- Verify server health: visit `https://your-server-url.workers.dev/health`

### "I get a 401 Unauthorized error"

**Cause:** Your authentication token expired or you're not on the allowed list.

**Solution:**
1. Try reconnecting to refresh your token
2. Check that your GitHub user ID matches `GITHUB_ALLOWED_USER_ID` in server config
3. Re-authenticate through GitHub OAuth

### "I hit a rate limit (429 error)"

**Cause:** You've exceeded the rate limit (100 requests/minute, 1000/hour, 10000/day).

**Solution:**
- Wait a few minutes and try again
- Rate limits reset automatically
- If you consistently hit limits, review your usage patterns

### "Storage quota exceeded (507 error)"

**Cause:** You've reached the 10GB storage limit or 10,000 file limit.

**Solution:**
1. Review and archive old notes
2. Delete unnecessary files
3. Contact administrator about increasing quotas (if available)

### "I can't find a note I know I created"

**Try:**
1. Ask Claude to search: "Find notes about [topic]"
2. Browse directories: "What's in my projects folder?"
3. Check archives: "Search archives for [topic]"
4. Look at recent files: "What have I created this week?"

### "My notes aren't syncing across devices"

**Remember:**
- All notes are stored on the server, not locally
- Any Claude client connected to your server sees the same notes
- No sync needed - it's already centralized
- Check that both clients are connected to the same server URL

---

## Privacy & Security

### What's Stored?

- **Your notes** - All content you ask Claude to save
- **OAuth tokens** - Encrypted authentication tokens
- **Usage metrics** - Request counts, error rates (no personal data)

### Who Can Access?

- **Only you** - Single-user system with GitHub user ID allowlist
- **Not Anthropic** - Your notes are on your Cloudflare account
- **Not Cloudflare employees** - Server-side encryption protects data at rest

### Backups

- **Automatic daily backups** to your S3 bucket (if configured)
- **30-day retention** - You can restore from any backup within 30 days
- **Your control** - Backups are in your AWS account

### Data Deletion

To delete all data:
1. Delete the R2 bucket in Cloudflare dashboard
2. Delete the S3 backup bucket in AWS console
3. Revoke OAuth tokens in GitHub settings
4. Delete the Worker deployment

---

## Rate Limits & Quotas

### Rate Limits (per user)

- **100 requests per minute** - Normal usage won't hit this
- **1,000 requests per hour** - Covers heavy usage sessions
- **10,000 requests per day** - Allows constant usage all day

### Storage Quotas

- **10GB total storage** - ~10,000 text notes
- **10,000 files maximum** - Plenty for most users
- **10MB per file** - Large documents supported

### What Counts Against Limits?

- ✅ **Counts:** write, read, edit, glob, grep tool calls
- ❌ **Doesn't count:** OAuth, health checks, admin endpoints

---

## Getting Help

### Documentation

- **[README.md](README.md)** - Project overview
- **[specs/user-workflows.md](specs/user-workflows.md)** - Detailed usage examples
- **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Setup guide
- **[specs/](specs/)** - Complete technical documentation

### Common Questions

**Q: Can multiple people use the same server?**
A: Not in v1.0. Single-user only. Multi-user support is planned for Phase 2.

**Q: Can I import existing notes?**
A: Yes, use the write tool to create files. You can batch-create files by asking Claude to process a list.

**Q: Can I export my notes?**
A: Yes, download from R2 bucket directly, or ask Claude to read and format notes for export. Dedicated export tool coming in Phase 3.

**Q: What file formats are supported?**
A: Text files, especially Markdown (.md). Binary files (images, PDFs) not supported in v1.0.

**Q: Can I use this offline?**
A: No, requires internet connection. Claude needs to access the server to read/write notes.

**Q: How much does it cost?**
A: Depends on usage. Typical costs:
- Cloudflare Workers: ~$5-10/month
- R2 Storage: ~$1-2/month for 10GB
- AWS S3 Backup: ~$1/month
- Total: ~$7-13/month

---

## What's Next?

### Phase 2 (3-6 months)
- Multi-user support
- Backlink indexing (see connections between notes)
- Tag management
- Version history

### Phase 3 (6-12 months)
- AI-powered connections (semantic search)
- Template system
- Smart review scheduling
- Export functionality

See [Roadmap](specs/roadmap.md) for complete feature plan.

---

## Quick Reference Card

### Most Common Commands

```
# Capture
"Save this to my second brain: [content]"
"Quick capture: [idea]"

# Search
"Find notes about [topic]"
"What notes do I have on [subject]?"
"Search for [keyword]"

# Review
"What's in my projects folder?"
"Show me recent notes"
"Let's do my weekly review"

# Organize
"Move [file] to projects"
"Archive the [project name] project"
"Rename [old name] to [new name]"

# Read
"Show me my notes on [topic]"
"Read [filename]"
"What's in [folder]?"
```

---

## Support

For issues or questions:
1. Check this guide first
2. Review [User Workflows](specs/user-workflows.md)
3. Check [Deployment Guide](specs/deployment.md)
4. Check [Testing Guide](specs/testing.md)

---

**Ready to build your Second Brain?** Start by connecting Claude to your server and capturing your first note!
