/**
 * Grep tool implementation
 * Search file contents using regex patterns
 */

import type { StorageService } from '../storage';

export interface GrepParams {
  pattern: string;
  path?: string; // Optional path to scope search (supports globs)
  max_matches?: number; // Max results to return (default: 50, max: 1000)
  context_lines?: number; // Lines of context before AND after match (default: 0)
}

export interface GrepMatch {
  path: string;
  line: number;
  match: string;
  context?: string[];
}

export interface GrepResult {
  content: string;
  isError: boolean;
}

const DEFAULT_MAX_MATCHES = 50;
const MAX_MATCHES_LIMIT = 1000;

/**
 * Convert glob pattern to regex (for path filtering)
 */
function globToRegex(pattern: string): RegExp {
  // Using \x00 as safe placeholder - intentional control characters
  const regexPattern = pattern
    .replace(/\*\*/g, '\x00DOUBLESTAR\x00')
    .replace(/\?/g, '\x00QUESTION\x00')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    // eslint-disable-next-line no-control-regex
    .replace(/\x00DOUBLESTAR\x00\//g, '(?:.*/)?')
    // eslint-disable-next-line no-control-regex
    .replace(/\x00DOUBLESTAR\x00/g, '.*')
    // eslint-disable-next-line no-control-regex
    .replace(/\x00QUESTION\x00/g, '.');

  return new RegExp(`^${regexPattern}$`);
}

/**
 * Search file contents using regex
 */
export async function grepTool(
  params: GrepParams,
  storage: StorageService
): Promise<GrepResult> {
  try {
    // Validate pattern
    if (!params.pattern || params.pattern.trim() === '') {
      return {
        content: 'Error: pattern parameter is required and cannot be empty',
        isError: true,
      };
    }

    // Validate max_matches
    let maxMatches = params.max_matches || DEFAULT_MAX_MATCHES;
    if (maxMatches > MAX_MATCHES_LIMIT) {
      maxMatches = MAX_MATCHES_LIMIT;
    }

    // Compile regex pattern (case-insensitive by default)
    let searchRegex: RegExp;
    try {
      searchRegex = new RegExp(params.pattern, 'i');
    } catch {
      return {
        content: `Error: Invalid regex pattern: ${params.pattern}`,
        isError: true,
      };
    }

    // Get list of files to search
    const allObjects = await storage.listObjects();

    // Filter by path if specified
    let filesToSearch = allObjects;
    if (params.path) {
      const pathRegex = globToRegex(params.path);
      filesToSearch = allObjects.filter((obj) => pathRegex.test(obj.key));
    }

    // Search files
    const matches: GrepMatch[] = [];
    let totalMatches = 0;

    for (const fileObj of filesToSearch) {
      if (totalMatches >= maxMatches) {
        break;
      }

      // Read file content
      const content = await storage.getObject(fileObj.key);
      if (!content) {
        continue;
      }

      // Search line by line
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (totalMatches >= maxMatches) {
          break;
        }

        const line = lines[i];
        if (searchRegex.test(line)) {
          const match: GrepMatch = {
            path: fileObj.key,
            line: i + 1, // 1-indexed
            match: line,
          };

          // Add context lines if requested
          if (params.context_lines && params.context_lines > 0) {
            const start = Math.max(0, i - params.context_lines);
            const end = Math.min(lines.length, i + params.context_lines + 1);
            match.context = lines.slice(start, end);
          }

          matches.push(match);
          totalMatches++;
        }
      }
    }

    return {
      content: JSON.stringify(matches, null, 2),
      isError: false,
    };
  } catch (error) {
    console.error('Grep tool error:', error);
    return {
      content: `Error searching files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isError: true,
    };
  }
}
