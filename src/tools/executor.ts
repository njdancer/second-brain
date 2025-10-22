/**
 * Tool execution router
 * Routes MCP tool calls to actual tool implementations
 */

import type { StorageService } from '../storage';
import type { RateLimiter } from '../rate-limiting';
import type { Logger } from '../logger';
import { readTool } from './read';
import { writeTool } from './write';
import { editTool } from './edit';
import { globTool } from './glob';
import { grepTool } from './grep';

export interface ToolContext {
  storage: StorageService;
  rateLimiter: RateLimiter;
  userId: string;
  logger: Logger;
}

/**
 * Execute a tool with given arguments and context
 */
export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  context: ToolContext
): Promise<string> {
  const { storage, userId, logger } = context;
  const toolLogger = logger.child({ tool: toolName });
  const startTime = Date.now();

  toolLogger.debug('Tool execution started', { args });

  try {
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

    const duration = Date.now() - startTime;
    toolLogger.info('Tool execution succeeded', { duration });

    return result.content;
  } catch (error) {
    const duration = Date.now() - startTime;
    toolLogger.error('Tool execution failed', error as Error, { args, duration });
    throw error;
  }
}
