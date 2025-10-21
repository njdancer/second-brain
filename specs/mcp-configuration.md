# MCP Configuration

Server metadata, prompts, and bootstrap files for the Second Brain MCP server.

---

## Server Metadata

**Server Name:** `second-brain`

**Server Version:** `1.0.0`

**Server Description:**

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

---

## MCP Prompts

Prompts are pre-defined workflows users can explicitly invoke through Claude's MCP prompt interface.

### Prompt 1: `capture-note`

Quick capture workflow for mobile.

**Arguments:**
- `content` (required): The note content to capture
- `context` (optional): Where this came from (conversation, article URL, etc.)
- `tags` (optional): Comma-separated tags

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

---

### Prompt 2: `weekly-review`

Guided weekly review of the second brain.

**Arguments:**
- `focus_areas` (optional): Specific projects or areas to review

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

---

### Prompt 3: `research-summary`

Process and summarize research on a topic.

**Arguments:**
- `topic` (required): The research topic
- `output_location` (optional): Where to save summary

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

---

## Bootstrap Files

Bootstrap is triggered when `/README.md` does not exist in the R2 bucket. On first successful OAuth connection, create these files:

### `/README.md`

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

### `/projects/README.md`

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

### `/areas/README.md`

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

### `/resources/README.md`

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

### `/archives/README.md`

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

**Guidance provided to Claude via server description:**

- Use kebab-case for filenames: `my-project-notes.md`
- Use descriptive names: `product-launch-plan.md` not `notes.md`
- Use `.md` extension for all notes
- Avoid special characters except hyphens (underscores acceptable but discouraged)
- Keep names concise but meaningful (under 50 characters recommended)

**Note:** These are suggestions embedded in the server description, not enforced by the system. Claude has flexibility to adapt based on user preferences.

---

## Related Documentation

- [Overview](./overview.md) - BASB methodology and design philosophy
- [API Reference](./api-reference.md) - Tool specifications
- [User Workflows](./user-workflows.md) - Example usage patterns
