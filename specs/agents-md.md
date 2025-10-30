# AGENTS.md Specification

This specification defines requirements for user-editable agent instructions following the AGENTS.md standard. The file provides methodology guidance, workflow preferences, and user-specific instructions that are injected directly into Claude's system prompt.

---

## Purpose and Scope

The MCP server requires a mechanism for users to customize Claude's behavior without modifying server code. The AGENTS.md file serves as a "README for AI agents" containing instructions that guide Claude's interaction with the second brain.

AGENTS.md follows the open standard defined at https://agents.md, an ecosystem-wide convention for providing instructions to AI coding agents. This standard enables consistent agent configuration across tools and projects.

**Primary use cases:**

Users MUST be able to customize methodology guidance (e.g., switch from BASB to Zettelkasten), define file naming preferences, and add personal workflow instructions. Changes to AGENTS.md MUST take effect without redeploying the MCP server, enabling rapid iteration on agent behavior.

**Distinction from system prompt:**

The hardcoded system prompt defines the server's core identity and security constraints that users cannot override. AGENTS.md contains methodology and workflow guidance that users can freely modify. The system prompt tells Claude what it IS; AGENTS.md tells Claude what the user WANTS.

---

## File Location and Format

The AGENTS.md file MUST be located at `/AGENTS.md` in the root of the user's second brain (R2 storage). The file uses standard Markdown format with no required structure—users organize content however they prefer.

The filename MUST be `AGENTS.md` (uppercase, singular) following the ecosystem standard. Alternative names like `.agents.md` or `agent-instructions.md` are not supported.

---

## Content Requirements

The bootstrap process MUST create a default AGENTS.md file providing comprehensive BASB methodology guidance. This default content serves as a starting point that users can modify or replace entirely.

### Default Content Structure

The default AGENTS.md MUST include sections explaining the Building a Second Brain (BASB) methodology and PARA organizational framework. It MUST define the four PARA categories (Projects, Areas, Resources, Archives) with clear criteria for each. It MUST explain the CODE workflow (Capture, Organize, Distill, Express) and how each step applies to knowledge management.

The file MUST provide explicit guidance for Claude's behavior. This includes file naming conventions (kebab-case format), PARA placement decision criteria, metadata addition practices, note connection strategies, progressive summarization techniques, archiving workflows, and review processes. Each guidance point SHOULD be specific and actionable rather than abstract principles.

The file MAY include a "User Preferences" section where users add personal customizations. Examples include preferred writing styles ("use bullet points over paragraphs"), topic-specific instructions ("always tag AI-related notes with #artificial-intelligence"), or workflow adaptations ("archive completed projects immediately rather than during weekly reviews").

### Content Flexibility

Users MUST be able to completely replace the default content with alternative methodologies. The system imposes no restrictions on AGENTS.md content—users could switch to Zettelkasten, Getting Things Done, or entirely custom approaches. Claude adapts its behavior based on whatever instructions the file contains.

The file MAY reference external resources or link to other files in the second brain. Claude SHOULD follow these references when relevant to the current task.

---

## System Prompt Injection

The MCP server MUST read AGENTS.md content and inject it directly into Claude's system prompt. This injection happens during MCP server initialization for each request, ensuring Claude always operates with current instructions.

### Injection Mechanism

The system prompt composition MUST follow this order: (1) hardcoded core prompt defining server identity and security constraints, (2) AGENTS.md content, (3) auto-generated repo map providing current file structure context. This ordering ensures AGENTS.md instructions can reference the repo map and override default methodology while core security constraints remain inviolable.

Claude MUST NOT be told about AGENTS.md existence or structure. From Claude's perspective, the methodology and guidance simply exist as part of its base instructions. Users editing AGENTS.md edit their personal agent's configuration, not a file that Claude reads.

### Missing File Handling

If AGENTS.md does not exist, the system MUST inject the default content as if the file existed. This ensures consistent behavior whether users keep the default file or delete it. The bootstrap process creates AGENTS.md on first use, so the missing file case primarily applies to users who explicitly deleted it.

If AGENTS.md exists but is empty, the system MUST inject an empty string, resulting in a prompt containing only core instructions and repo map. This allows users to completely disable methodology guidance if desired.

