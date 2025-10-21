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

This description MUST be provided through the MCP server's metadata endpoint and SHOULD match the text in `src/mcp-transport.ts` server initialization.

---

## Bootstrap Files

When bootstrap is triggered, the system MUST create these five files in the user's R2 bucket. Files are created using the standard `write` tool implementation.

### File 1: /README.md

The root README introduces the second brain concept and provides quick-start guidance.

**Required Path:** `/README.md`

**Required Content:**

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

### File 2: /projects/README.md

Explains the Projects category with clear criteria and examples.

**Required Path:** `/projects/README.md`

**Required Content:**

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

### File 3: /areas/README.md

Explains the Areas category with clear criteria and examples.

**Required Path:** `/areas/README.md`

**Required Content:**

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

### File 4: /resources/README.md

Explains the Resources category with clear criteria and examples.

**Required Path:** `/resources/README.md`

**Required Content:**

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

### File 5: /archives/README.md

Explains the Archives category with clear criteria.

**Required Path:** `/archives/README.md`

**Required Content:**

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
- [Architecture](./architecture.md) - Bootstrap implementation in src/bootstrap.ts
- [Implementation](./implementation.md) - Bootstrap module specifications
