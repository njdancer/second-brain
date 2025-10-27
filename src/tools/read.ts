/**
 * Read tool implementation
 * Reads file contents with optional range selection and byte limits
 */

import type { StorageService } from '../storage';

export interface ReadParams {
  path: string;
  range?: [number, number]; // [start, end] lines, 1-indexed, inclusive
  max_bytes?: number;
}

export interface ReadResult {
  content: string;
  isError: boolean;
}

const _MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB default limit (defined for documentation)

/**
 * Read file contents
 */
export async function readTool(params: ReadParams, storage: StorageService): Promise<ReadResult> {
  try {
    // Validate path
    if (!params.path || params.path.trim() === '') {
      return {
        content: 'Error: path parameter is required and cannot be empty',
        isError: true,
      };
    }

    // Validate range if provided
    if (params.range) {
      const [start, end] = params.range;
      if (start < 1 || end < 1) {
        return {
          content: 'Error: Invalid range - line numbers must be >= 1',
          isError: true,
        };
      }
      if (start > end) {
        return {
          content: 'Error: Invalid range - start line must be <= end line',
          isError: true,
        };
      }
    }

    // Get file from storage
    const content = await storage.getObject(params.path);

    if (content === null) {
      return {
        content: `Error: File not found: ${params.path}`,
        isError: true,
      };
    }

    // Apply range selection if specified
    let result = content;
    if (params.range) {
      const lines = content.split('\n');
      const [start, end] = params.range;

      // Convert to 0-indexed and clamp to file length
      const startIndex = Math.max(0, start - 1);
      const endIndex = Math.min(lines.length, end);

      result = lines.slice(startIndex, endIndex).join('\n');
    }

    // Apply byte limit if specified
    if (params.max_bytes && params.max_bytes > 0) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(result);

      if (bytes.length > params.max_bytes) {
        // Truncate to byte limit
        // Decode to avoid cutting multi-byte characters in half
        const decoder = new TextDecoder();
        const truncated = bytes.slice(0, params.max_bytes);
        result = decoder.decode(truncated, { stream: false });
      }
    }

    return {
      content: result,
      isError: false,
    };
  } catch (error) {
    console.error('Read tool error:', error);
    return {
      content: `Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isError: true,
    };
  }
}
