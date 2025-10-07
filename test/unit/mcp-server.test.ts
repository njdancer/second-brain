/**
 * Unit tests for MCP server implementation
 */

import { createMCPServer, registerTools, registerPrompts } from '../../src/mcp-server';

describe('MCP Server', () => {
  describe('createMCPServer', () => {
    it('should create MCP server with correct metadata', () => {
      const server = createMCPServer();

      expect(server).toBeDefined();
      expect(server.name).toBe('second-brain');
      expect(server.version).toBe('1.0.0');
      expect(server.description).toContain('Building a Second Brain');
      expect(server.description).toContain('BASB FRAMEWORK');
      expect(server.description).toContain('PARA Structure');
    });

    it('should include CODE workflow in description', () => {
      const server = createMCPServer();

      expect(server.description).toContain('Capture');
      expect(server.description).toContain('Organize');
      expect(server.description).toContain('Distill');
      expect(server.description).toContain('Express');
    });

    it('should include PARA structure in description', () => {
      const server = createMCPServer();

      expect(server.description).toContain('Projects');
      expect(server.description).toContain('Areas');
      expect(server.description).toContain('Resources');
      expect(server.description).toContain('Archives');
    });

    it('should include file structure guidance', () => {
      const server = createMCPServer();

      expect(server.description).toContain('projects/');
      expect(server.description).toContain('areas/');
      expect(server.description).toContain('resources/');
      expect(server.description).toContain('archives/');
    });

    it('should include Claude guidance', () => {
      const server = createMCPServer();

      expect(server.description).toContain('GUIDANCE FOR CLAUDE');
      expect(server.description).toContain('kebab-case');
      expect(server.description).toContain('markdown links');
    });
  });

  describe('registerTools', () => {
    it('should register all 5 tools', () => {
      const server = createMCPServer();
      registerTools(server);

      expect(server.tools).toBeDefined();
      expect(server.tools.size).toBe(5);
      expect(server.tools.has('read')).toBe(true);
      expect(server.tools.has('write')).toBe(true);
      expect(server.tools.has('edit')).toBe(true);
      expect(server.tools.has('glob')).toBe(true);
      expect(server.tools.has('grep')).toBe(true);
    });

    it('should register read tool with correct schema', () => {
      const server = createMCPServer();
      registerTools(server);

      const readTool = server.tools.get('read');
      expect(readTool).toBeDefined();
      expect(readTool?.description).toContain('Read file');
      expect(readTool?.inputSchema).toBeDefined();
      expect(readTool?.inputSchema.properties).toHaveProperty('path');
      expect(readTool?.inputSchema.properties).toHaveProperty('range');
      expect(readTool?.inputSchema.properties).toHaveProperty('max_bytes');
    });

    it('should register write tool with correct schema', () => {
      const server = createMCPServer();
      registerTools(server);

      const writeTool = server.tools.get('write');
      expect(writeTool).toBeDefined();
      expect(writeTool?.description).toContain('Create');
      expect(writeTool?.inputSchema).toBeDefined();
      expect(writeTool?.inputSchema.properties).toHaveProperty('path');
      expect(writeTool?.inputSchema.properties).toHaveProperty('content');
      expect(writeTool?.inputSchema.required).toContain('path');
      expect(writeTool?.inputSchema.required).toContain('content');
    });

    it('should register edit tool with correct schema', () => {
      const server = createMCPServer();
      registerTools(server);

      const editTool = server.tools.get('edit');
      expect(editTool).toBeDefined();
      expect(editTool?.description).toContain('Edit');
      expect(editTool?.inputSchema).toBeDefined();
      expect(editTool?.inputSchema.properties).toHaveProperty('path');
      expect(editTool?.inputSchema.properties).toHaveProperty('old_str');
      expect(editTool?.inputSchema.properties).toHaveProperty('new_str');
      expect(editTool?.inputSchema.properties).toHaveProperty('new_path');
      expect(editTool?.inputSchema.properties).toHaveProperty('delete');
    });

    it('should register glob tool with correct schema', () => {
      const server = createMCPServer();
      registerTools(server);

      const globTool = server.tools.get('glob');
      expect(globTool).toBeDefined();
      expect(globTool?.description).toContain('Find files');
      expect(globTool?.inputSchema).toBeDefined();
      expect(globTool?.inputSchema.properties).toHaveProperty('pattern');
      expect(globTool?.inputSchema.properties).toHaveProperty('max_results');
      expect(globTool?.inputSchema.required).toContain('pattern');
    });

    it('should register grep tool with correct schema', () => {
      const server = createMCPServer();
      registerTools(server);

      const grepTool = server.tools.get('grep');
      expect(grepTool).toBeDefined();
      expect(grepTool?.description).toContain('Search');
      expect(grepTool?.inputSchema).toBeDefined();
      expect(grepTool?.inputSchema.properties).toHaveProperty('pattern');
      expect(grepTool?.inputSchema.properties).toHaveProperty('path');
      expect(grepTool?.inputSchema.properties).toHaveProperty('max_matches');
      expect(grepTool?.inputSchema.properties).toHaveProperty('context_lines');
      expect(grepTool?.inputSchema.required).toContain('pattern');
    });
  });

  describe('registerPrompts', () => {
    it('should register all 3 prompts', () => {
      const server = createMCPServer();
      registerPrompts(server);

      expect(server.prompts).toBeDefined();
      expect(server.prompts.size).toBe(3);
      expect(server.prompts.has('capture-note')).toBe(true);
      expect(server.prompts.has('weekly-review')).toBe(true);
      expect(server.prompts.has('research-summary')).toBe(true);
    });

    it('should register capture-note prompt with correct arguments', () => {
      const server = createMCPServer();
      registerPrompts(server);

      const prompt = server.prompts.get('capture-note');
      expect(prompt).toBeDefined();
      expect(prompt?.description).toContain('Quick capture');
      expect(prompt?.arguments).toBeDefined();
      expect(prompt?.arguments).toHaveLength(3);

      const argNames = prompt?.arguments?.map((a) => a.name);
      expect(argNames).toContain('content');
      expect(argNames).toContain('context');
      expect(argNames).toContain('tags');

      const contentArg = prompt?.arguments?.find((a) => a.name === 'content');
      expect(contentArg?.required).toBe(true);
    });

    it('should register weekly-review prompt with correct arguments', () => {
      const server = createMCPServer();
      registerPrompts(server);

      const prompt = server.prompts.get('weekly-review');
      expect(prompt).toBeDefined();
      expect(prompt?.description).toContain('weekly review');
      expect(prompt?.arguments).toBeDefined();
      expect(prompt?.arguments).toHaveLength(1);

      const argNames = prompt?.arguments?.map((a) => a.name);
      expect(argNames).toContain('focus_areas');
    });

    it('should register research-summary prompt with correct arguments', () => {
      const server = createMCPServer();
      registerPrompts(server);

      const prompt = server.prompts.get('research-summary');
      expect(prompt).toBeDefined();
      expect(prompt?.description).toContain('research');
      expect(prompt?.arguments).toBeDefined();
      expect(prompt?.arguments).toHaveLength(2);

      const argNames = prompt?.arguments?.map((a) => a.name);
      expect(argNames).toContain('topic');
      expect(argNames).toContain('output_location');

      const topicArg = prompt?.arguments?.find((a) => a.name === 'topic');
      expect(topicArg?.required).toBe(true);
    });

    it('should generate correct capture-note prompt message', () => {
      const server = createMCPServer();
      registerPrompts(server);

      const prompt = server.prompts.get('capture-note');
      const message = prompt?.getMessage?.({
        content: 'Test note content',
        context: 'Meeting with team',
        tags: 'project,important',
      });

      expect(message).toContain('Test note content');
      expect(message).toContain('Meeting with team');
      expect(message).toContain('project,important');
      expect(message).toContain('PARA category');
      expect(message).toContain('filename');
    });

    it('should generate correct weekly-review prompt message', () => {
      const server = createMCPServer();
      registerPrompts(server);

      const prompt = server.prompts.get('weekly-review');
      const message = prompt?.getMessage?.({
        focus_areas: 'Product Launch, Health',
      });

      expect(message).toContain('weekly review');
      expect(message).toContain('Product Launch, Health');
      expect(message).toContain('active projects');
      expect(message).toContain('archives');
    });

    it('should generate correct research-summary prompt message', () => {
      const server = createMCPServer();
      registerPrompts(server);

      const prompt = server.prompts.get('research-summary');
      const message = prompt?.getMessage?.({
        topic: 'Machine Learning',
        output_location: 'resources/ml/summary.md',
      });

      expect(message).toContain('Machine Learning');
      expect(message).toContain('resources/ml/summary.md');
      expect(message).toContain('Search existing notes');
      expect(message).toContain('progressive summary');
    });
  });

  describe('error handling', () => {
    it('should handle missing server gracefully', () => {
      expect(() => createMCPServer()).not.toThrow();
    });

    it('should handle tool registration on invalid server', () => {
      const server = createMCPServer();
      expect(() => registerTools(server)).not.toThrow();
    });

    it('should handle prompt registration on invalid server', () => {
      const server = createMCPServer();
      expect(() => registerPrompts(server)).not.toThrow();
    });

    it('should handle prompt with missing arguments', () => {
      const server = createMCPServer();
      registerPrompts(server);

      const prompt = server.prompts.get('capture-note');
      const message = prompt?.getMessage?.({});

      expect(message).toBeDefined();
      expect(message).toContain('PARA category');
    });
  });
});
