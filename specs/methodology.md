# Knowledge Management Methodology

This specification defines the Building a Second Brain (BASB) methodology requirements that the MCP server must support through guidance, prompts, and tool capabilities.

---

## Building a Second Brain (BASB)

The system must support the Building a Second Brain methodology, a personal knowledge management framework created by Tiago Forte that externalizes cognition into a structured digital repository. The MCP server must enable this methodology through guidance and suggested workflows rather than hard-coded enforcement.

### CODE Workflow

The system should guide users through the four-step CODE workflow:

**Capture** - The system MUST provide quick capture capabilities optimized for mobile use. Capture tools should minimize friction and allow users to save ideas, insights, and inspiration without requiring immediate organization decisions.

**Organize** - The system MUST support the PARA organizational framework (defined below) through folder structure suggestions and file placement guidance. Organization should be based on actionability rather than topic or category.

**Distill** - The system SHOULD encourage progressive summarization through prompts that help users highlight key points and extract essence from captured content. This is a guidance capability, not an enforced workflow.

**Express** - The system MAY suggest ways to transform knowledge into tangible outputs by identifying connections between notes and surfacing relevant content during creation workflows.

### PARA Organizational Framework

The system MUST support organizing content using the PARA method, which structures information by actionability level:

**Projects** - Short-term efforts with defined goals and deadlines represent the highest actionability. The system MUST treat projects as temporary containers that should eventually move to archives. A project must have:
- A clear, specific outcome
- A deadline (even if approximate)
- An eventual completion state

**Areas** - Ongoing responsibilities requiring sustained attention with no end date. Areas represent long-term spheres of responsibility. An area must have:
- Continuous maintenance requirements
- A standard to uphold
- No defined completion point

**Resources** - Topics of interest and reference material with low immediate actionability. Resources are collected for potential future use. Resources are characterized by:
- Interest-driven collection
- Reference material for future application
- No direct connection to current responsibilities

**Archives** - Inactive items from any other category with no current actionability. The system MUST support moving completed projects and inactive content to archives organized by year.

### Progressive Summarization

The system SHOULD guide users in progressive summarization, a technique for iteratively distilling notes by highlighting important information. While not enforced, prompts and workflows may suggest:
- Adding metadata (date, source, tags) during capture
- Bolding key points during review
- Creating summary sections for long documents
- Linking related concepts across notes

---

## Guidance Over Enforcement

The system MUST implement BASB methodology through guidance mechanisms rather than rigid structure enforcement:

**Prompts** - Pre-defined workflow prompts (capture-note, weekly-review, research-summary) guide users through BASB workflows without requiring specific actions.

**Server Description** - The MCP server description visible to Claude includes BASB principles and organizational guidance to inform Claude's suggestions.

**Bootstrap Files** - Initial README files explain BASB concepts and provide examples, allowing users to understand the methodology without imposed constraints.

**Flexibility** - Users and Claude MUST be free to adapt the methodology to specific needs. The system should suggest BASB patterns while allowing deviation when appropriate.

---

## File Naming and Organization

The system SHOULD guide users toward consistent file naming conventions while remaining flexible:

**Naming Convention** - Files should use kebab-case naming (lowercase words separated by hyphens) with descriptive names under 50 characters. The `.md` extension is standard for all notes.

**Path Structure** - Files are organized by PARA category through directory paths:
- `projects/{project-name}/` - Active project files
- `areas/{area-name}/` - Ongoing area files
- `resources/{topic}/` - Reference material
- `archives/{year}/` - Archived content by year

**Organic Growth** - The system MUST allow structure to emerge naturally through use. Folders are created implicitly when files are created within them. There is no required folder structure beyond the four PARA top-level categories.

---

## Claude's Role

The MCP server description and prompts define how Claude should interact with the second brain system:

**Placement Decisions** - Claude should suggest PARA placement based on content actionability, asking clarifying questions when the appropriate category is unclear.

**Filename Suggestions** - Claude should recommend descriptive, kebab-case filenames that clearly indicate content.

**Connection Building** - Claude should identify and suggest markdown links between related notes to build a connected knowledge graph.

**Review Support** - During weekly reviews, Claude should help identify completed projects for archiving and orphaned notes needing categorization.

**Outcome Focus** - Claude should guide users toward specific, outcome-oriented project names rather than vague categorical labels.

---

## Related Resources

### Books
- **Building a Second Brain** by Tiago Forte - Definitive methodology guide

### Online Resources
- [buildingasecondbrain.com](https://www.buildingasecondbrain.com) - Official BASB website
- [Forte Labs Blog](https://fortelabs.com/blog/) - BASB articles and updates
- [PARA Method Guide](https://fortelabs.com/blog/para/) - Detailed PARA explanation

### Related Methodologies
- **Zettelkasten** - Note-linking system by Niklas Luhmann emphasizing connections
- **Getting Things Done (GTD)** - Productivity system by David Allen focused on task management
- **Evergreen Notes** - Andy Matuschak's approach to creating lasting, atomic notes

---

## Related Documentation

- [Architecture](./architecture.md) - How BASB methodology is implemented in the system
- [Prompts](./prompts.md) - Pre-defined BASB workflow prompts
- [Bootstrap](./bootstrap.md) - Initial files explaining BASB to new users
- [Tools](./tools.md) - MCP tool capabilities supporting BASB workflows
