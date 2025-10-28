/**
 * Mock S3 Client for testing AWS S3 operations
 * Implements only the methods we actually use in backup.ts
 *
 * Note: We don't use Pick<S3Client, 'send'> here because S3Client isn't a simple interface.
 * The send() method uses command pattern with dynamic types, so we handle it with 'any'
 * and type-safe private methods instead.
 */

interface MockS3Object {
  body: string;
  etag: string;
  metadata?: Record<string, string>;
}

/**
 * Mock S3 Client that handles PutObject, HeadObject, ListObjectsV2, and DeleteObjects commands
 */
export class MockS3Client {
  private objects: Map<string, MockS3Object> = new Map();

  /**
   * Send a command to S3
   * Supports: PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand
   */
  async send(command: any): Promise<any> {
    const commandName = command.constructor.name;

    if (commandName === 'PutObjectCommand') {
      return this.handlePutObject(command);
    }

    if (commandName === 'HeadObjectCommand') {
      return this.handleHeadObject(command);
    }

    if (commandName === 'ListObjectsV2Command') {
      return this.handleListObjects(command);
    }

    if (commandName === 'DeleteObjectsCommand') {
      return this.handleDeleteObjects(command);
    }

    throw new Error(`Unknown S3 command: ${commandName}`);
  }

  private handlePutObject(command: any): { ETag: string } {
    const key = command.input.Key;
    const body = command.input.Body;
    const metadata = command.input.Metadata || {};
    const etag = `"${Math.random().toString(36).substring(2)}"`;

    this.objects.set(key, { body, etag, metadata });

    return { ETag: etag };
  }

  private handleHeadObject(command: any): { ETag: string; Metadata?: Record<string, string> } {
    const key = command.input.Key;
    const obj = this.objects.get(key);

    if (!obj) {
      const error: any = new Error('NotFound');
      error.name = 'NotFound';
      throw error;
    }

    return { ETag: obj.etag, Metadata: obj.metadata };
  }

  private handleListObjects(command: any): { Contents: Array<{ Key: string; ETag: string }> } {
    const prefix = command.input.Prefix || '';
    const filtered = Array.from(this.objects.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, obj]) => ({
        Key: key,
        ETag: obj.etag,
      }));

    return { Contents: filtered };
  }

  private handleDeleteObjects(command: any): { Deleted: Array<{ Key: string }> } {
    const keys = command.input.Delete.Objects.map((o: any) => o.Key);

    for (const key of keys) {
      this.objects.delete(key);
    }

    return { Deleted: keys.map((k: string) => ({ Key: k })) };
  }

  // Test helper methods
  clear(): void {
    this.objects.clear();
  }

  getObject(key: string): MockS3Object | undefined {
    return this.objects.get(key);
  }

  setObject(key: string, body: string, etag: string, metadata?: Record<string, string>): void {
    this.objects.set(key, { body, etag, metadata });
  }
}
