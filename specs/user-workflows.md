# User Workflows

Common usage patterns and example interactions with the Second Brain MCP server.

---

## Connection Flow

### Initial Setup

1. User opens Claude (web, desktop, or mobile)
2. User navigates to Settings → Integrations → MCP Servers
3. User clicks "Add MCP Server"
4. User configures:
   - **Name:** Second Brain
   - **URL:** `https://second-brain.your-domain.workers.dev/sse`
   - **OAuth Client ID:** (from GitHub OAuth App)
   - **OAuth Client Secret:** (from GitHub OAuth App)
5. User clicks "Connect"
6. Browser opens to GitHub OAuth consent page
7. User signs in with GitHub (if not already)
8. Worker validates user against allowed list (`GITHUB_ALLOWED_USER_ID`)
9. User approves MCP access (scopes: `read:user`)
10. Browser redirects back to Claude with authorization
11. Worker issues tokens to Claude and stores in `OAUTH_KV`
12. MCP server becomes available in Claude's tools
13. On first tool use, bootstrap files are created if `/README.md` doesn't exist

### Reconnection

If token expires or user reconnects:
1. Claude attempts to refresh token automatically
2. If refresh fails, user must re-authenticate (steps 6-11 above)
3. Existing data persists (no data loss)

---

## Capture Workflow (Mobile)

### Quick Capture During Conversation

**User:** "I just had an idea for improving our onboarding flow. Can you save this to my second brain? The idea is to add a progress indicator showing users how far they are through setup."

**Claude:**
1. Recognizes capture intent
2. Analyzes content to determine PARA category (likely Projects or Areas)
3. Suggests filename: `onboarding-progress-indicator.md`
4. Calls `write` tool with formatted content:

```markdown
# Onboarding Progress Indicator

**Date:** 2025-10-07
**Context:** Conversation about UX improvements
**Tags:** #onboarding #ux #product

## Idea

Add a progress indicator showing users how far they are through setup.

## Benefits

- Reduces user uncertainty
- Improves completion rate
- Sets clear expectations

## Next Steps

- [ ] Design mockup
- [ ] User research validation
- [ ] Implementation planning
```

5. Confirms: "I've saved your onboarding improvement idea to `projects/product-improvements/onboarding-progress-indicator.md`. Would you like me to add any additional context or link it to related notes?"

### Using Capture Prompt

**User:** Invokes MCP prompt: `capture-note`

**Prompt Arguments:**
- `content`: "Meeting with Sarah - discussed Q4 roadmap priorities"
- `context`: "Weekly 1:1 meeting"
- `tags`: "meetings, roadmap, q4"

**Claude:**
1. Determines category: Areas (ongoing responsibility: team management)
2. Suggests filename: `sarah-1on1-2025-10-07.md`
3. Creates formatted note with metadata
4. Saves to: `areas/team-management/sarah-1on1-2025-10-07.md`
5. Confirms location and asks if user wants to add action items

---

## Search Workflow (Desktop)

### Finding Notes by Topic

**User:** "What notes do I have about user research?"

**Claude:**
1. Calls `grep` tool with pattern: "user research"
2. Analyzes results across PARA categories
3. Presents organized summary:

```
I found 8 notes mentioning user research:

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
- archives/2024/website-redesign/user-feedback.md
- archives/2023/mobile-app/research-summary.md

Would you like me to summarize the key insights from any of these?
```

**User:** "Show me the recent ones from active projects"

**Claude:**
1. Calls `read` on the two active project files
2. Summarizes key findings
3. Identifies common themes
4. Suggests connections between the notes

### Finding Notes by Name Pattern

**User:** "Show me all my meeting notes"

**Claude:**
1. Calls `glob` with pattern: `**/*meeting*.md`
2. Groups results by directory
3. Shows recent meetings first
4. Offers to create a summary

---

## Organization Workflow

### Moving Completed Project to Archives

**User:** "The marketing campaign project is complete. Can you archive it?"

**Claude:**
1. Calls `glob` to find all files in `projects/marketing-campaign/`
2. Lists files found:
   - `projects/marketing-campaign/plan.md`
   - `projects/marketing-campaign/creative-brief.md`
   - `projects/marketing-campaign/results.md`
