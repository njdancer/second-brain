/**
 * Bootstrap system for creating initial PARA structure on first use
 * Triggers when /README.md does not exist in R2
 */

import type { StorageService } from './storage';

/**
 * Check if bootstrap is needed
 * @param storage StorageService instance
 * @returns true if README.md does not exist
 */
export async function shouldBootstrap(storage: StorageService): Promise<boolean> {
  const readme = await storage.getObject('README.md');
  return readme === null;
}

/**
 * Create initial PARA structure files
 * Idempotent - only creates files that don't exist
 * @param storage StorageService instance
 */
export async function bootstrapSecondBrain(storage: StorageService): Promise<void> {
  const files = [
    {
      path: 'README.md',
      content: MAIN_README,
    },
    {
      path: 'projects/README.md',
      content: PROJECTS_README,
    },
    {
      path: 'areas/README.md',
      content: AREAS_README,
    },
    {
      path: 'resources/README.md',
      content: RESOURCES_README,
    },
    {
      path: 'archives/README.md',
      content: ARCHIVES_README,
    },
  ];

  // Create files only if they don't exist (idempotent)
  for (const file of files) {
    const existing = await storage.getObject(file.path);
    if (existing === null) {
      await storage.putObject(file.path, file.content, {
        contentType: 'text/markdown',
      });
    }
  }
}

// Bootstrap file contents from specs/mcp-configuration.md

const MAIN_README = `# My Second Brain

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
- Link between notes using relative paths: \`[related note](./other-note.md)\`
- Let Claude suggest organization - it understands BASB principles
- Review and refine regularly - knowledge management is iterative
`;

const PROJECTS_README = `# Projects

Short-term efforts with defined goals and deadlines.

A project should:
- Have a clear outcome you're working toward
- Have a deadline (even if approximate)
- End at some point (then move to archives)

Examples:
- Launch new website by Q4
- Learn Spanish for vacation in June
- Plan and execute office move
`;

const AREAS_README = `# Areas

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
`;

const RESOURCES_README = `# Resources

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
`;

const ARCHIVES_README = `# Archives

Inactive items from Projects, Areas, and Resources.

Move here when:
- Projects are completed or abandoned
- Areas are no longer responsibilities
- Resources are no longer interesting

Keep archives organized by year for easy retrieval.
`;
