/**
 * Backup system for R2 to S3 synchronization
 * Daily automated backups with 30-day retention
 */

import type { StorageService } from './storage';
import type {
  S3Client} from '@aws-sdk/client-s3';
import {
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

export interface BackupResult {
  success: boolean;
  filesBackedUp: number;
  filesSkipped: number;
  totalBytes: number;
  errors: string[];
  startTime: Date;
  endTime: Date;
}

export interface CleanupResult {
  deletedCount: number;
  errors: string[];
}

export interface BackupStatus {
  lastBackupDate?: Date;
  totalBackups: number;
}

const RETENTION_DAYS = 30;

export class BackupService {
  constructor(
    private storage: StorageService,
    private s3Client: S3Client,
    private s3Bucket: string
  ) {}

  /**
   * Sync all files from R2 to S3 with date prefix
   * Only backs up files that are new or modified (ETag comparison)
   */
  async syncR2ToS3(): Promise<BackupResult> {
    const startTime = new Date();
    const today = startTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const errors: string[] = [];
    let filesBackedUp = 0;
    let filesSkipped = 0;
    let totalBytes = 0;

    try {
      // List all objects in R2
      const r2Objects = await this.storage.listObjects();

      for (const r2Object of r2Objects) {
        try {
          const r2Path = r2Object.key;
          const s3Path = `backups/${today}/${r2Path}`;

          // Check if file exists in S3 with same ETag
          const shouldBackup = await this.shouldBackupFile(s3Path, r2Object.etag);

          if (shouldBackup) {
            // Get file content from R2
            const content = await this.storage.getObject(r2Path);
            if (content === null) {
              errors.push(`Failed to read ${r2Path} from R2`);
              continue;
            }

            // Upload to S3 with R2 ETag in metadata
            await this.s3Client.send(
              new PutObjectCommand({
                Bucket: this.s3Bucket,
                Key: s3Path,
                Body: content,
                ContentType: 'text/markdown',
                Metadata: {
                  r2Etag: r2Object.etag || '',
                },
              })
            );

            filesBackedUp++;
            totalBytes += r2Object.size;
          } else {
            filesSkipped++;
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to backup ${r2Object.key}: ${errorMsg}`);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Failed to list R2 objects: ${errorMsg}`);
    }

    const endTime = new Date();

    return {
      success: errors.length === 0,
      filesBackedUp,
      filesSkipped,
      totalBytes,
      errors,
      startTime,
      endTime,
    };
  }

  /**
   * Check if file should be backed up (new or modified)
   * Compares R2 ETags stored in S3 metadata
   */
  private async shouldBackupFile(
    s3Path: string,
    r2Etag?: string
  ): Promise<boolean> {
    try {
      const headResult = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.s3Bucket,
          Key: s3Path,
        })
      );

      // File exists in S3 - compare R2 ETag from metadata
      const storedR2Etag = headResult.Metadata?.r2Etag;
      if (r2Etag && storedR2Etag === r2Etag) {
        return false; // Same R2 ETag, skip backup
      }

      return true; // Different or missing ETag, backup needed
    } catch (error: unknown) {
      // File doesn't exist in S3 (NotFound error)
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        (error.name === 'NotFound' || error.name === 'NoSuchKey')
      ) {
        return true;
      }
      // Other errors - backup to be safe
      return true;
    }
  }

  /**
   * Delete backups older than 30 days
   * Called automatically after successful backup
   */
  async cleanupOldBackups(): Promise<CleanupResult> {
    const errors: string[] = [];
    let deletedCount = 0;

    try {
      // List all backup folders
      const listResult = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.s3Bucket,
          Prefix: 'backups/',
        })
      );

      if (!listResult.Contents || listResult.Contents.length === 0) {
        return { deletedCount: 0, errors: [] };
      }

      // Group by date prefix
      const dateMap = new Map<string, string[]>();
      for (const obj of listResult.Contents) {
        if (!obj.Key) continue;

        // Extract date from path: backups/YYYY-MM-DD/...
        const match = obj.Key.match(/^backups\/(\d{4}-\d{2}-\d{2})\//);
        if (match) {
          const date = match[1];
          if (!dateMap.has(date)) {
            dateMap.set(date, []);
          }
          dateMap.get(date)!.push(obj.Key);
        }
      }

      // Delete old backups
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      for (const [date, keys] of dateMap.entries()) {
        if (date < cutoffStr) {
          try {
            // Delete in batches of 1000 (S3 limit)
            for (let i = 0; i < keys.length; i += 1000) {
              const batch = keys.slice(i, i + 1000);
              await this.s3Client.send(
                new DeleteObjectsCommand({
                  Bucket: this.s3Bucket,
                  Delete: {
                    Objects: batch.map((key) => ({ Key: key })),
                  },
                })
              );
              deletedCount += batch.length;
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Failed to delete backups for ${date}: ${errorMsg}`);
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Failed to list S3 objects: ${errorMsg}`);
    }

    return { deletedCount, errors };
  }

  /**
   * Get current backup status
   */
  async getBackupStatus(): Promise<BackupStatus> {
    try {
      const listResult = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.s3Bucket,
          Prefix: 'backups/',
        })
      );

      // Extract unique dates from file paths
      const dates = new Set<string>();
      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          if (obj.Key) {
            const match = obj.Key.match(/^backups\/(\d{4}-\d{2}-\d{2})\//);
            if (match) {
              dates.add(match[1]);
            }
          }
        }
      }

      const sortedDates = Array.from(dates).sort().reverse();
      const lastBackupDate = sortedDates[0]
        ? new Date(sortedDates[0])
        : undefined;

      return {
        lastBackupDate,
        totalBackups: dates.size,
      };
    } catch {
      return {
        totalBackups: 0,
      };
    }
  }

  /**
   * Full backup and cleanup workflow
   * Called by cron trigger or manual endpoint
   */
  async performBackup(): Promise<BackupResult> {
    // Sync R2 to S3
    const backupResult = await this.syncR2ToS3();

    // Clean up old backups if sync was successful
    if (backupResult.success) {
      await this.cleanupOldBackups();
    }

    return backupResult;
  }
}