3. Asks: "I found 3 files. Should I move all of them to `archives/2025/marketing-campaign/`?"
4. User confirms
5. Calls `edit` tool with `new_path` for each file:
   - `projects/marketing-campaign/plan.md` → `archives/2025/marketing-campaign/plan.md`
   - `projects/marketing-campaign/creative-brief.md` → `archives/2025/marketing-campaign/creative-brief.md`
   - `projects/marketing-campaign/results.md` → `archives/2025/marketing-campaign/results.md`
6. Confirms: "Moved 3 files to archives/2025/marketing-campaign/. The project is now archived!"

### Reorganizing Misplaced Notes

**User:** "This TypeScript learning note should be in resources, not projects"

**Claude:**
1. Calls `glob` to find TypeScript notes in projects
2. Finds: `projects/learn-typescript/notes.md`
3. Suggests: "Should I move this to `resources/programming/typescript-notes.md`?"
4. User confirms
5. Calls `edit` with `new_path`
6. Updates any internal links if needed
7. Confirms move

---

## Review Workflow

### Weekly Review

**User:** Uses prompt: `weekly-review`

**Claude:**
1. Calls `glob` to list all files in `projects/**`
2. Identifies projects:
   - marketing-campaign
   - website-redesign
   - q4-planning
   - learn-typescript
   - home-office-setup
3. Calls `read` on key project files to assess status
4. Analyzes last modified dates to identify stalled projects
5. Provides structured review:

```
**Weekly Review - October 7, 2025**

**Active Projects (5):**

1. ✅ **marketing-campaign**
   - Status: Complete (last update: Oct 5)
   - Recommendation: Move to archives

2. 🟡 **website-redesign**
   - Status: In progress (last update: Oct 6)
   - Deadline: Next week
   - Recommendation: Focus here, deadline approaching

3. 🔴 **q4-planning**
   - Status: Needs attention (last update: Sep 28)
   - Deadline: Oct 15
   - Recommendation: Urgent - deadline in 8 days

4. 🟢 **learn-typescript**
   - Status: On track (last update: Oct 5)
   - Recommendation: Continue current pace

5. 🟡 **home-office-setup**
   - Status: Stalled (last update: Sep 15)
   - Recommendation: Decide if still a priority

**Areas (3 active):**
- product-management (active)
- team-management (active)
- health (needs attention - no updates in 2 weeks)

**Orphaned Notes (2):**
- root/random-idea.md (created Oct 3, not categorized)
- projects/temp-notes.md (no clear project)

**Recommendations:**
1. Archive marketing-campaign project
2. Focus on q4-planning this week (deadline approaching)
3. Update website-redesign status
4. Decide on home-office-setup priority
5. Categorize orphaned notes

**Quick Wins:**
- Add next actions to q4-planning
- Create checklist for website-redesign
- Move or delete orphaned notes
- Update health area (log this week's activities)

Would you like me to help with any of these?
```

**User:** "Yes, let's archive the marketing campaign and add next actions to q4-planning"

**Claude:** [Proceeds with actions]

### Monthly Review

**User:** "Let's do a deeper review of my second brain"

**Claude:**
1. Runs comprehensive analysis:
   - Total notes created this month
   - Most active PARA categories
   - Completed projects
   - Areas needing attention
   - Unused resources
   - Growth trends
2. Identifies patterns:
   - Capture frequency
   - Follow-through rate
   - Knowledge retrieval patterns
3. Provides insights and recommendations

---

## Research Workflow

### Processing Research Notes

**User:** Uses prompt: `research-summary` with topic: "progressive web apps"

**Claude:**
1. Calls `grep` with pattern: "progressive web app|PWA"
2. Finds notes across:
   - `resources/web-development/pwa-basics.md`
   - `projects/mobile-site/pwa-investigation.md`
   - `resources/articles/pwa-best-practices.md`
3. Calls `read` on each file
4. Analyzes content for themes
5. Creates comprehensive summary:

```markdown
# Progressive Web Apps - Research Summary

**Date:** 2025-10-07
**Sources:** 3 notes reviewed
**Tags:** #pwa #web-development #mobile

## Key Themes

### Benefits
- **Offline functionality** - Service workers enable offline access
- **App-like experience** - Add to home screen, full-screen mode
- **Performance** - Faster load times with caching

### Implementation Requirements
- HTTPS required
- Manifest file
- Service worker registration
- Cache strategy

### Best Practices
- Progressive enhancement approach
- Cache-first for assets, network-first for data
- Background sync for offline actions

## Resources to Explore
- [ ] Service Worker cookbook (mentioned in pwa-basics.md)
- [ ] Lighthouse PWA audit tool
- [ ] Workbox library for easier implementation

## Related Notes
- [PWA Basics](../resources/web-development/pwa-basics.md)
- [Mobile Site Investigation](../projects/mobile-site/pwa-investigation.md)
- [Best Practices](../resources/articles/pwa-best-practices.md)

## Next Steps
- Build proof-of-concept PWA
- Test offline scenarios
- Evaluate Workbox vs. manual service worker
```

