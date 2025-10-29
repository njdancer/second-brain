# MCP Prompt Specifications

This specification defines the three MCP prompts that guide users through Building a Second Brain workflows. Prompts are pre-defined workflow templates that users can explicitly invoke through Claude's MCP prompt interface.

---

## Prompt Design Principles

MCP prompts MUST follow these principles:

**Explicit Invocation** - Prompts are user-initiated workflows, not automatic behaviors. Users must explicitly select and invoke a prompt.

**Guidance, Not Automation** - Prompts guide Claude's interaction with the user but do not execute automatically. Claude should follow the prompt template while adapting to user responses.

**Parameterized Flexibility** - Prompts accept optional arguments to customize the workflow, but should function reasonably with minimal or no parameters.

**BASB Alignment** - All prompts support one or more steps of the CODE workflow (Capture, Organize, Distill, Express).

---

## Prompt 1: capture-note

Quick capture workflow optimized for mobile use, supporting the BASB "Capture" step.

### Purpose

Enable frictionless note capture with minimal organization decisions required. The prompt guides Claude to determine appropriate PARA placement and add helpful metadata without requiring the user to make detailed organizational choices during capture.

### Arguments

**content** (required) - The note content to capture. May be a single sentence, paragraph, or longer text.

**context** (optional) - Where the content came from. Examples: conversation transcript, article URL, book title, meeting name. Helps Claude suggest categorization and add appropriate metadata.

**tags** (optional) - Comma-separated tags or keywords. Claude may use these to inform PARA placement and to add to note metadata.

### Template

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

### Expected Behavior

Claude SHOULD:
- Analyze content to infer actionability and suggest Projects, Areas, Resources, or Archives
- Ask clarifying questions if PARA placement is unclear
- Propose a descriptive kebab-case filename based on content
- Add frontmatter or metadata section with date, source (from context), and tags
- Create the file using the `write` tool
- Confirm the save location and filename to the user

Claude MAY:
- Suggest connecting the new note to existing related notes
- Recommend following up on captured ideas during next review

Claude MUST NOT:
- Enforce a specific metadata format (flexibility for user preference)
- Require extensive user input beyond the provided parameters

---

## Prompt 2: weekly-review

Guided weekly review workflow supporting the BASB "Organize" and "Distill" steps.

### Purpose

Help users review their second brain systematically to maintain organization, identify completed work, and plan upcoming focus. The prompt guides Claude through examining active projects, finding orphaned content, and surfacing insights.

### Arguments

**focus_areas** (optional) - Specific projects or areas to review in detail. If omitted, Claude should provide a comprehensive overview of the entire second brain.

### Template

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

### Expected Behavior

Claude SHOULD:
- Use `glob` to list all files in `projects/` and `areas/` directories
- Use `read` to review recent activity in focus areas or sample active projects
- Identify project folders with completion indicators (e.g., notes mentioning "complete", "launched", "done")
- Use `grep` to find notes at the root level or in unclear locations that should be categorized
- Surface notes that reference each other or share topics, suggesting markdown links
- Identify areas with sparse content or no recent updates
- Propose 2-3 specific, actionable tasks for the coming week based on the review

Claude MAY:
- Ask the user for status updates on projects with unclear completion state
- Suggest progressive summarization for notes with substantial content
- Recommend creating a project for recurring area tasks with deadlines

Claude MUST NOT:
- Make destructive changes (moves, deletions) without user confirmation
- Auto-archive projects without user verification

---

## Prompt 3: research-summary

Process and summarize research on a topic, supporting the BASB "Distill" and "Express" steps.

### Purpose

Help users synthesize research from multiple notes into a coherent summary with progressive summarization and key insights highlighted. This prompt guides Claude in finding related content, identifying themes, and creating an organized summary document.

### Arguments

**topic** (required) - The research topic to summarize. Claude will search for notes related to this topic.

**output_location** (optional) - Path where the summary should be saved. If omitted, Claude should suggest an appropriate location based on the topic's actionability (Projects for active work, Resources for reference material).

### Template

```
I've been researching {topic}. Let's process this into my second brain.

Please:
1. Search existing notes about {topic}
2. Identify key themes and insights
3. Create a progressive summary (bold key points)
4. Suggest related resources to explore
5. Save summary to {output_location or suggest appropriate location}
```

### Expected Behavior

Claude SHOULD:
- Use `grep` to search for notes mentioning the topic or related terms
- Use `read` to review matching notes and extract key information
- Organize findings into themes or categories
- Create a summary document with:
  - Overview section
  - Key insights with **bold highlighting** for most important points
  - Organized sections by theme
  - Links to source notes using markdown references
  - "Further Research" section with gaps or questions
- Suggest appropriate PARA placement (Projects if part of active work, Resources otherwise)
- Create the summary using the `write` tool

Claude MAY:
- Ask clarifying questions about summary focus or depth
- Suggest archiving individual research notes if they're now consolidated
- Propose follow-up actions based on research findings

Claude MUST NOT:
- Delete or modify source notes without explicit permission
- Create summaries without citing source notes

---

## Server Metadata

The MCP server MUST expose these prompts through the standard MCP prompt listing endpoint. The server metadata includes:

**Server Name:** `second-brain`

**Server Version:** The server MUST provide runtime version information derived from git tags and commit history. Version information is accessed differently in development (queried from local git repository) and production (embedded as static values during build). The version string SHOULD combine git tag and commit hash (e.g., `25.0.0 (abc123d)` for production, `25.0.0-dev (abc123d-dirty)` for development). See [Deployment](./deployment.md) for runtime version access requirements.

**Server Description:** Multi-paragraph description visible to Claude explaining BASB methodology, PARA structure, and guidance for file organization (see bootstrap.md for full text).

---

## Implementation Notes

Prompts are declarative templates registered with the MCP SDK. The server registers all three prompts during initialization and makes them available to Claude through the MCP protocol's `prompts/list` and `prompts/get` methods.

The prompt templates use placeholder syntax `{parameter_name}` that the MCP client (Claude) fills with user-provided argument values before presenting the expanded prompt to the language model.

---

## Related Documentation

- [Methodology](./methodology.md) - BASB principles these prompts support
- [Bootstrap](./bootstrap.md) - Server description text visible to Claude
- [Tools](./tools.md) - MCP tools used within prompt workflows
- [Architecture](./architecture.md) - MCP protocol implementation details
