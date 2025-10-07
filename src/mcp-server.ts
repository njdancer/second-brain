/**
 * MCP server implementation with tool and prompt registration
 */

const SERVER_DESCRIPTION = `Your personal knowledge management assistant using Building a Second Brain (BASB) methodology.

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
8. Recommend specific, outcome-oriented project names over vague ones`;

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
  getMessage?: (args: Record<string, string>) => string;
}

export interface MCPServer {
  name: string;
  version: string;
  description: string;
  tools: Map<string, MCPTool>;
  prompts: Map<string, MCPPrompt>;
}

/**
 * Create MCP server instance with metadata
 */
export function createMCPServer(): MCPServer {
  return {
    name: 'second-brain',
    version: '1.0.0',
    description: SERVER_DESCRIPTION,
    tools: new Map(),
    prompts: new Map(),
  };
}

/**
 * Register all MCP tools
 */
export function registerTools(server: MCPServer): void {
  // Read tool
  server.tools.set('read', {
    name: 'read',
    description: 'Read file contents with optional range selection',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file (e.g., "projects/app/notes.md")',
        },
        range: {
          type: 'array',
          description: 'Optional line range [start, end] (1-indexed, inclusive)',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
        },
        max_bytes: {
          type: 'number',
          description: 'Optional byte limit for large files',
        },
      },
      required: ['path'],
    },
  });

  // Write tool
  server.tools.set('write', {
    name: 'write',
    description: 'Create new file or overwrite existing file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file',
        },
        content: {
          type: 'string',
          description: 'Full content to write',
        },
      },
      required: ['path', 'content'],
    },
  });

  // Edit tool
  server.tools.set('edit', {
    name: 'edit',
    description: 'Edit existing file using string replacement, with optional move/rename/delete',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to file to edit (REQUIRED)',
        },
        old_str: {
          type: 'string',
          description: 'String to find and replace (must be unique in file)',
        },
        new_str: {
          type: 'string',
          description: 'Replacement string (empty string to delete text)',
        },
        new_path: {
          type: 'string',
          description: 'If provided, move/rename file after edit',
        },
        delete: {
          type: 'boolean',
          description: 'If true, delete the file (path still required)',
        },
      },
      required: ['path'],
    },
  });

  // Glob tool
  server.tools.set('glob', {
    name: 'glob',
    description: 'Find files matching a pattern',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern (e.g., "projects/**/*.md", "*.md")',
        },
        max_results: {
          type: 'number',
          description: 'Optional limit (default: 100, max: 1000)',
        },
      },
      required: ['pattern'],
    },
  });

  // Grep tool
  server.tools.set('grep', {
    name: 'grep',
    description: 'Search file contents using regex',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Optional path to scope search (supports globs)',
        },
        max_matches: {
          type: 'number',
          description: 'Max results to return (default: 50, max: 1000)',
        },
        context_lines: {
          type: 'number',
          description: 'Lines of context before AND after match (default: 0)',
        },
      },
      required: ['pattern'],
    },
  });
}

/**
 * Register all MCP prompts
 */
export function registerPrompts(server: MCPServer): void {
  // Capture note prompt
  server.prompts.set('capture-note', {
    name: 'capture-note',
    description: 'Quick capture workflow for capturing notes',
    arguments: [
      {
        name: 'content',
        description: 'The note content to capture',
        required: true,
      },
      {
        name: 'context',
        description: 'Where this came from (conversation, article URL, etc.)',
        required: false,
      },
      {
        name: 'tags',
        description: 'Comma-separated tags',
        required: false,
      },
    ],
    getMessage: (args: Record<string, string>) => {
      const content = args.content || '';
      const context = args.context || '';
      const tags = args.tags || '';

      return `I need to capture this note into my second brain:

Content: ${content}
Context: ${context}
Tags: ${tags}

Please:
1. Determine the best PARA category based on content
2. Suggest a descriptive filename (kebab-case)
3. Add metadata (date, source, tags) to the note
4. Save to appropriate location
5. Confirm where you saved it`;
    },
  });

  // Weekly review prompt
  server.prompts.set('weekly-review', {
    name: 'weekly-review',
    description: 'Guided weekly review of the second brain',
    arguments: [
      {
        name: 'focus_areas',
        description: 'Specific projects or areas to review',
        required: false,
      },
    ],
    getMessage: (args: Record<string, string>) => {
      const focusAreas = args.focus_areas || '';

      return `Let's do a weekly review of my second brain.

Focus areas: ${focusAreas}

Please:
1. List active projects and their status
2. Identify projects that should move to archives
3. Find orphaned notes that need categorization
4. Suggest connections between related notes
5. Highlight areas needing attention
6. Recommend quick wins for the coming week`;
    },
  });

  // Research summary prompt
  server.prompts.set('research-summary', {
    name: 'research-summary',
    description: 'Process and summarize research on a topic',
    arguments: [
      {
        name: 'topic',
        description: 'The research topic',
        required: true,
      },
      {
        name: 'output_location',
        description: 'Where to save summary',
        required: false,
      },
    ],
    getMessage: (args: Record<string, string>) => {
      const topic = args.topic || '';
      const outputLocation = args.output_location || 'suggest appropriate location';

      return `I've been researching ${topic}. Let's process this into my second brain.

Please:
1. Search existing notes about ${topic}
2. Identify key themes and insights
3. Create a progressive summary (bold key points)
4. Suggest related resources to explore
5. Save summary to ${outputLocation}`;
    },
  });
}
