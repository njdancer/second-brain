/**
 * Mock for cloudflare:workers module
 */

export class DurableObject {
  ctx: any;
  env: any;

  constructor(ctx: any, env: any) {
    this.ctx = ctx;
    this.env = env;
  }

  async alarm(): Promise<void> {
    // Mock implementation
  }

  async fetch(request: Request): Promise<Response> {
    return new Response('Mock response');
  }
}