---

## Caching Strategy

The system SHOULD cache AGENTS.md content to avoid reading from R2 on every request. A cache duration of 60 seconds provides a reasonable balance between consistency and performance. Cache entries MUST be keyed by user ID to prevent cross-user contamination in multi-user deployments.

The cache MUST invalidate when users edit AGENTS.md through the MCP write or edit tools. This ensures changes take effect within seconds rather than requiring the cache timeout to expire. The write and edit tool implementations MUST clear the AGENTS.md cache entry after successfully updating the file.

Caching MAY be implemented in Durable Object instance memory (per-session cache) or in a shared cache like KV (cross-session cache). Durable Object caching provides simpler implementation and automatic cleanup, while KV caching reduces R2 reads across multiple sessions. [DEFERRED: The implementation chooses the appropriate caching mechanism based on performance measurements.]

---

## Bootstrap Requirements

The bootstrap process (see [Bootstrap](./bootstrap.md)) MUST create AGENTS.md if it does not exist. The bootstrap trigger remains "README.md does not exist" as specified in the bootstrap spec, but the bootstrap operation now creates AGENTS.md instead of the five PARA README files.

The default AGENTS.md content MUST be comprehensive enough to guide users unfamiliar with BASB methodology. It SHOULD include examples for common scenarios like deciding PARA placement for ambiguous content or determining when to archive completed projects.

The bootstrap MUST NOT prevent users from customizing AGENTS.md before the bootstrap completes. If a user manually creates AGENTS.md before bootstrap runs, the bootstrap MUST NOT overwrite it. The bootstrap only creates the file if it's missing.

---

## Editability and User Experience

Users MUST be able to edit AGENTS.md using the standard MCP write and edit tools. The file is a regular markdown file in their second brain—nothing in the system prevents or restricts editing.

When users ask Claude to modify their agent instructions, Claude SHOULD recognize this as a request to edit AGENTS.md and use the edit tool to make changes. For example, "I prefer shorter summaries" should result in Claude adding or updating a preference in the AGENTS.md file.

The system SHOULD provide clear feedback when AGENTS.md changes take effect. Since caching introduces up to 60 seconds of delay, Claude MAY inform users that instruction changes will apply to new conversations or after a brief delay. [NEEDS CLARIFICATION: Should we expose cache invalidation as an explicit user action, e.g., "reload agent instructions now"?]

---

## Security Considerations

The hardcoded system prompt MUST include security constraints that AGENTS.md cannot override. Specifically, instructions to protect user privacy and refuse malicious requests MUST appear in the core prompt before AGENTS.md injection.

The system MUST prevent AGENTS.md from containing prompt injection attacks that could compromise security. However, since users control AGENTS.md content and the file only affects their own experience, prompt injection is primarily a user-facing concern. If users inject confusing or contradictory instructions, they degrade their own experience but cannot affect other users or the system's security.

AGENTS.md content MUST NOT be exposed to other users in multi-user deployments. Each user's AGENTS.md applies only to their own sessions. The system MUST enforce user-id-based access control when reading AGENTS.md files.

---

## Migration from Bootstrap READMEs

The current implementation creates five README files (main README, projects/README.md, areas/README.md, resources/README.md, archives/README.md) during bootstrap. The AGENTS.md migration MUST replace this approach.

When migrating existing deployments, the system SHOULD handle users who already have the old README files. The migration strategy MAY include:

1. Create AGENTS.md with default content if it doesn't exist
2. Leave existing README files in place (users can delete manually)
3. Update bootstrap code to only create AGENTS.md going forward

The old README files become inert—they exist in storage but Claude never reads them. Users MAY delete them to reduce clutter. The system MUST NOT automatically delete user files, even obsolete ones.

[DEFERRED: An optional migration tool could offer to delete old README files and merge any user-added content into AGENTS.md, but this is not required for initial implementation.]

---

## Related Documentation

- [Bootstrap](./bootstrap.md) - Initial file creation and default content
- [Methodology](./methodology.md) - BASB principles referenced in default AGENTS.md
- [Repo Map](./repo-map.md) - Auto-generated context injected after AGENTS.md
- [Architecture](./architecture.md) - System prompt composition and MCP server initialization
