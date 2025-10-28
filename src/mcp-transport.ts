/**
 * MCP Streamable HTTP transport handler
 * Integrates MCP SDK with Cloudflare Workers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { StorageService } from './storage';
import type { RateLimiter } from './rate-limiting';
import { MonitoringService } from './monitoring';
import { bootstrapSecondBrain } from './bootstrap';
import { executeTool } from './tools/executor';
import type { Logger } from './logger';
import { getVersionString } from './version';

/**
 * Create MCP server with tool and prompt handlers
 * Used by Durable Object to create server instances
 */
export function createMCPServerInstance(
  storage: StorageService,
  rateLimiter: RateLimiter,
  analytics: AnalyticsEngineDataset,
  userId: string,
  logger: Logger,
): Server {
  const monitoring = new MonitoringService(analytics);
  const server = new Server(
    {
      name: 'second-brain',
      version: getVersionString(),
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {
          subscribe: false,
          listChanged: false,
        },
      },
      instructions: `Your personal knowledge management assistant using Building a Second Brain (BASB) methodology.

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

Let the structure emerge naturally through use. Create folders as needed by creating files within them.`,
    },
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: [
        {
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
        },
        {
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
        },
        {
          name: 'edit',
          description:
            'Edit existing file using string replacement, with optional move/rename/delete',
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
        },
        {
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
        },
        {
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
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const startTime = Date.now();
    const { name, arguments: args } = request.params;

    try {
      // Check rate limit
      const rateLimitResult = await rateLimiter.checkRateLimit(userId, 'minute');
      if (!rateLimitResult.allowed) {
        await monitoring.recordError(429, userId, `Rate limit exceeded for tool ${name}`);
        return {
          content: [
            {
              type: 'text',
              text: `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds.`,
            },
          ],
          isError: true,
        };
      }

      // Bootstrap on first tool call
      await bootstrapSecondBrain(storage);

      // Execute tool
      const result = await executeTool(name, args as Record<string, unknown>, {
        storage,
        rateLimiter,
        userId,
        logger,
      });

      // Increment rate limit counter for hour and day windows
      // Note: minute window is already incremented by checkRateLimit()
      await rateLimiter.incrementRateLimit(userId, 'hour');
      await rateLimiter.incrementRateLimit(userId, 'day');

      // Record metrics
      const duration = Date.now() - startTime;
      await monitoring.recordToolCall(name, userId, duration, true);

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      await monitoring.recordToolCall(name, userId, duration, false);
      await monitoring.recordError(500, userId, `Tool execution failed: ${name}`);

      console.error(`Tool execution error (${name}):`, error);

      return {
        content: [
          {
            type: 'text',
            text: error instanceof Error ? error.message : 'Tool execution failed',
          },
        ],
        isError: true,
      };
    }
  });

  // Register prompt handlers
  server.setRequestHandler(ListPromptsRequestSchema, () => {
    return {
      prompts: [
        {
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
        },
        {
          name: 'weekly-review',
          description: 'Guided weekly review of the second brain',
          arguments: [
            {
              name: 'focus_areas',
              description: 'Specific projects or areas to review',
              required: false,
            },
          ],
        },
        {
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
        },
      ],
    };
  });

  // Handle prompt get requests
  server.setRequestHandler(GetPromptRequestSchema, (request) => {
    const { name, arguments: args } = request.params;

    const prompts: Record<string, (args: Record<string, string>) => string> = {
      'capture-note': (args) => {
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
      'weekly-review': (args) => {
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
      'research-summary': (args) => {
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
    };

    const promptGenerator = prompts[name];
    if (!promptGenerator) {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Prompt "${name}" not found`,
            },
          },
        ],
      };
    }

    const message = promptGenerator((args as Record<string, string>) || {});

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: message,
          },
        },
      ],
    };
  });

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      // List all objects from storage
      const objects = await storage.listObjects();

      // Convert storage objects to MCP resources
      const resources = objects.map((obj) => ({
        uri: `file:///${obj.key}`,
        name: obj.key.split('/').pop() || obj.key,
        title: obj.key,
        description: `Document in ${obj.key.split('/').slice(0, -1).join('/')}`,
        mimeType: obj.key.endsWith('.md') ? 'text/markdown' : 'text/plain',
        annotations: {
          audience: ['user'] as ('user' | 'assistant')[],
          priority: 0.5,
          lastModified: obj.modified.toISOString(),
        },
      }));

      return {
        resources,
      };
    } catch (error) {
      console.error('List resources error:', error);
      throw error;
    }
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const { uri } = request.params;

      // Extract path from file:/// URI
      if (!uri.startsWith('file:///')) {
        throw new Error(`Unsupported URI scheme: ${uri}`);
      }

      const path = uri.substring('file:///'.length);

      // Read file from storage
      const content = await storage.getObject(path);

      if (content === null) {
        const error = new Error(`Resource not found: ${uri}`);
        (error as any).code = -32002;
        throw error;
      }

      // Get file metadata
      const objects = await storage.listObjects();
      const fileObj = objects.find((obj) => obj.key === path);

      return {
        contents: [
          {
            uri,
            name: path.split('/').pop() || path,
            title: path,
            mimeType: path.endsWith('.md') ? 'text/markdown' : 'text/plain',
            text: content,
            annotations: fileObj
              ? {
                  audience: ['user'] as ('user' | 'assistant')[],
                  priority: 0.5,
                  lastModified: fileObj.modified.toISOString(),
                }
              : undefined,
          },
        ],
      };
    } catch (error) {
      console.error('Read resource error:', error);
      throw error;
    }
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: [
        {
          uriTemplate: 'file:///{path}',
          name: 'Second Brain Documents',
          title: '🧠 Second Brain Documents',
          description:
            'Access any document in your second brain by path (e.g., projects/app/notes.md)',
          mimeType: 'text/markdown',
          annotations: {
            audience: ['user'] as ('user' | 'assistant')[],
            priority: 0.7,
          },
        },
      ],
    };
  });

  return server;
}

/**
 * Check if request is an initialize request
 */
export function isInitializeRequest(body: unknown): boolean {
  return (
    typeof body === 'object' && body !== null && 'method' in body && body.method === 'initialize'
  );
}
