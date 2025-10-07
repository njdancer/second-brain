/**
 * Tool execution router
 * Routes MCP tool calls to actual tool implementations
 */

import { StorageService } from '../storage';
import { RateLimiter } from '../rate-limiting';
import { readTool } from './read';
import { writeTool } from './write';
import { editTool } from './edit';
import { globTool } from './glob';
import { grepTool } from './grep';

export interface ToolContext {
  storage: StorageService;
  rateLimiter: RateLimiter;
  userId: string;
}

/**
 * Execute a tool with given arguments and context
 */
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  context: ToolContext
): Promise<string> {
  const { storage, userId } = context;

  let result: { content: string; isError: boolean };

  switch (toolName) {
    case 'read':
      result = await readTool(args as any, storage);
      break;

    case 'write':
      result = await writeTool(args as any, storage, userId);
      break;

    case 'edit':
      result = await editTool(args as any, storage);
      break;

    case 'glob':
      result = await globTool(args as any, storage);
      break;

    case 'grep':
      result = await grepTool(args as any, storage);
      break;

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }

  // If the tool returned an error, throw it
  if (result.isError) {
    throw new Error(result.content);
  }

  return result.content;
}
