#!/usr/bin/env node

/**
 * MCP Client Test Script
 *
 * Comprehensive test client that simulates Claude's MCP connection flow
 * to debug and verify server behavior.
 *
 * Usage:
 *   pnpm run test:mcp:quick   # Skip OAuth, use pre-configured token
 *   pnpm run test:mcp:full    # Full flow with OAuth
 *   pnpm run test:mcp:scenario -- "scenario name"
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import fetch from 'node-fetch';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.test' });

/**
 * Test result for a single check
 */
interface CheckResult {
  name: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  error?: string;
}

/**
 * Test result for a scenario
 */
interface TestResult {
  scenario: string;
  passed: boolean;
  checks: CheckResult[];
  error?: string;
  responseBody?: any;
  duration?: number;
}

/**
 * Test scenario definition
 */
interface Scenario {
  name: string;
  requiresOAuth?: boolean;
  run: (client: MCPTestClient) => Promise<TestResult>;
}

/**
 * Configuration for the test client
 */
interface TestConfig {
  serverUrl: string;
  authToken?: string;
  userId?: string;
}

/**
 * MCP Test Client
 *
 * Simulates Claude's MCP connection flow to test server behavior
 */
class MCPTestClient {
  private config: TestConfig;
  private sessionId?: string;
  private mcpClient?: Client;
  private transport?: StreamableHTTPClientTransport;

  constructor(config: TestConfig) {
    this.config = config;
  }

  /**
   * Scenario 1: Discovery (Unauthenticated Initialize)
   */
  async testDiscovery(): Promise<TestResult> {
    const startTime = Date.now();
    const checks: CheckResult[] = [];

    try {
      // Make initialize request WITHOUT Authorization header
      const response = await this.makeRawRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      }, false); // No auth

      // Check response status
      checks.push({
        name: 'Response status',
        passed: response.status === 200,
        actual: response.status,
        expected: 200,
      });

      const body = await response.json() as any;

      // Check protocol version
      checks.push({
        name: 'Protocol version',
        passed: body.result?.protocolVersion === '2024-11-05',
        actual: body.result?.protocolVersion,
        expected: '2024-11-05',
      });

      // Check server info
      checks.push({
        name: 'Server name',
        passed: body.result?.serverInfo?.name === 'second-brain-mcp',
        actual: body.result?.serverInfo?.name,
        expected: 'second-brain-mcp',
      });

      // Check OAuth instructions present
      checks.push({
        name: 'OAuth instructions present',
        passed: typeof body.result?.instructions === 'string' && body.result.instructions.length > 0,
        actual: body.result?.instructions ? 'present' : 'missing',
        expected: 'present',
      });

      // Check no session ID (since unauthenticated)
      checks.push({
        name: 'No session ID for unauthenticated',
        passed: !body.result?.sessionId,
        actual: body.result?.sessionId ? 'present' : 'absent',
        expected: 'absent',
      });

      const passed = checks.every(c => c.passed);