6. Suggests saving to: `resources/web-development/pwa-research-summary.md`
7. User confirms, summary saved

### Connecting Related Notes

**User:** "Link these PWA notes together"

**Claude:**
1. Reads each file
2. Adds "Related Notes" section to each with markdown links
3. Updates files using `edit` tool
4. Confirms connections made

---

## Distillation Workflow

### Progressive Summarization

**User:** "Help me distill this long article I saved"

**Claude:**
1. Reads note: `resources/articles/knowledge-management-trends.md`
2. Identifies key points (looks for headers, lists, important concepts)
3. Suggests highlighting important parts in bold
4. Creates progressively summarized version:

```markdown
# Knowledge Management Trends 2025

**Source:** TechCrunch article
**Date Saved:** 2025-10-07
**Tags:** #knowledge-management #trends #pkm

## Key Trends

### 1. AI-Powered Knowledge Assistants
**Personal AI assistants** are transforming how we capture and retrieve information.
They can **automatically categorize, summarize, and surface relevant content** based
on context and user behavior.

### 2. Networked Thinking
**Bidirectional linking** and **graph views** help users see **connections between ideas**.
Tools are moving beyond hierarchical folders to **network-based organization**.

### 3. Action-Oriented Organization
**Organizing by actionability** (like PARA) is gaining popularity over topic-based filing.
**Users want to find what they need for current projects**, not maintain perfect taxonomies.

## Summary

Knowledge management is shifting toward **AI assistance**, **networked thinking**, and
**action-oriented organization**. The future is about **tools that help you work**, not
just store information.

## Personal Insights

- This aligns with my BASB approach ✓
- Should explore AI features for my second brain
- Graph view would be valuable for Phase 2
```

4. Updates note with highlighted version
5. Offers to create a short summary note if needed

---

## Collaboration Workflow (Future)

### Sharing a Note

**User:** "Share my PWA research summary with the team"

**Claude:** (Phase 4 feature)
1. Generates public link
2. Creates shareable version (sanitizes private info)
3. Returns link with expiration date
4. Logs share event

### Collaborative Second Brain

**User:** "Create a shared space for our team's design resources"

**Claude:** (Phase 4 feature)
1. Creates shared folder: `shared/design-resources/`
2. Sets permissions (read/write for team)
3. Invites team members
4. Syncs changes bi-directionally

---

## Error Recovery Workflow

### File Not Found

**User:** "Read my meeting notes from yesterday"

**Claude:**
1. Calls `glob` with pattern: `**/*meeting*2025-10-06*.md`
2. No results found
3. Responds: "I couldn't find any meeting notes from October 6. Would you like me to:
   - Search for meeting notes from this week?
   - Check if it might be named differently?
   - Create a new note for yesterday's meeting?"

### Rate Limit Hit

**User:** [Makes many rapid requests]

**Claude:**
1. Receives 429 error from MCP
2. Reads `Retry-After` header: 45 seconds
3. Responds: "I've hit the rate limit (100 requests per minute). I'll wait 45 seconds and try again. In the meantime, would you like to batch your requests or focus on specific notes?"

### Storage Quota Approaching

**User:** [Tries to create large file]

**Claude:**
1. Server checks storage quota
2. Sees 8.5GB used (85% of 10GB limit)
3. Returns warning
4. Claude responds: "Your storage is at 85% capacity (8.5GB of 10GB). This file was saved, but you're approaching the limit. Would you like me to:
   - Find large files to archive or delete?
   - Identify old notes that could be removed?
   - Show your storage breakdown by category?"

---

## Related Documentation

- [Overview](./overview.md) - BASB methodology behind workflows
- [API Reference](./api-reference.md) - Tools used in workflows
- [MCP Configuration](./mcp-configuration.md) - Prompts and guidance
- [Roadmap](./roadmap.md) - Future workflow enhancements
