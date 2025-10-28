/**
 * Tool execution router
 * Routes MCP tool calls to actual tool implementations
 */

import type { StorageService } from '../storage';
import type { RateLimiter } from '../rate-limiting';
import type { Logger } from '../logger';
import { readTool, type ReadParams } from './read';
import { writeTool, type WriteParams } from './write';
import { editTool, type EditParams } from './edit';
import { globTool, type GlobParams } from './glob';
import { grepTool, type GrepParams } from './grep';

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
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  const { storage, userId, logger } = context;
  const toolLogger = logger.child({ tool: toolName });
  const startTime = Date.now();

  toolLogger.debug('Tool execution started', { args });

  try {
    let result: { content: string; isError: boolean };

    switch (toolName) {
      case 'read':
        // Validate ReadParams structure
        if (!args.path || typeof args.path !== 'string') {
          throw new Error('Invalid read parameters: path is required');
        }
        if (args.range !== undefined) {
          if (!Array.isArray(args.range) || args.range.length !== 2) {
            throw new Error('Invalid read parameters: range must be [number, number]');
          }
          if (typeof args.range[0] !== 'number' || typeof args.range[1] !== 'number') {
            throw new Error('Invalid read parameters: range values must be numbers');
          }
        }
        if (args.max_bytes !== undefined && typeof args.max_bytes !== 'number') {
          throw new Error('Invalid read parameters: max_bytes must be a number');
        }
        result = await readTool(args as unknown as ReadParams, storage);
        break;

      case 'write':
        // Validate WriteParams structure
        if (!args.path || typeof args.path !== 'string') {
          throw new Error('Invalid write parameters: path is required');
        }
        if (!args.content || typeof args.content !== 'string') {
          throw new Error('Invalid write parameters: content is required');
        }
        result = await writeTool(args as unknown as WriteParams, storage, userId);
        break;

      case 'edit':
        // Validate EditParams structure
        if (!args.path || typeof args.path !== 'string') {
          throw new Error('Invalid edit parameters: path is required');
        }
        if (args.old_str !== undefined && typeof args.old_str !== 'string') {
          throw new Error('Invalid edit parameters: old_str must be a string');
        }
        if (args.new_str !== undefined && typeof args.new_str !== 'string') {
          throw new Error('Invalid edit parameters: new_str must be a string');
        }
        if (args.new_path !== undefined && typeof args.new_path !== 'string') {
          throw new Error('Invalid edit parameters: new_path must be a string');
        }
        if (args.delete !== undefined && typeof args.delete !== 'boolean') {
          throw new Error('Invalid edit parameters: delete must be a boolean');
        }
        result = await editTool(args as unknown as EditParams, storage);
        break;

      case 'glob':
        // Validate GlobParams structure
        if (!args.pattern || typeof args.pattern !== 'string') {
          throw new Error('Invalid glob parameters: pattern is required');
        }
        if (args.max_results !== undefined && typeof args.max_results !== 'number') {
          throw new Error('Invalid glob parameters: max_results must be a number');
        }
        result = await globTool(args as unknown as GlobParams, storage);
        break;

      case 'grep':
        // Validate GrepParams structure
        if (!args.pattern || typeof args.pattern !== 'string') {
          throw new Error('Invalid grep parameters: pattern is required');
        }
        if (args.path !== undefined && typeof args.path !== 'string') {
          throw new Error('Invalid grep parameters: path must be a string');
        }
        if (args.max_matches !== undefined && typeof args.max_matches !== 'number') {
          throw new Error('Invalid grep parameters: max_matches must be a number');
        }
        if (args.context_lines !== undefined && typeof args.context_lines !== 'number') {
          throw new Error('Invalid grep parameters: context_lines must be a number');
        }
        result = await grepTool(args as unknown as GrepParams, storage);
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
