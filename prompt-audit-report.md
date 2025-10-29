# MCP Prompts & Instructions Audit Report

**Date:** 2025-10-29
**Auditor:** Claude
**Scope:** All prompts, instructions, and user-facing text in the MCP server

---

## Executive Summary

This audit comprehensively reviews all prompts and instructions provided by the Second Brain MCP server. The server provides **5 types of instructional content** to guide Claude's interactions with users:

1. **Server Instructions** - System prompt defining BASB methodology and Claude's role
2. **Tool Descriptions** - User-facing descriptions for 5 MCP tools
3. **MCP Prompts** - 3 pre-defined workflow templates (capture-note, weekly-review, research-summary)
4. **Bootstrap READMEs** - 5 onboarding documents explaining PARA structure
5. **Resource Descriptions** - Metadata for file resources in the second brain

**Overall Assessment:** ✅ **FUNCTIONAL** - All components are implemented, tested, and working in production. However, there are opportunities for improvement in clarity, consistency, and user-friendliness.

---

## 1. Current State Inventory

### 1.1 Server Instructions

**Location:** `src/mcp-transport.ts:50-70`

**Purpose:** Primary system prompt visible to Claude explaining BASB methodology and organizational guidance.

**Current Content:**
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
```

**Analysis:**
- ✅ Concise and well-structured
- ✅ Covers essential BASB concepts
- ⚠️ **Missing:** Explicit guidance for Claude's behavior (see specs/bootstrap.md:48-58)
- ⚠️ **Missing:** Instructions for progressive summarization, filename conventions, connection building

### 1.2 Tool Descriptions

**Location:** `src/mcp-transport.ts:75-198`

**Purpose:** Describe the 5 MCP tools available to Claude and define their parameters.

| Tool | Description | Assessment |
|------|-------------|------------|
| **read** | "Read file contents with optional range selection" | ✅ Clear and accurate |
| **write** | "Create new file or overwrite existing file" | ✅ Clear and accurate |
| **edit** | "Edit existing file using string replacement, with optional move/rename/delete" | ✅ Clear, covers multiple operations |
| **glob** | "Find files matching a pattern" | ✅ Clear and accurate |
| **grep** | "Search file contents using regex" | ✅ Clear and accurate |

**Parameter Descriptions:**

All 5 tools have detailed parameter descriptions that are clear and helpful:
- ✅ `read` path: "Path to file (e.g., "projects/app/notes.md")" - includes example
- ✅ `glob` pattern: "Glob pattern (e.g., "projects/**/*.md", "*.md")" - includes examples
- ✅ Tool descriptions use proper grammar and punctuation

**Overall Quality:** ✅ **EXCELLENT** - Tool descriptions are clear, concise, and include helpful examples.

### 1.3 MCP Prompts

**Location:** `src/mcp-transport.ts:268-405`

**Specification:** `specs/prompts.md`

**Purpose:** Pre-defined workflow templates that users explicitly invoke through Claude's MCP prompt interface.

#### Prompt 1: capture-note

**Description:** "Quick capture workflow for capturing notes"

**Arguments:**
- `content` (required) - "The note content to capture"
- `context` (optional) - "Where this came from (conversation, article URL, etc.)"
- `tags` (optional) - "Comma-separated tags"

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

**Analysis:**
- ✅ Clear and actionable instructions
- ✅ Follows BASB "Capture" step
- ✅ Arguments are well-documented
- ⚠️ **Clarity Issue:** "capturing notes" is redundant in description
- 💡 **Enhancement Opportunity:** Could specify what metadata format to use

#### Prompt 2: weekly-review

**Description:** "Guided weekly review of the second brain"

**Arguments:**
- `focus_areas` (optional) - "Specific projects or areas to review"

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

**Analysis:**
- ✅ Comprehensive review workflow
- ✅ Follows BASB "Organize" and "Distill" steps
- ✅ Clear numbered steps
- ✅ Aligns perfectly with spec (specs/prompts.md:88-100)

#### Prompt 3: research-summary

**Description:** "Process and summarize research on a topic"

**Arguments:**
- `topic` (required) - "The research topic"
- `output_location` (optional) - "Where to save summary"

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

**Analysis:**
- ✅ Clear research synthesis workflow
- ✅ Follows BASB "Distill" and "Express" steps
- ✅ Mentions progressive summarization technique
- ⚠️ **Clarity Issue:** Template text "{output_location or suggest appropriate location}" is awkward
- 💡 **Enhancement Opportunity:** Could be more explicit about how to format the summary

**Overall Prompt Quality:** ✅ **GOOD** - All prompts are functional and well-aligned with BASB methodology. Minor clarity issues and enhancement opportunities exist.

### 1.4 Bootstrap READMEs

**Location:** `src/bootstrap.ts:60-146`

**Specification:** `specs/bootstrap.md`

**Purpose:** Initial onboarding documents explaining BASB methodology and PARA structure.

#### Main README (`README.md`)

**Content Summary:**
- Introduces BASB methodology
- Explains PARA structure
- Provides "Getting Started" examples
- Includes tips for using the system

**Analysis:**
- ✅ Concise and user-friendly
- ✅ Encourages users to "Ask Claude" for common tasks
- ✅ Mentions all 4 PARA categories
- ⚠️ **Missing:** CODE workflow explanation (only PARA is explained)
- ⚠️ **Inconsistency:** Spec (bootstrap.md:48-58) requires extended "GUIDANCE FOR CLAUDE" section that is NOT present in server instructions

#### PARA Category READMEs

| File | Quality | Issues |
|------|---------|--------|
| `projects/README.md` | ✅ Clear criteria and examples | None |
| `areas/README.md` | ✅ Clear criteria and examples | None |
| `resources/README.md` | ✅ Clear criteria and examples | None |
| `archives/README.md` | ✅ Clear purpose explanation | None |

**Overall Bootstrap Quality:** ✅ **GOOD** - READMEs are clear and helpful. Missing CODE workflow explanation in main README.

### 1.5 Resource Descriptions

**Location:** `src/mcp-transport.ts:414-426, 486-500`

**Purpose:** Expose all second brain documents as MCP resources with metadata.

**Current Implementation:**

1. **Individual Resource Description:**
   ```
   description: `Document in ${obj.key.split('/').slice(0, -1).join('/')}`
   ```
   Example: `"Document in projects/launch-app"`

2. **Resource Template Description:**
   ```
   description: 'Access any document in your second brain by path (e.g., projects/app/notes.md)'
   ```

**Analysis:**
- ✅ Resources are exposed and functional (Phase 19.1 complete)
- ⚠️ **Clarity Issue:** Individual resource descriptions are not very informative
- ⚠️ **Missed Opportunity:** Could include file size, last modified date in human-readable format
- 💡 **Enhancement:** Could use title/name differently (currently both are full path)

---

## 2. Detailed Analysis

### 2.1 Consistency Check

**Between Implementation and Specs:**

| Component | Spec Location | Implementation Status | Consistency |
|-----------|---------------|----------------------|-------------|
| Server Instructions | `specs/bootstrap.md:25-58` | `src/mcp-transport.ts:50-70` | ⚠️ **PARTIAL** - Missing "GUIDANCE FOR CLAUDE" section |
| Tool Descriptions | `specs/tools.md` | `src/mcp-transport.ts:75-198` | ✅ **MATCH** |
| Prompt Templates | `specs/prompts.md` | `src/mcp-transport.ts:328-374` | ✅ **MATCH** |
| Bootstrap READMEs | `specs/bootstrap.md:25-58` | `src/bootstrap.ts:60-146` | ⚠️ **PARTIAL** - Main README missing CODE workflow |
| Resource Descriptions | N/A (implementation-defined) | `src/mcp-transport.ts:414-426` | N/A |

**Key Inconsistency Found:**

The specs/bootstrap.md (lines 48-58) specify that server instructions MUST include explicit guidance for Claude:

```
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

