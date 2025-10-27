/**
 * Mock R2 bucket for testing
 */

// Mock implementation of R2Checksums
const createMockChecksums = (): R2Checksums => ({
  toJSON: () => ({}),
});

// Mock implementation of R2HTTPMetadata
const createMockHttpMetadata = (): R2HTTPMetadata => ({});

export interface MockR2Object {
  key: string;
  value: string;
  metadata?: Record<string, string>;
  size: number;
  uploaded: Date;
  httpEtag: string;
}

export class MockR2Bucket {
  private objects: Map<string, MockR2Object> = new Map();
  private shouldFail: boolean = false;
  private failureCount: number = 0;
  private maxFailures: number = Infinity; // Default to always fail

  constructor() {}

  get(key: string): Promise<R2ObjectBody | null> {
    if (this.shouldFail && this.failureCount < this.maxFailures) {
      this.failureCount++;
      return Promise.reject(new Error('R2 operation failed'));
    }

    const obj = this.objects.get(key);
    if (!obj) {
      return Promise.resolve(null);
    }

    // Create ReadableStream from string value
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(obj.value));
        controller.close();
      },
    });

    return Promise.resolve({
      key: obj.key,
      version: 'mock-version',
      size: obj.size,
      etag: obj.httpEtag.replace(/"/g, ''),
      httpEtag: obj.httpEtag,
      checksums: createMockChecksums(),
      uploaded: obj.uploaded,
      httpMetadata: createMockHttpMetadata(),
      customMetadata: obj.metadata || {},
      range: undefined,
      storageClass: 'STANDARD',
      writeHttpMetadata: () => {},
      get body() {
        return stream;
      },
      get bodyUsed() {
        return false;
      },
      text: () => Promise.resolve(obj.value),
      json: () => Promise.resolve(JSON.parse(obj.value) as unknown),
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(obj.value).buffer),
      bytes: () => Promise.resolve(new TextEncoder().encode(obj.value)),
      blob: () => Promise.resolve(new Blob([obj.value])),
    } as R2ObjectBody);
  }

  put(
    key: string,
    value: string | ReadableStream | ArrayBuffer,
    options?: { customMetadata?: Record<string, string> }
  ): Promise<R2Object> {
    if (this.shouldFail && this.failureCount < this.maxFailures) {
      this.failureCount++;
      return Promise.reject(new Error('R2 operation failed'));
    }

    const valueStr = typeof value === 'string' ? value : '';
    const size = new TextEncoder().encode(valueStr).length;

    const obj: MockR2Object = {
      key,
      value: valueStr,
      metadata: options?.customMetadata,
      size,
      uploaded: new Date(),
      httpEtag: `"${Math.random().toString(36).substring(2)}"`,
    };

    this.objects.set(key, obj);
    this.failureCount = 0;

    return Promise.resolve({
      key: obj.key,
      version: 'mock-version',
      size: obj.size,
      etag: obj.httpEtag.replace(/"/g, ''),
      httpEtag: obj.httpEtag,
      checksums: createMockChecksums(),
      uploaded: obj.uploaded,
      httpMetadata: createMockHttpMetadata(),
      customMetadata: obj.metadata || {},
      range: undefined,
      storageClass: 'STANDARD',
      writeHttpMetadata: () => {},
    } as R2Object);
  }

  delete(keys: string | string[]): Promise<void> {
    if (this.shouldFail && this.failureCount < this.maxFailures) {
      this.failureCount++;
      return Promise.reject(new Error('R2 operation failed'));
    }

    const keyArray = Array.isArray(keys) ? keys : [keys];
    for (const key of keyArray) {
      this.objects.delete(key);
    }
    return Promise.resolve();
  }

  list(options?: {
    prefix?: string;
    delimiter?: string;
    limit?: number;
    cursor?: string;
  }): Promise<R2Objects> {
    if (this.shouldFail && this.failureCount < this.maxFailures) {
      this.failureCount++;
      return Promise.reject(new Error('R2 operation failed'));
    }

    let filtered = Array.from(this.objects.values());

    if (options?.prefix) {
      filtered = filtered.filter((obj) => obj.key.startsWith(options.prefix!));
    }

    const objects = filtered.map((obj) => ({
      key: obj.key,
      version: 'mock-version',
      size: obj.size,
      etag: obj.httpEtag.replace(/"/g, ''),
      httpEtag: obj.httpEtag,
      checksums: createMockChecksums(),
      uploaded: obj.uploaded,
      httpMetadata: createMockHttpMetadata(),
      customMetadata: obj.metadata || {},
      range: undefined,
      storageClass: 'STANDARD',
      writeHttpMetadata: () => {},
    })) as R2Object[];

    return Promise.resolve({
      objects,
      truncated: false,
      delimitedPrefixes: [],
    } as R2Objects);
  }

  // Test helpers
  setFailure(shouldFail: boolean, maxFailures: number = Infinity): void {
    this.shouldFail = shouldFail;
    this.maxFailures = maxFailures;
    this.failureCount = 0;
  }

  clear(): void {
    this.objects.clear();
    this.shouldFail = false;
    this.maxFailures = Infinity;
    this.failureCount = 0;
  }

  getSize(): number {
    return Array.from(this.objects.values()).reduce((sum, obj) => sum + obj.size, 0);
  }

  getCount(): number {
    return this.objects.size;
  }
}
