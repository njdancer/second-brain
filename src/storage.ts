/**
 * Storage abstraction layer for R2 operations
 * Provides quota enforcement, retry logic, and path validation
 */

export interface StorageObject {
  key: string;
  size: number;
  modified: Date;
  etag?: string;
}

export interface QuotaStatus {
  withinQuota: boolean;
  totalBytes: number;
  totalFiles: number;
  maxBytes: number;
  maxFiles: number;
  maxFileSize: number;
}

export interface Metadata {
  contentType?: string;
  userId?: string;
  [key: string]: string | undefined;
}

const MAX_STORAGE_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
const MAX_FILES = 10000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

export class StorageService {
  constructor(private bucket: R2Bucket) {}

  /**
   * Retrieve an object from storage
   * Returns null if object doesn't exist
   * Retries on transient failures
   */
  async getObject(path: string): Promise<string | null> {
    this.validatePath(path);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const object = await this.bucket.get(path);

        if (!object) {
          return null;
        }

        return await object.text();
      } catch (error) {
        if (attempt === MAX_RETRIES - 1) {
          throw error;
        }
        await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }

    return null;
  }

  /**
   * Store an object in storage
   * Enforces size limits and path validation
   */
  async putObject(path: string, content: string, metadata?: Metadata): Promise<void> {
    this.validatePath(path);

    const size = new TextEncoder().encode(content).length;
    if (size > MAX_FILE_SIZE) {
      throw new Error(
        `File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    const customMetadata: Record<string, string> = {};
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        if (value !== undefined) {
          customMetadata[key] = value;
        }
      }
    }
    customMetadata.size = size.toString();
    customMetadata.modified = new Date().toISOString();

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await this.bucket.put(path, content, { customMetadata });
        return;
      } catch (error) {
        if (attempt === MAX_RETRIES - 1) {
          throw error;
        }
        await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }

  /**
   * Delete an object from storage
   */
  async deleteObject(path: string): Promise<void> {
    this.validatePath(path);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await this.bucket.delete(path);
        return;
      } catch (error) {
        if (attempt === MAX_RETRIES - 1) {
          throw error;
        }
        await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }

  /**
   * List objects in storage with optional prefix
   */
  async listObjects(prefix?: string, delimiter?: string): Promise<StorageObject[]> {
    if (prefix) {
      this.validatePath(prefix);
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const listed = await this.bucket.list({ prefix, delimiter });

        return listed.objects.map((obj) => ({
          key: obj.key,
          size: obj.size,
          modified: obj.uploaded,
          etag: obj.httpEtag,
        }));
      } catch (error) {
        if (attempt === MAX_RETRIES - 1) {
          throw error;
        }
        await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }

    return [];
  }

  /**
   * Check storage quota for a user
   */
  async checkStorageQuota(_userId: string): Promise<QuotaStatus> {
    const objects = await this.listObjects();

    const totalFiles = objects.length;
    const totalBytes = objects.reduce((sum, obj) => sum + obj.size, 0);

    return {
      withinQuota: totalBytes <= MAX_STORAGE_BYTES && totalFiles <= MAX_FILES,
      totalBytes,
      totalFiles,
      maxBytes: MAX_STORAGE_BYTES,
      maxFiles: MAX_FILES,
      maxFileSize: MAX_FILE_SIZE,
    };
  }

  /**
   * Validate a path for security
   * Rejects: absolute paths, .., null bytes, control characters
   */
  private validatePath(path: string): void {
    // Reject absolute paths
    if (path.startsWith('/')) {
      throw new Error('Invalid path: absolute paths not allowed');
    }

    // Reject parent directory references
    if (path.includes('..')) {
      throw new Error('Invalid path: parent directory references not allowed');
    }

    // Reject null bytes
    if (path.includes('\x00')) {
      throw new Error('Invalid path: null bytes not allowed');
    }

    // Reject control characters (except tab and newline which shouldn't be in paths anyway)
    // eslint-disable-next-line no-control-regex -- Intentionally checking for control characters for security
    if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(path)) {
      throw new Error('Invalid path: control characters not allowed');
    }

    // Reject empty path
    if (path.trim().length === 0) {
      throw new Error('Invalid path: empty path not allowed');
    }
  }

  /**
   * Sleep helper for retry logic
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