**This guidance is MISSING from the actual server instructions** (`src/mcp-transport.ts:50-70`).

### 2.2 Quality Assessment

**Strengths:**
1. ✅ All prompts are clear and actionable
2. ✅ Tool descriptions include helpful examples
3. ✅ Bootstrap READMEs are concise and user-friendly
4. ✅ Prompts align well with BASB methodology
5. ✅ No grammatical errors or typos found
6. ✅ Consistent tone throughout (professional, helpful, encouraging)

**Weaknesses:**
1. ⚠️ Server instructions missing explicit Claude behavior guidance (spec discrepancy)
2. ⚠️ Some minor wording issues ("capturing notes" redundancy, awkward template text)
3. ⚠️ Resource descriptions are minimal and not very informative
4. ⚠️ Main README missing CODE workflow explanation
5. ⚠️ Prompts don't specify metadata formats or summary structures

### 2.3 User-Friendliness

**For End Users:**
- ✅ Bootstrap READMEs provide clear onboarding
- ✅ Prompt descriptions are understandable to non-technical users
- ✅ Examples in tool descriptions help users understand usage
- ⚠️ Users must discover prompts through Claude's MCP interface (no direct discovery mechanism in READMEs)

**For Claude (AI Assistant):**
- ✅ Server instructions provide clear methodology overview
- ✅ Prompts provide step-by-step instructions
- ⚠️ Missing explicit behavioral guidance for filename conventions, metadata formats, connection building
- ⚠️ Progressive summarization is mentioned but not explained

### 2.4 Completeness

**What's Implemented:**
- ✅ All 5 tools with descriptions
- ✅ All 3 prompts with templates
- ✅ All 5 bootstrap README files
- ✅ Server instructions with BASB overview
- ✅ Resource descriptions

**What's Missing (per specs):**
- ⚠️ Extended "GUIDANCE FOR CLAUDE" section in server instructions (specs/bootstrap.md:48-58)
- ⚠️ CODE workflow explanation in main README
- ⚠️ Explicit metadata format guidance
- ⚠️ Explicit progressive summarization technique explanation

---

## 3. Outstanding Work

### 3.1 From PLAN.md

**Status:** No outstanding prompt-related work items in PLAN.md

