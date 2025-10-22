# Bootstrap Requirements

This specification defines the initial file structure and content created when a user first connects to the MCP server. Bootstrap ensures users understand the BASB methodology and have a foundation to start building their second brain.

---

## Bootstrap Trigger

Bootstrap MUST be triggered when `/README.md` does not exist in the user's R2 bucket. The server checks for this file on first successful OAuth connection and creates the bootstrap structure if the file is missing.

**Trigger Condition:** File `/README.md` does not exist in R2 storage

**Bootstrap Execution:** On first MCP initialize request after successful OAuth authentication

**Idempotency:** Bootstrap runs at most once per user. If `/README.md` exists, bootstrap is skipped entirely.

---

## Server Description

The MCP server MUST expose a multi-paragraph description visible to Claude that explains the BASB methodology and provides organizational guidance. This description appears in Claude's MCP server information and informs how Claude interacts with the second brain.

### Required Description Content

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

This description MUST be provided through the MCP server's metadata endpoint and MUST remain consistent with the content presented to Claude across all MCP protocol interactions.

---

## Bootstrap Files

When bootstrap is triggered, the system MUST create five README files in the user's R2 bucket. Files are created using the standard `write` tool implementation.

The exact content for each file MUST be read from the bootstrap templates directory during implementation. Template files define the structure and explanatory content for each PARA category.

**Required files:**

| Path | Purpose | Content Source |
|------|---------|----------------|
| `/README.md` | Root introduction to second brain concept and quick-start guidance | `templates/bootstrap/README.md` |
| `/projects/README.md` | Explains Projects category with criteria and examples | `templates/bootstrap/projects/README.md` |
| `/areas/README.md` | Explains Areas category with criteria and examples | `templates/bootstrap/areas/README.md` |
| `/resources/README.md` | Explains Resources category with criteria and examples | `templates/bootstrap/resources/README.md` |
| `/archives/README.md` | Explains Archives category with criteria | `templates/bootstrap/archives/README.md` |

**Content requirements for all bootstrap README files:**
- MUST use markdown format
- MUST explain the purpose of each PARA category
- MUST provide clear criteria for when content belongs in that category
- MUST include concrete examples users can relate to
- SHOULD encourage users to adapt the structure to their needs
- SHOULD reference Claude as a helper for organization decisions

**Root README additional requirements:**
- MUST introduce the BASB methodology at high level
- MUST provide quick-start suggestions for common workflows
- MUST mention all four PARA categories with brief descriptions
- SHOULD include tips for linking between notes and iterative refinement

---

## File Naming Conventions

The server description includes file naming guidance for Claude, but these are suggestions rather than enforced rules:

**Recommended Format:** kebab-case (lowercase-with-hyphens.md)

**Recommended Length:** Under 50 characters

**Required Extension:** `.md` for all notes

**Allowed Characters:** Letters, numbers, hyphens, underscores (underscores discouraged but acceptable)

**Forbidden Characters:** Special characters except hyphens and underscores, null bytes, path separators

The system MUST validate paths for security (no `..`, null bytes, control characters) but SHOULD NOT enforce naming style beyond security requirements.

---

## Implementation Requirements

**File Creation Order:** Files may be created in any order, but all five MUST be created during a single bootstrap operation.

**Error Handling:** If any file creation fails, the bootstrap operation SHOULD continue attempting to create remaining files. Partial bootstrap is acceptable - the user can manually create missing files.

**Logging:** Bootstrap execution MUST be logged with INFO level including user ID and success/failure status for each file.

**Performance:** All five files should be created concurrently if possible. Total bootstrap time SHOULD be under 2 seconds.

**Validation:** Bootstrap code MUST verify `/README.md` does not exist before creating files to ensure idempotency.

---

## Related Documentation

- [Methodology](./methodology.md) - BASB principles explained in bootstrap files
- [Prompts](./prompts.md) - Workflow prompts mentioned in README.md
- [Architecture](./architecture.md) - System architecture and component interactions