      return {
        scenario: 'Discovery (unauthenticated initialize)',
        passed,
        checks,
        responseBody: body,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        scenario: 'Discovery (unauthenticated initialize)',
        passed: false,
        checks,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Scenario 2: OAuth Authorization URL Generation
   */
  async testOAuthUrl(): Promise<TestResult> {
    const startTime = Date.now();
    const checks: CheckResult[] = [];

    try {
      const response = await fetch(`${this.config.serverUrl}/oauth/authorize`, {
        method: 'GET',
        redirect: 'manual', // Don't follow redirects
      });

      // Check for redirect
      checks.push({
        name: 'Response status (302 redirect)',
        passed: response.status === 302,
        actual: response.status,
        expected: 302,
      });

      const location = response.headers.get('location');

      // Check Location header exists
      checks.push({
        name: 'Location header present',
        passed: !!location,
        actual: location ? 'present' : 'missing',
        expected: 'present',
      });

      if (location) {
        // Check GitHub OAuth URL
        checks.push({
          name: 'GitHub OAuth URL',
          passed: location.includes('github.com/login/oauth/authorize'),
          actual: location.substring(0, 50) + '...',
          expected: 'github.com/login/oauth/authorize',
        });

        // Parse query params
        const url = new URL(location);

        checks.push({
          name: 'client_id param',
          passed: url.searchParams.has('client_id'),
          actual: url.searchParams.has('client_id') ? 'present' : 'missing',
          expected: 'present',
        });

        checks.push({
          name: 'redirect_uri param',
          passed: url.searchParams.has('redirect_uri'),
          actual: url.searchParams.get('redirect_uri'),
          expected: 'present',
        });

        checks.push({
          name: 'scope param',
          passed: url.searchParams.get('scope') === 'read:user',
          actual: url.searchParams.get('scope'),
          expected: 'read:user',
        });

        checks.push({
          name: 'state param',
          passed: url.searchParams.has('state'),
          actual: url.searchParams.has('state') ? 'present' : 'missing',
          expected: 'present',
        });
      }

      const passed = checks.every(c => c.passed);

      return {
        scenario: 'OAuth authorization URL generation',
        passed,
        checks,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        scenario: 'OAuth authorization URL generation',
        passed: false,
        checks,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Scenario 4: Authenticated Initialize
   */
  async testAuthenticatedInit(): Promise<TestResult> {
    const startTime = Date.now();
    const checks: CheckResult[] = [];

    try {
      if (!this.config.authToken) {
        throw new Error('No auth token configured. Set GITHUB_OAUTH_TOKEN in .env.test');
      }

      const response = await this.makeRawRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      }, true);

      checks.push({
        name: 'Response status',
        passed: response.status === 200,
        actual: response.status,
        expected: 200,
      });

      const body = await response.json() as any;

      // Check protocol version
      checks.push({
        name: 'Protocol version',
        passed: body.result?.protocolVersion === '2024-11-05',
        actual: body.result?.protocolVersion,
        expected: '2024-11-05',
      });

      // Check capabilities
      checks.push({
        name: 'Tools capability present',
        passed: !!body.result?.capabilities?.tools,
        actual: body.result?.capabilities?.tools ? 'present' : 'missing',
        expected: 'present',
      });

      checks.push({
        name: 'Prompts capability present',
        passed: !!body.result?.capabilities?.prompts,
        actual: body.result?.capabilities?.prompts ? 'present' : 'missing',
        expected: 'present',
      });

      // Check no OAuth instructions (since authenticated)
      checks.push({
        name: 'No OAuth instructions for authenticated',
        passed: !body.result?.instructions,
        actual: body.result?.instructions ? 'present' : 'absent',
        expected: 'absent',
      });

      const passed = checks.every(c => c.passed);

      return {
        scenario: 'Authenticated initialize',
        passed,
        checks,
        responseBody: body,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        scenario: 'Authenticated initialize',
        passed: false,
        checks,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Scenario 5: Tools List Request
   */
  async testToolsList(): Promise<TestResult> {
    const startTime = Date.now();
    const checks: CheckResult[] = [];

    try {
      if (!this.config.authToken) {
        throw new Error('No auth token configured');
      }

      const response = await this.makeRawRequest('tools/list', {}, true);

      checks.push({
        name: 'Response status',
        passed: response.status === 200,
        actual: response.status,
        expected: 200,
      });

      const body = await response.json() as any;

      const tools = body.result?.tools || [];

      // Check tool count
      checks.push({
        name: 'Tool count',
        passed: tools.length === 5,
        actual: tools.length,
        expected: 5,
      });

      // Check for each tool
      const expectedTools = ['read', 'write', 'edit', 'glob', 'grep'];
      for (const toolName of expectedTools) {
        const tool = tools.find((t: any) => t.name === toolName);
        checks.push({
          name: `Tool: ${toolName}`,
          passed: !!tool,
          actual: tool ? 'present' : 'missing',
          expected: 'present',
        });

        if (tool) {
          checks.push({
            name: `${toolName} has inputSchema`,
            passed: !!tool.inputSchema,
            actual: tool.inputSchema ? 'present' : 'missing',
            expected: 'present',
          });
        }
      }

      const passed = checks.every(c => c.passed);

      return {
        scenario: 'Tools list request',
        passed,
        checks,
        responseBody: body,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        scenario: 'Tools list request',
        passed: false,
        checks,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Scenario 6: Tool Call - Write (Bootstrap Test)
   */
  async testToolCallWrite(): Promise<TestResult> {
    const startTime = Date.now();
    const checks: CheckResult[] = [];

    try {
      if (!this.config.authToken) {
        throw new Error('No auth token configured');
      }

      const response = await this.makeRawRequest('tools/call', {
        name: 'write',
        arguments: {
          path: '/test-file.md',
          content: '# Test File\n\nThis is a test file created by the MCP test client.',
        },
      }, true);

      checks.push({
        name: 'Response status',
        passed: response.status === 200,
        actual: response.status,
        expected: 200,
      });

      const body = await response.json() as any;

      checks.push({
        name: 'Result present',
        passed: !!body.result,
        actual: body.result ? 'present' : 'missing',
        expected: 'present',
      });

      checks.push({
        name: 'Content in result',
        passed: Array.isArray(body.result?.content) && body.result.content.length > 0,
        actual: Array.isArray(body.result?.content) ? `${body.result.content.length} items` : 'not an array',
        expected: 'array with items',
      });

      const passed = checks.every(c => c.passed);

      return {
        scenario: 'Tool call - write (bootstrap test)',
        passed,
        checks,
        responseBody: body,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        scenario: 'Tool call - write (bootstrap test)',
        passed: false,
        checks,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Scenario 7: Tool Call - Read
   */
  async testToolCallRead(): Promise<TestResult> {
    const startTime = Date.now();
    const checks: CheckResult[] = [];

    try {
      if (!this.config.authToken) {
        throw new Error('No auth token configured');
      }

      const response = await this.makeRawRequest('tools/call', {
        name: 'read',
        arguments: {
          path: '/README.md',
        },
      }, true);

      checks.push({
        name: 'Response status',
        passed: response.status === 200,
        actual: response.status,
        expected: 200,
      });

      const body = await response.json() as any;

      checks.push({
        name: 'Result present',
        passed: !!body.result,
        actual: body.result ? 'present' : 'missing',
        expected: 'present',
      });

      checks.push({
        name: 'Content in result',
        passed: Array.isArray(body.result?.content) && body.result.content.length > 0,
        actual: Array.isArray(body.result?.content) ? `${body.result.content.length} items` : 'not an array',
        expected: 'array with items',
      });

      // Check if content includes PARA (bootstrap content)
      const content = body.result?.content?.[0]?.text || '';
      checks.push({
        name: 'Bootstrap content (PARA)',
        passed: content.includes('PARA'),
        actual: content.includes('PARA') ? 'found' : 'not found',
        expected: 'found',
      });

      const passed = checks.every(c => c.passed);

      return {
        scenario: 'Tool call - read',
        passed,
        checks,
        responseBody: body,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        scenario: 'Tool call - read',
        passed: false,
        checks,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Scenario 8: Tool Call - Glob
   */
  async testToolCallGlob(): Promise<TestResult> {
    const startTime = Date.now();
    const checks: CheckResult[] = [];

    try {
      if (!this.config.authToken) {
        throw new Error('No auth token configured');
      }

      const response = await this.makeRawRequest('tools/call', {
        name: 'glob',
        arguments: {
          pattern: '**/*.md',
        },
      }, true);

      checks.push({
        name: 'Response status',
        passed: response.status === 200,
        actual: response.status,
        expected: 200,
      });

      const body = await response.json() as any;

      checks.push({
        name: 'Result present',
        passed: !!body.result,
        actual: body.result ? 'present' : 'missing',
        expected: 'present',
      });

      const content = body.result?.content?.[0]?.text || '';

      // Should find bootstrap files
      checks.push({
        name: 'Bootstrap files found',
        passed: content.includes('README.md'),
        actual: content.includes('README.md') ? 'found' : 'not found',
        expected: 'found',
      });

      const passed = checks.every(c => c.passed);

      return {
        scenario: 'Tool call - glob',
        passed,
        checks,
        responseBody: body,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        scenario: 'Tool call - glob',
        passed: false,
        checks,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Scenario 11: Prompts List
   */
  async testPromptsList(): Promise<TestResult> {
    const startTime = Date.now();
    const checks: CheckResult[] = [];

    try {
      if (!this.config.authToken) {
        throw new Error('No auth token configured');
      }

      const response = await this.makeRawRequest('prompts/list', {}, true);

      checks.push({
        name: 'Response status',
        passed: response.status === 200,
        actual: response.status,
        expected: 200,
      });

      const body = await response.json() as any;

      const prompts = body.result?.prompts || [];

      // Check prompt count
      checks.push({
        name: 'Prompt count',
        passed: prompts.length === 3,
        actual: prompts.length,
        expected: 3,
      });

      // Check for each prompt
      const expectedPrompts = ['capture-note', 'weekly-review', 'research-summary'];
      for (const promptName of expectedPrompts) {
        const prompt = prompts.find((p: any) => p.name === promptName);
        checks.push({
          name: `Prompt: ${promptName}`,
          passed: !!prompt,
          actual: prompt ? 'present' : 'missing',
          expected: 'present',
        });
      }

      const passed = checks.every(c => c.passed);

      return {
        scenario: 'Prompts list',
        passed,
        checks,
        responseBody: body,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        scenario: 'Prompts list',
        passed: false,
        checks,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Scenario 15: Invalid Token Handling
   */
  async testInvalidToken(): Promise<TestResult> {
    const startTime = Date.now();
    const checks: CheckResult[] = [];

    try {
      // Temporarily set invalid token
      const originalToken = this.config.authToken;
      this.config.authToken = 'invalid-token-12345';

      const response = await this.makeRawRequest('tools/list', {}, true);

      // Restore original token
      this.config.authToken = originalToken;

      // Should return 401
      checks.push({
        name: 'Response status (401 Unauthorized)',
        passed: response.status === 401,
        actual: response.status,
        expected: 401,
      });

      const body = await response.json() as any;

      checks.push({
        name: 'Error message present',
        passed: !!body.error,
        actual: body.error ? 'present' : 'missing',
        expected: 'present',
      });

      const passed = checks.every(c => c.passed);

      return {
        scenario: 'Invalid token handling',
        passed,
        checks,
        responseBody: body,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        scenario: 'Invalid token handling',
        passed: false,
        checks,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Helper: Make raw JSON-RPC request to MCP endpoint
   */
  private async makeRawRequest(method: string, params: any, useAuth: boolean): Promise<any> {
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (useAuth && this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    return fetch(`${this.config.serverUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });
  }

  /**
   * Log test result with colored output
   */
  logResult(result: TestResult): void {
    const icon = result.passed ? chalk.green('✅') : chalk.red('❌');
    console.log(`\n${icon} ${result.passed ? 'PASS' : 'FAIL'}: ${result.scenario} ${chalk.gray(`(${result.duration}ms)`)}`);

    for (const check of result.checks) {
      const checkIcon = check.passed ? chalk.green('  ✅') : chalk.red('  ❌');
      let line = `${checkIcon} ${check.name}`;

      if (!check.passed) {
        if (check.expected !== undefined) {
          line += chalk.gray(` - expected: ${JSON.stringify(check.expected)}, actual: ${JSON.stringify(check.actual)}`);
        }
        if (check.error) {
          line += chalk.red(` - ${check.error}`);
        }
      }

      console.log(line);
    }

    if (result.error) {
      console.log(chalk.red(`  Error: ${result.error}`));
    }

    if (!result.passed && result.responseBody) {
      console.log(chalk.gray('  Response body:'), JSON.stringify(result.responseBody, null, 2).split('\n').slice(0, 10).join('\n'));
    }
  }
}

/**
 * Define all test scenarios
 */
const scenarios: Scenario[] = [
  {
    name: 'Discovery (unauthenticated)',
    requiresOAuth: false,
    run: async (client) => await client.testDiscovery(),
  },
  {
    name: 'OAuth authorization URL',
    requiresOAuth: true,
    run: async (client) => await client.testOAuthUrl(),
  },
  {
    name: 'Authenticated initialize',
    requiresOAuth: false,
    run: async (client) => await client.testAuthenticatedInit(),
  },
  {
    name: 'Tools list',
    requiresOAuth: false,
    run: async (client) => await client.testToolsList(),
  },
  {
    name: 'Tool call - write',
    requiresOAuth: false,
    run: async (client) => await client.testToolCallWrite(),
  },
  {
    name: 'Tool call - read',
    requiresOAuth: false,
    run: async (client) => await client.testToolCallRead(),
  },
  {
    name: 'Tool call - glob',
    requiresOAuth: false,
    run: async (client) => await client.testToolCallGlob(),
  },
  {
    name: 'Prompts list',
    requiresOAuth: false,
    run: async (client) => await client.testPromptsList(),
  },
  {
    name: 'Invalid token',
    requiresOAuth: false,
    run: async (client) => await client.testInvalidToken(),
  },
];

/**
 * Main test runner
 */
async function runTests(mode: 'quick' | 'full' | 'scenario', scenarioName?: string) {
  console.log(chalk.bold.blue('\n🧪 MCP Client Test Suite\n'));
  console.log(chalk.gray('Testing server:'), process.env.MCP_SERVER_URL || 'https://second-brain-mcp.nick-01a.workers.dev');
  console.log(chalk.gray('Mode:'), mode);
  console.log(chalk.gray('='.repeat(60)));

  const config: TestConfig = {
    serverUrl: process.env.MCP_SERVER_URL || 'https://second-brain-mcp.nick-01a.workers.dev',
    authToken: process.env.GITHUB_OAUTH_TOKEN,
    userId: process.env.TEST_USER_ID,
  };

  const client = new MCPTestClient(config);

  // Filter scenarios based on mode
  let toRun: Scenario[];
  if (mode === 'scenario' && scenarioName) {
    toRun = scenarios.filter(s => s.name.toLowerCase().includes(scenarioName.toLowerCase()));
    if (toRun.length === 0) {
      console.error(chalk.red(`\n❌ No scenario found matching: ${scenarioName}`));
      console.log(chalk.gray('\nAvailable scenarios:'));
      scenarios.forEach(s => console.log(chalk.gray(`  - ${s.name}`)));
      process.exit(1);
    }
  } else if (mode === 'quick') {
    toRun = scenarios.filter(s => !s.requiresOAuth);
  } else {
    toRun = scenarios;
  }

  const results: TestResult[] = [];

  for (const scenario of toRun) {
    try {
      const result = await scenario.run(client);
      results.push(result);
      client.logResult(result);
    } catch (error: any) {
      const result: TestResult = {
        scenario: scenario.name,
        passed: false,
        checks: [],
        error: error.message,
      };
      results.push(result);
      client.logResult(result);
    }
  }

  // Print summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  console.log(chalk.gray('\n' + '='.repeat(60)));
  console.log(chalk.bold('\nSummary:'));
  console.log(chalk.green(`  ✅ ${passed} passed`));
  console.log(chalk.red(`  ❌ ${failed} failed`));
  console.log(chalk.gray(`  ⏱️  Total time: ${totalDuration}ms`));

  if (failed > 0) {
    console.log(chalk.red('\n⚠️  Failed scenarios:'));
    results.filter(r => !r.passed).forEach(r => {
      console.log(chalk.red(`  - ${r.scenario}`));
    });
    process.exit(1);
  } else {
    console.log(chalk.green('\n✅ All tests passed!'));
    process.exit(0);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0] || 'quick';
const scenarioName = args[1];

if (!['quick', 'full', 'scenario'].includes(mode)) {
  console.error(chalk.red(`Invalid mode: ${mode}`));
  console.log(chalk.gray('Valid modes: quick, full, scenario'));
  process.exit(1);
}

runTests(mode as 'quick' | 'full' | 'scenario', scenarioName);
