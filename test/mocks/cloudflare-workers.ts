/**
 * Mock for cloudflare:workers module
 */

export class DurableObject {
  ctx: unknown;
  env: unknown;

  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }

  alarm(): Promise<void> {
    // Mock implementation
    return Promise.resolve();
  }

  fetch(_request: Request): Promise<Response> {
    return Promise.resolve(new Response('Mock response'));
  }
}
