/**
 * Mock R2 bucket for testing
 */

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

  constructor() {}

  async get(key: string): Promise<R2ObjectBody | null> {
    if (this.shouldFail) {
      throw new Error('R2 operation failed');
    }

    const obj = this.objects.get(key);
    if (!obj) {
      return null;
    }

    return {
      key: obj.key,
      body: obj.value,
      bodyUsed: false,
      size: obj.size,
      httpEtag: obj.httpEtag,
      uploaded: obj.uploaded,
      httpMetadata: {},
      customMetadata: obj.metadata || {},
      range: undefined,
      checksums: {},
      text: async () => obj.value,
      json: async () => JSON.parse(obj.value),
      arrayBuffer: async () => new TextEncoder().encode(obj.value).buffer,
      blob: async () => new Blob([obj.value]),
    } as R2ObjectBody;
  }

  async put(
    key: string,
    value: string | ReadableStream | ArrayBuffer,
    options?: { customMetadata?: Record<string, string> }
  ): Promise<R2Object> {
    if (this.shouldFail && this.failureCount < 3) {
      this.failureCount++;
      throw new Error('R2 operation failed');
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

    return {
      key: obj.key,
      size: obj.size,
      httpEtag: obj.httpEtag,
      uploaded: obj.uploaded,
      httpMetadata: {},
      customMetadata: obj.metadata || {},
      range: undefined,
      checksums: {},
    } as R2Object;
  }

  async delete(keys: string | string[]): Promise<void> {
    if (this.shouldFail) {
      throw new Error('R2 operation failed');
    }

    const keyArray = Array.isArray(keys) ? keys : [keys];
    for (const key of keyArray) {
      this.objects.delete(key);
    }
  }

  async list(options?: {
    prefix?: string;
    delimiter?: string;
    limit?: number;
    cursor?: string;
  }): Promise<R2Objects> {
    if (this.shouldFail) {
      throw new Error('R2 operation failed');
    }

    let filtered = Array.from(this.objects.values());

    if (options?.prefix) {
      filtered = filtered.filter((obj) => obj.key.startsWith(options.prefix!));
    }

    const objects = filtered.map((obj) => ({
      key: obj.key,
      size: obj.size,
      httpEtag: obj.httpEtag,
      uploaded: obj.uploaded,
      httpMetadata: {},
      customMetadata: obj.metadata || {},
      range: undefined,
      checksums: {},
    })) as R2Object[];

    return {
      objects,
      truncated: false,
      delimitedPrefixes: [],
    } as R2Objects;
  }

  // Test helpers
  setFailure(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
    this.failureCount = 0;
  }

  clear(): void {
    this.objects.clear();
    this.shouldFail = false;
    this.failureCount = 0;
  }

  getSize(): number {
    return Array.from(this.objects.values()).reduce((sum, obj) => sum + obj.size, 0);
  }

  getCount(): number {
    return this.objects.size;
  }
}
