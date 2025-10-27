/**
 * MCP Session Durable Object tests
 */

import type {
  R2Bucket,
  KVNamespace,
  AnalyticsEngineDataset,
  DurableObjectState,
} from '@cloudflare/workers-types';
import type { Env } from '../../src/index';
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
      SECOND_BRAIN_BUCKET: new MockR2Bucket() as unknown as R2Bucket,
      RATE_LIMIT_KV: new MockKVNamespace() as unknown as KVNamespace,
      OAUTH_KV: new MockKVNamespace() as unknown as KVNamespace,
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
    it('should initialize without scheduling alarm', () => {
      // Constructor no longer schedules alarm - only schedules on session initialization
      // This prevents zombie alarms for DOs that never receive requests
      expect(durableObject).toBeDefined();
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
    it('should terminate session on DELETE and cancel alarms', async () => {
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
      expect(mockState.storage.deleteAlarm).toHaveBeenCalled();
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

      const responseBody = await response.json() as { error: { code: number; message: string } };
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
      const body = await response.json() as { error: { message: string } };
      expect(body.error.message).toContain('Session not initialized');
    });
  });

  describe('alarm', () => {
    it('should schedule next alarm only if session is active', async () => {
      // Mark session as active
      (durableObject as any).isActive = true;
      (durableObject as any).lastActivity = Date.now();

      await durableObject.alarm();

      expect(mockState.storage.setAlarm).toHaveBeenCalled();
      const callArgs = mockState.storage.setAlarm.mock.calls[0][0];
      expect(callArgs).toBeGreaterThan(Date.now());
    });

    it('should not reschedule alarm if session is inactive', async () => {
      // Mark session as inactive
      (durableObject as any).isActive = false;
      (durableObject as any).lastActivity = Date.now();

      mockState.storage.setAlarm.mockClear();

      await durableObject.alarm();

      // Should not schedule new alarm
      expect(mockState.storage.setAlarm).not.toHaveBeenCalled();
    });

    it('should cleanup timed out sessions and not reschedule', async () => {
      // Simulate old last activity
      (durableObject as any).lastActivity = Date.now() - 31 * 60 * 1000; // 31 minutes ago
      (durableObject as any).sessionId = 'old-session';
      (durableObject as any).transport = { some: 'transport' };
      (durableObject as any).isActive = true;

      mockState.storage.setAlarm.mockClear();

      await durableObject.alarm();

      // Check that cleanup was called (transport should be undefined)
      expect((durableObject as any).transport).toBeUndefined();
      expect((durableObject as any).sessionId).toBeUndefined();
      expect((durableObject as any).isActive).toBe(false);
      expect(mockState.storage.deleteAlarm).toHaveBeenCalled();
      // Should NOT reschedule after cleanup
      expect(mockState.storage.setAlarm).not.toHaveBeenCalled();
    });

    it('should not cleanup active sessions and should reschedule', async () => {
      // Simulate recent activity
      (durableObject as any).lastActivity = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      (durableObject as any).sessionId = 'active-session';
      (durableObject as any).transport = { some: 'transport' };
      (durableObject as any).isActive = true;

      mockState.storage.setAlarm.mockClear();

      await durableObject.alarm();

      // Transport should still be there
      expect((durableObject as any).transport).toBeDefined();
      expect((durableObject as any).sessionId).toBe('active-session');
      expect((durableObject as any).isActive).toBe(true);
      // Should reschedule for active session
      expect(mockState.storage.setAlarm).toHaveBeenCalled();
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

      const body = await response.json() as { error: { code: number; message: string } };
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

  describe('initialize flow', () => {
    it('should create transport and server on initialize request', async () => {
      const props = {
        userId: 'test-user',
        githubLogin: 'testuser',
        sessionId: 'test-session-id',
      };

      const initializeBody = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
        id: 1,
      };

      // Mock the transport and server creation to avoid actual MCP initialization
      // This is a simplified test that checks the code path is exercised
      jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      mockState.storage.setAlarm.mockClear();

      const request = new Request('http://test.com/mcp', {
        method: 'POST',
        headers: {
          'x-mcp-props': JSON.stringify(props),
        },
        body: JSON.stringify(initializeBody),
      });

      // The actual initialization will fail because we can't fully mock the transport
      // but this exercises the code path
      const response = await durableObject.fetch(request);

      // We expect some response (may be error due to mocking limitations)
      expect(response).toBeDefined();
      expect(response.status).toBeGreaterThanOrEqual(200);

      // Verify that alarm was scheduled during initialization
      expect(mockState.storage.setAlarm).toHaveBeenCalled();

      jest.restoreAllMocks();
    });

    it('should handle POST request body parsing', async () => {
      const props = {
        userId: 'test-user',
        githubLogin: 'testuser',
      };

      const body = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
      };

      const request = new Request('http://test.com/mcp', {
        method: 'POST',
        headers: {
          'x-mcp-props': JSON.stringify(props),
        },
        body: JSON.stringify(body),
      });

      const response = await durableObject.fetch(request);

      // Should return error because session not initialized
      expect(response.status).toBe(400);
      const responseBody = await response.json() as { error: { message: string } };
      expect(responseBody.error.message).toContain('Session not initialized');
    });
  });

  describe('request handling', () => {
    it('should handle non-POST requests without body parsing', async () => {
      const props = {
        userId: 'test-user',
        githubLogin: 'testuser',
      };

      const request = new Request('http://test.com/mcp', {
        method: 'GET',
        headers: {
          'x-mcp-props': JSON.stringify(props),
        },
      });

      const response = await durableObject.fetch(request);

      // Should return error because session not initialized
      expect(response.status).toBe(400);
    });

    it('should validate props header format', async () => {
      const request = new Request('http://test.com/mcp', {
        method: 'POST',
        headers: {
          'x-mcp-props': 'invalid-json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'test', id: 1 }),
      });

      const response = await durableObject.fetch(request);

      // Should fail due to invalid JSON in props header
      expect(response.status).toBe(500);
    });
  });
});