- ✅ Phase 19.1 (MCP Resources) - Complete
- ✅ All 3 prompts verified working in Claude (PLAN.md:59)

### 3.2 From TODOs/FIXMEs

**Search Result:** No TODOs or FIXMEs found in source code related to prompts.

### 3.3 From Specs

**Identified Gaps:**

1. **specs/bootstrap.md:48-58** - Server instructions should include 8-point "GUIDANCE FOR CLAUDE" section
   - **Status:** NOT IMPLEMENTED
   - **Impact:** Medium - Claude may not follow all BASB best practices consistently
   - **Location:** Should be added to `src/mcp-transport.ts:50-70`

2. **specs/bootstrap.md:28** - Main README should mention CODE workflow
   - **Status:** NOT IMPLEMENTED
   - **Impact:** Low - Users won't see CODE workflow in onboarding
   - **Location:** Should be added to `src/bootstrap.ts:60-87`

3. **specs/methodology.md:44-50** - Progressive summarization guidance
   - **Status:** Mentioned in prompt but not explained
   - **Impact:** Low - Claude understands the concept from general knowledge
   - **Location:** Could be added to server instructions or prompt templates

---

## 4. Findings Summary

### Critical Issues
None identified. All prompts are functional and working in production.

### High Priority Improvements

1. **Add "GUIDANCE FOR CLAUDE" Section to Server Instructions**
   - **File:** `src/mcp-transport.ts:50-70`
   - **Reason:** Spec compliance (specs/bootstrap.md:48-58)
   - **Impact:** Ensures Claude consistently follows BASB best practices
   - **Effort:** Low (add 8 lines of text)

2. **Fix Clarity Issues in Prompt Templates**
   - **File:** `src/mcp-transport.ts:362-374` (research-summary)
   - **Issue:** "{output_location or suggest appropriate location}" is awkward
   - **Fix:** Use conditional logic in template generation
   - **Effort:** Low

### Medium Priority Improvements

3. **Improve Resource Descriptions**
   - **File:** `src/mcp-transport.ts:414-426`
   - **Current:** "Document in projects/launch-app"
   - **Suggested:** "Project note: launch-app (modified 2 days ago, 4.2 KB)"
   - **Impact:** Better user experience when browsing resources
   - **Effort:** Medium

4. **Add CODE Workflow to Main README**
   - **File:** `src/bootstrap.ts:60-87`
   - **Reason:** Spec compliance (specs/bootstrap.md:28)
   - **Impact:** Better onboarding for new users
   - **Effort:** Low (add 4-5 lines)

### Low Priority Enhancements

5. **Specify Metadata Format in capture-note Prompt**
   - **File:** `src/mcp-transport.ts:334-345`
   - **Enhancement:** Provide example metadata format
   - **Impact:** More consistent note formatting
   - **Effort:** Low

6. **Fix Minor Wording Issues**
   - **capture-note description:** "Quick capture workflow for capturing notes" → "Quick capture workflow for new notes"
   - **Effort:** Trivial

---

## 5. Recommendations

### Immediate Actions (Before Next Deployment)

1. **Add Missing "GUIDANCE FOR CLAUDE" Section**
   - Ensures spec compliance
   - Improves Claude's consistency in following BASB practices
   - Low effort, high value

2. **Fix Prompt Template Clarity Issues**
   - Small wording improvements for better user experience
   - Low effort

### Short-Term Actions (Next Sprint)

3. **Enhance Resource Descriptions**
   - Add file size, human-readable timestamps
   - Use title/name fields more effectively
   - Improves resource browsing experience

4. **Add CODE Workflow to Main README**
   - Spec compliance
   - Better onboarding

### Long-Term Enhancements (Nice to Have)

5. **Create Prompt Discovery Mechanism**
   - Add section in main README explaining available prompts
   - Help users discover the 3 pre-defined workflows

6. **Add Progressive Summarization Guide**
   - Create a resources/README.md section explaining progressive summarization
   - Link from prompt templates

7. **Standardize Metadata Formats**
   - Define YAML frontmatter format for notes
   - Document in server instructions
   - Ensure capture-note prompt uses consistent format

---

## 6. Conclusion

**Overall Assessment:** The MCP server's prompts and instructions are **functional, well-implemented, and production-ready**. All components have been tested and verified working in Claude desktop/web.

**Key Strengths:**
- Clear, actionable prompt templates
- Excellent tool descriptions with examples
- User-friendly bootstrap READMEs
- Good alignment with BASB methodology

**Key Opportunities:**
- Add missing "GUIDANCE FOR CLAUDE" section (spec compliance)
- Enhance resource descriptions for better UX
- Fix minor clarity issues in templates
- Improve onboarding with CODE workflow explanation

**Recommended Priority:**
1. High: Add GUIDANCE FOR CLAUDE section (spec compliance)
2. High: Fix template clarity issues
3. Medium: Enhance resource descriptions
4. Medium: Add CODE workflow to main README
5. Low: Metadata format standardization
6. Low: Progressive summarization guide

All recommendations are enhancements to an already working system. No critical issues found.
