# Planning Guidelines

Guide for maintaining PLAN.md as a lean, forward-looking planning document.

## Purpose

PLAN.md is the **single source of truth** for upcoming work. It answers:
- What are we working on next?
- What's the current status?
- What decisions or blockers exist?

PLAN.md is **NOT**:
- A historical archive (use git history)
- A detailed implementation log (use commit messages and specs)
- A comprehensive project documentation (use specs/ directory)

## Core Principles

### 1. Stay Lean (~200 lines target)

**Target length:** ~200 lines, max ~300 lines

When PLAN.md exceeds 300 lines, it's time to archive completed work:
- Remove detailed completion notes for finished phases
- Keep only high-level status ("Phase X: Complete")
- Move implementation details to git history

### 2. Forward-Looking Focus

**Include:**
- ✅ Current phase status and immediate next steps
- ✅ Upcoming phase overview (high-level only)
- ✅ Relevant context for upcoming tasks
- ✅ Active blockers or decisions needed

**Exclude:**
- ❌ Detailed completion notes for finished phases
- ❌ Comprehensive historical logs
- ❌ Information better suited for specs/ directory
- ❌ Step-by-step implementation details from the past

### 3. Iterative Detail

Add detail **as work approaches**, not upfront:
- Next 1-2 phases: More detailed planning
- Future phases: High-level overview only
- Current phase: Task breakdown with blockers

### 4. Git History is the Archive

**Delete, don't archive:**
- Trust git to preserve history
- Use `git log` and `git show` to recover details
- Don't keep completed phase details "just in case"

## Document Structure

```markdown
# Implementation Plan

**Project:** [Project Name]
**Status:** [Current overall status]
**Last Updated:** [Date]

**Recent Changes:** (Last 1-2 significant updates)
- Brief bullet points of what changed recently
- Links to relevant issues/PRs

---

## Current Phase: [Phase Name]

**Goal:** [What we're trying to achieve]

**Status:** [In Progress / Blocked / Planned]

**Tasks:**
- [ ] Task 1
- [ ] Task 2
- [x] Completed task

**Blockers:** (if any)
- What's blocking progress
- Decisions needed

---

## Next Phase: [Phase Name]

**Goal:** [High-level objective]

**Overview:** [Brief description of approach]

**Prerequisites:** (if any)
- What must complete first

---

## Parking Lot

Items for future consideration:
- Feature ideas
- Known bugs (low priority)
- Tech debt items

---

## Key References

Links to relevant specs, critical files, git tags, etc.
```

## Update Frequency

**ALWAYS update BEFORE committing:**
- After completing a task: Check it off
- After completing a phase: Archive detail, add next phase
- When discovering new work: Add to upcoming tasks or parking lot
- When pivoting: Update current phase plan
- **Include PLAN.md in the same commit** with the code changes

## Example: Good vs Bad

### ❌ Bad (Too Much Historical Detail)

```markdown
## Phase 12: OAuth Implementation ✅ COMPLETE

**Status:** Complete (2025-10-15)

**Implemented:**
- Created OAuthProvider configuration in src/index.ts
  - Configured endpoints: /authorize, /token, /register
  - Added routing to /mcp endpoint
  - Integrated @cloudflare/workers-oauth-provider v0.0.11
- Created GitHub OAuth handler in src/oauth-ui-handler.ts
  - Implemented authorization flow with Arctic library
  - Added callback handler for code exchange
  - User allowlist check with GITHUB_ALLOWED_USER_ID
  - State management for MCP OAuth request encoding
- Updated mcp-api-handler.ts with OAuth token validation
  - Props extraction from OAuthProvider context
  - Rate limiting enforcement
  - Session management integration
- Added comprehensive test suite
  - 45 tests covering OAuth flows
  - Mock GitHub provider for testing
  - All edge cases covered
- Deployment successful
  - Deployed to development environment
  - Tested with Claude desktop
  - All tools working correctly

**Key Changes:**
- File 1: Lines 10-50 added OAuth configuration
- File 2: Lines 100-200 added callback handling
- File 3: Lines 30-80 refactored for token validation

**Challenges Overcome:**
- Initially tried approach X, but it didn't work
- Switched to approach Y after researching Z
- Had to debug issue with PKCE flow
```

**Problems:**
- Way too much detail (should be in git history)
- Implementation specifics (should be in commit messages)
- Challenges/decisions (interesting but historical)
- 40+ lines for a completed phase

### ✅ Good (Lean and Forward-Looking)

```markdown
## Current Status

**Production:** ✅ Working (v25.1.0)
**Recent:** Fixed deployment version calculation (Issue #24)

---

## Current Phase: Durable Object Alarm Cleanup

**Goal:** Stop zombie alarms from firing after session cleanup

**Status:** Planned

**Tasks:**
- [ ] Only schedule alarms when session is active
- [ ] Cancel alarms in `cleanup()` method
- [ ] Don't reschedule after session timeout

**Context:** Low priority - cosmetic log noise, no functional impact

**Reference:** src/mcp-session-do.ts lines 39-45, 62

---

## Parking Lot

**Future Enhancements:**
- OAuth test script timeout (low priority - E2E tests cover this)
- Additional monitoring (tool duration, error rates, usage patterns)

**Completed Phases:**
- Phases 16-19: All complete (see git history for details)
```

**Why it's better:**
- ~30 lines total (vs 40+ for one phase)
- Focuses on what's NEXT
- Completed work minimal (one line)
- Details archived in git history

## Maintenance Commands

```bash
# Review PLAN.md size
wc -l PLAN.md

# If over 300 lines, trim completed phases
# Keep only: status line, current phase, next 1-2 phases, parking lot

# Check recent activity to summarize
git log --oneline --since="2 weeks ago"

# Update PLAN.md
# Commit with code changes
git add PLAN.md src/some-file.ts
git commit -m "feat: implement feature X

Updates PLAN.md to reflect completion."
```

## Anti-Patterns to Avoid

### ❌ Detailed Completion Logs

```markdown
**Phase X Complete:**
- Created 5 files
- Updated 10 files
- Added 200 lines of code
- Fixed 3 bugs
- Refactored 2 modules
```

Use git history instead: `git log --stat`

### ❌ Implementation Documentation

```markdown
**How OAuth Works:**
The OAuth flow starts when the client makes a request to /authorize...
[10 paragraphs of explanation]
```

Put this in specs/security.md or code comments.

### ❌ Future Speculation

```markdown
## Phase 25: AI-Powered Summarization (Maybe?)
## Phase 26: Mobile App Integration (Someday?)
## Phase 27: Blockchain Integration (Could be cool?)
```

Put speculative ideas in a separate "Ideas" document or issues.

### ❌ Historical Context

```markdown
**Why We Chose Approach X:**
We originally tried Y but it failed because...
Then we considered Z but decided...
Finally we went with X because...
```

Put this in commit messages, ADRs, or spec rationale sections.

## When to Create New Phases

**Create a new phase when:**
- Scope is large enough (3+ substantial tasks)
- Work requires coordination across multiple areas
- There's a clear milestone or deliverable
- It's genuinely upcoming work (next 1-2 phases)

**Don't create phases for:**
- Single bug fixes (just fix it)
- Minor enhancements (add to parking lot)
- Distant future work (speculation)
- Things that might never happen

## Summary

**Remember:**
- PLAN.md is for **upcoming work**, not history
- Target **~200 lines**, max 300
- Git history is the archive
- Update **before every commit**
- Focus on **next 1-2 phases** in detail
- Keep **parking lot** for low-priority items

**When in doubt:** If it's completed and detailed, archive it. Git history preserves everything.
