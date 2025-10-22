/**
 * Edit tool implementation
 * Edits existing files using string replacement, with optional move/rename/delete
 */

import type { StorageService } from '../storage';

export interface EditParams {
  path: string; // Path to file to edit (REQUIRED)
  old_str?: string; // String to find and replace (must be unique in file)
  new_str?: string; // Replacement string (empty string to delete text)
  new_path?: string; // If provided, move/rename file after edit
  delete?: boolean; // If true, delete the file (path still required)
}

export interface EditResult {
  content: string;
  isError: boolean;
}

/**
 * Edit file (string replacement, move, rename, or delete)
 */
export async function editTool(
  params: EditParams,
  storage: StorageService
): Promise<EditResult> {
  try {
    // Validate path
    if (!params.path || params.path.trim() === '') {
      return {
        content: 'Error: path parameter is required and cannot be empty',
        isError: true,
      };
    }

    // Handle delete operation
    if (params.delete === true) {
      // Check if file exists
      const content = await storage.getObject(params.path);
      if (content === null) {
        return {
          content: `Error: File not found: ${params.path}`,
          isError: true,
        };
      }

      // Delete the file
      await storage.deleteObject(params.path);

      return {
        content: `Successfully deleted ${params.path}`,
        isError: false,
      };
    }

    // For other operations, file must exist
    let content = await storage.getObject(params.path);
    if (content === null) {
      return {
        content: `Error: File not found: ${params.path}`,
        isError: true,
      };
    }

    // Handle string replacement if specified
    if (params.old_str !== undefined || params.new_str !== undefined) {
      // Validate both old_str and new_str are provided
      if (params.old_str === undefined) {
        return {
          content: 'Error: old_str is required when new_str is provided',
          isError: true,
        };
      }

      // Check if old_str exists in file
      if (!content.includes(params.old_str)) {
        return {
          content: `Error: String not found in file: "${params.old_str}"`,
          isError: true,
        };
      }

      // Check if old_str is unique
      const firstIndex = content.indexOf(params.old_str);
      const lastIndex = content.lastIndexOf(params.old_str);
      if (firstIndex !== lastIndex) {
        return {
          content: `Error: String is not unique in file (appears ${content.split(params.old_str).length - 1} times): "${params.old_str}"`,
          isError: true,
        };
      }

      // Perform replacement
      const newStr = params.new_str !== undefined ? params.new_str : '';
      content = content.replace(params.old_str, newStr);

      // Write back to original path
      await storage.putObject(params.path, content);
    }

    // Handle move/rename if specified
    if (params.new_path) {
      // Check if target path already exists
      const targetExists = await storage.getObject(params.new_path);
      if (targetExists !== null) {
        return {
          content: `Error: Target path already exists: ${params.new_path}`,
          isError: true,
        };
      }

      // Move file (copy to new location and delete old)
      await storage.putObject(params.new_path, content);
      await storage.deleteObject(params.path);

      return {
        content: `Successfully moved ${params.path} to ${params.new_path}`,
        isError: false,
      };
    }

    // Check if at least one operation was performed
    if (params.old_str === undefined && !params.new_path && !params.delete) {
      return {
        content: 'Error: No operation specified (provide old_str/new_str, new_path, or delete)',
        isError: true,
      };
    }

    return {
      content: `Successfully edited ${params.path}`,
      isError: false,
    };
  } catch (error) {
    console.error('Edit tool error:', error);
    return {
      content: `Error editing file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isError: true,
    };
  }
}
