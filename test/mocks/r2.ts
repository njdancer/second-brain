/**
 * Mock R2 bucket for testing
 *
 * Implements the R2Bucket interface methods we actually use: get, put, delete, list.
 * TypeScript ensures we match Cloudflare's R2 API signatures.
 */

export interface MockR2Object {
  key: string;
  value: string;
  metadata?: Record<string, string>;
  size: number;
  uploaded: Date;
  httpEtag: string;
}

/**
 * Mock R2 Bucket implementing Pick<R2Bucket, 'get' | 'put' | 'delete' | 'list'>
 * TypeScript will catch it if Cloudflare changes the R2 API
 */
export class MockR2Bucket implements Pick<R2Bucket, 'get' | 'put' | 'delete' | 'list'> {
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

    // Return only the properties actually used by tests
    return Promise.resolve({
      key: obj.key,
      size: obj.size,
      httpEtag: obj.httpEtag,
      uploaded: obj.uploaded,
      customMetadata: obj.metadata || {},
      text: () => Promise.resolve(obj.value),
      json: () => Promise.resolve(JSON.parse(obj.value) as unknown),
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(obj.value).buffer),
      blob: () => Promise.resolve(new Blob([obj.value])),
    } as R2ObjectBody);
  }

  put(
    key: string,
    value: string | ReadableStream | ArrayBuffer,
    options?: { customMetadata?: Record<string, string> },
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

    // Return only the properties actually used by tests
    return Promise.resolve({
      key: obj.key,
      size: obj.size,
      httpEtag: obj.httpEtag,
      uploaded: obj.uploaded,
      customMetadata: obj.metadata || {},
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

    // Return only the properties actually used by tests
    const objects = filtered.map((obj) => ({
      key: obj.key,
      size: obj.size,
      httpEtag: obj.httpEtag,
      uploaded: obj.uploaded,
      customMetadata: obj.metadata || {},
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
