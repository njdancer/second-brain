/**
 * Glob tool implementation
 * Find files matching a glob pattern
 */

import type { StorageService } from '../storage';

export interface GlobParams {
  pattern: string;
  max_results?: number;
}

export interface GlobResult {
  content: string;
  isError: boolean;
}

const DEFAULT_MAX_RESULTS = 100;
const MAX_RESULTS_LIMIT = 1000;

/**
 * Convert glob pattern to regex
 */
function globToRegex(pattern: string): RegExp {
  const regexPattern = pattern
    // Replace ** with a placeholder FIRST (before everything else)
    .replace(/\*\*/g, '\x00DOUBLESTAR\x00')
    // Replace ? with placeholder (before escaping)
    .replace(/\?/g, '\x00QUESTION\x00')
    // Escape special regex characters except * and ?
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Replace single * with match any except /
    .replace(/\*/g, '[^/]*')
    // Replace **/ placeholder (zero or more directories)
    .replace(/\x00DOUBLESTAR\x00\//g, '(?:.*/)?')
    // Remaining ** (standalone) should match anything
    .replace(/\x00DOUBLESTAR\x00/g, '.*')
    // Replace ? placeholder with match single character
    .replace(/\x00QUESTION\x00/g, '.');

  return new RegExp(`^${regexPattern}$`);
}

/**
 * Find files matching glob pattern
 */
export async function globTool(
  params: GlobParams,
  storage: StorageService
): Promise<GlobResult> {
  try {
    // Validate pattern
    if (!params.pattern || params.pattern.trim() === '') {
      return {
        content: 'Error: pattern parameter is required and cannot be empty',
        isError: true,
      };
    }

    // Validate max_results
    let maxResults = params.max_results || DEFAULT_MAX_RESULTS;
    if (maxResults > MAX_RESULTS_LIMIT) {
      maxResults = MAX_RESULTS_LIMIT;
    }

    // Convert glob pattern to regex
    let regex: RegExp;
    try {
      regex = globToRegex(params.pattern);
    } catch (error) {
      return {
        content: `Error: Invalid glob pattern: ${params.pattern}`,
        isError: true,
      };
    }

    // List all objects from storage
    const allObjects = await storage.listObjects();

    // Filter objects that match the pattern
    const matchingObjects = allObjects.filter((obj) => regex.test(obj.key));

    // Sort by modified date (newest first)
    matchingObjects.sort((a, b) => {
      return b.modified.getTime() - a.modified.getTime();
    });

    // Limit results
    const limitedObjects = matchingObjects.slice(0, maxResults);

    // Format results
    const results = limitedObjects.map((obj) => ({
      path: obj.key,
      size: obj.size,
      modified: obj.modified.toISOString(),
    }));

    return {
      content: JSON.stringify(results, null, 2),
      isError: false,
    };
  } catch (error) {
    console.error('Glob tool error:', error);
    return {
      content: `Error finding files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isError: true,
    };
  }
}
