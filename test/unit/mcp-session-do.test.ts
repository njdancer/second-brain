/**
 * MCP Session Durable Object tests
 */

import { MCPSessionDurableObject } from '../../src/mcp-session-do';
import { MockR2Bucket } from '../mocks/r2';
import { MockKVNamespace } from '../mocks/kv';

describe('MCPSessionDurableObject', () => {
  let mockState: any;
  let mockEnv: any;
  let durableObject: MCPSessionDurableObject;

  beforeEach(() => {
    // Mock DurableObjectState
    mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {
        get: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
        getAlarm: jest.fn().mockResolvedValue(null),
        setAlarm: jest.fn().mockResolvedValue(undefined),
        deleteAlarm: jest.fn().mockResolvedValue(undefined),
      },
      blockConcurrencyWhile: jest.fn((callback) => callback()),
      waitUntil: jest.fn(),
    };

    // Mock environment
    mockEnv = {
      SECOND_BRAIN_BUCKET: new MockR2Bucket() as any,
      RATE_LIMIT_KV: new MockKVNamespace() as any,
      OAUTH_KV: new MockKVNamespace() as any,
      ANALYTICS: {
        writeDataPoint: jest.fn(),
      } as any,
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-client-secret',
      GITHUB_ALLOWED_USER_ID: 'test-user-id',
      COOKIE_ENCRYPTION_KEY: 'test-encryption-key',
      AWS_ACCESS_KEY_ID: 'test-aws-key',
      AWS_SECRET_ACCESS_KEY: 'test-aws-secret',
      AWS_REGION: 'us-east-1',
      AWS_S3_BACKUP_BUCKET: 'test-backup-bucket',
    };

    durableObject = new MCPSessionDurableObject(mockState, mockEnv);
  });

  describe('constructor', () => {
    it('should initialize and schedule alarm', () => {
      expect(mockState.blockConcurrencyWhile).toHaveBeenCalled();
      expect(mockState.storage.getAlarm).toHaveBeenCalled();
    });
  });

  describe('fetch - missing props header', () => {
    it('should return 403 if x-mcp-props header is missing', async () => {
      const request = new Request('http://test.com/mcp', {
        method: 'POST',
        headers: {},
      });

      const response = await durableObject.fetch(request);
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body).toEqual({
        jsonrpc: '2.0',
        error: { code: -32003, message: 'Missing session props' },
        id: null,
      });
    });
  });

  describe('fetch - DELETE request', () => {
    it('should terminate session on DELETE', async () => {
      const props = {
        userId: 'test-user',
        githubLogin: 'testuser',
      };

      const request = new Request('http://test.com/mcp', {
        method: 'DELETE',
        headers: {
          'x-mcp-props': JSON.stringify(props),
        },
      });

      const response = await durableObject.fetch(request);
      expect(response.status).toBe(204);
    });
  });

  describe('fetch - initialize request without transport', () => {
    it('should return error if session not initialized for non-initialize request', async () => {
      const props = {
        userId: 'test-user',
        githubLogin: 'testuser',
      };

      // Non-initialize POST request
      const body = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      };

      const request = new Request('http://test.com/mcp', {
        method: 'POST',
        headers: {
          'x-mcp-props': JSON.stringify(props),
        },
        body: JSON.stringify(body),
      });

      const response = await durableObject.fetch(request);
      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.error.code).toBe(-32600);
      expect(responseBody.error.message).toContain('Session not initialized');
    });
  });

  describe('fetch - GET request without initialize', () => {
    it('should handle GET request', async () => {
      const props = {
        userId: 'test-user',
        githubLogin: 'testuser',
      };

      const request = new Request('http://test.com/mcp', {
        method: 'GET',
        headers: {
          'x-mcp-props': JSON.stringify(props),
          'mcp-session-id': 'test-session-id',
        },
      });

      const response = await durableObject.fetch(request);

      // Should return error because session not initialized
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.message).toContain('Session not initialized');
    });
  });

  describe('alarm', () => {
    it('should schedule next alarm', async () => {
      await durableObject.alarm();

      expect(mockState.storage.setAlarm).toHaveBeenCalled();
      const callArgs = mockState.storage.setAlarm.mock.calls[0][0];
      expect(callArgs).toBeGreaterThan(Date.now());
    });

    it('should cleanup timed out sessions', async () => {
      // Simulate old last activity
      (durableObject as any).lastActivity = Date.now() - 31 * 60 * 1000; // 31 minutes ago
      (durableObject as any).sessionId = 'old-session';
      (durableObject as any).transport = { some: 'transport' };

      await durableObject.alarm();

      // Check that cleanup was called (transport should be undefined)
      expect((durableObject as any).transport).toBeUndefined();
      expect((durableObject as any).sessionId).toBeUndefined();
    });

    it('should not cleanup active sessions', async () => {
      // Simulate recent activity
      (durableObject as any).lastActivity = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      (durableObject as any).sessionId = 'active-session';
      (durableObject as any).transport = { some: 'transport' };

      await durableObject.alarm();

      // Transport should still be there
      expect((durableObject as any).transport).toBeDefined();
      expect((durableObject as any).sessionId).toBe('active-session');
    });
  });

  describe('error handling', () => {
    it('should return 500 on internal error', async () => {
      const props = {
        userId: 'test-user',
        githubLogin: 'testuser',
      };

      // Create a request that will cause an error
      const request = new Request('http://test.com/mcp', {
        method: 'POST',
        headers: {
          'x-mcp-props': JSON.stringify(props),
        },
        // Invalid JSON body
        body: 'invalid json',
      });

      const response = await durableObject.fetch(request);
      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.error.code).toBe(-32603);
      expect(body.error.message).toBe('Internal error');
    });
  });

  describe('last activity tracking', () => {
    it('should update lastActivity on each request', async () => {
      const initialActivity = (durableObject as any).lastActivity;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const props = {
        userId: 'test-user',
        githubLogin: 'testuser',
      };

      const request = new Request('http://test.com/mcp', {
        method: 'DELETE',
        headers: {
          'x-mcp-props': JSON.stringify(props),
        },
      });

      await durableObject.fetch(request);

      const newActivity = (durableObject as any).lastActivity;
      expect(newActivity).toBeGreaterThan(initialActivity);
    });
  });
});
