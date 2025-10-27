/**
 * Mock KV namespace for testing
 */

export interface MockKVEntry {
  value: string;
  expiration?: number;
}

export class MockKVNamespace {
  private store: Map<string, MockKVEntry> = new Map();

  get(key: string, _options?: { type?: 'text' | 'json' }): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }

    // Check expiration
    if (entry.expiration && entry.expiration < Date.now() / 1000) {
      this.store.delete(key);
      return Promise.resolve(null);
    }

    return Promise.resolve(entry.value);
  }

  put(
    key: string,
    value: string,
    options?: { expiration?: number; expirationTtl?: number },
  ): Promise<void> {
    const expiration =
      options?.expiration ||
      (options?.expirationTtl ? Math.floor(Date.now() / 1000) + options.expirationTtl : undefined);

    this.store.set(key, { value, expiration });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    const keys = Array.from(this.store.keys());
    const filtered = options?.prefix ? keys.filter((key) => key.startsWith(options.prefix!)) : keys;

    return Promise.resolve({
      keys: filtered.map((name) => ({ name })),
    });
  }

  // Test helpers
  clear(): void {
    this.store.clear();
  }

  getSize(): number {
    return this.store.size;
  }
}
