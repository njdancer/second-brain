/**
 * Write tool implementation
 * Creates new files or overwrites existing files
 */

import type { StorageService } from '../storage';

export interface WriteParams {
  path: string;
  content: string;
}

export interface WriteResult {
  content: string;
  isError: boolean;
}

const MAX_WRITE_SIZE = 1 * 1024 * 1024; // 1MB limit for writes

/**
 * Write file contents (create or overwrite)
 */
export async function writeTool(
  params: WriteParams,
  storage: StorageService,
  userId: string,
): Promise<WriteResult> {
  try {
    // Validate path
    if (!params.path || params.path.trim() === '') {
      return {
        content: 'Error: path parameter is required and cannot be empty',
        isError: true,
      };
    }

    // Validate path doesn't contain directory traversal
    if (params.path.includes('..')) {
      return {
        content: 'Error: Invalid path - directory traversal not allowed',
        isError: true,
      };
    }

    // Validate content
    if (params.content === null || params.content === undefined) {
      return {
        content: 'Error: content parameter is required',
        isError: true,
      };
    }

    // Check file size
    const encoder = new TextEncoder();
    const bytes = encoder.encode(params.content);

    if (bytes.length > MAX_WRITE_SIZE) {
      return {
        content: `Error: File size exceeds 1MB limit (size: ${Math.round(bytes.length / 1024)}KB)`,
        isError: true,
      };
    }

    // Check storage quota
    const quota = await storage.checkStorageQuota(userId);
    if (!quota.withinQuota) {
      return {
        content: `Error: Storage quota exceeded (used: ${Math.round(quota.totalBytes / 1024 / 1024)}MB / ${Math.round(quota.maxBytes / 1024 / 1024)}MB, files: ${quota.totalFiles} / ${quota.maxFiles})`,
        isError: true,
      };
    }

    // Write file to storage
    await storage.putObject(params.path, params.content, {
      contentType: 'text/markdown',
      userId,
    });

    return {
      content: `Successfully wrote ${bytes.length} bytes to ${params.path}`,
      isError: false,
    };
  } catch (error) {
    console.error('Write tool error:', error);
    return {
      content: `Error writing file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isError: true,
    };
  }
}
