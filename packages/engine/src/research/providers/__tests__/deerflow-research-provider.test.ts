import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeerflowResearchProvider } from '../deerflow-research-provider.js';
import { ResearchProviderUnavailableError } from '../../errors/research-provider-unavailable-error.js';

describe('DeerflowResearchProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MCP Execution via executeTool', () => {
    it('should call deerflow_research MCP tool with default mode "pro"', async () => {
      const mockExecuteTool = vi.fn().mockResolvedValue(`
# Research Findings
According to [React Docs](https://react.dev), React is a UI library.
      `);

      const provider = new DeerflowResearchProvider({}, mockExecuteTool);
      const sources = await provider.search({ term: 'react architecture' });

      expect(mockExecuteTool).toHaveBeenCalledTimes(1);
      expect(mockExecuteTool).toHaveBeenCalledWith('deerflow_research', {
        topic: 'react architecture',
        mode: 'pro'
      });
      expect(sources).toHaveLength(1);
      expect(sources[0]).toEqual({
        url: 'https://react.dev',
        title: 'React Docs',
        type: 'deerflow-research',
        content: expect.stringContaining('According to [React Docs](https://react.dev)')
      });
    });

    it('should pass custom mode from options to deerflow_research', async () => {
      const mockExecuteTool = vi.fn().mockResolvedValue('Nothing here');
      const provider = new DeerflowResearchProvider({ mode: 'ultra' }, mockExecuteTool);

      await provider.search({ term: 'distributed systems' });

      expect(mockExecuteTool).toHaveBeenCalledWith('deerflow_research', {
        topic: 'distributed systems',
        mode: 'ultra'
      });
    });

    it('should support executeTool passed inside options', async () => {
      const mockExecuteTool = vi.fn().mockResolvedValue('[Doc](https://example.com)');
      const provider = new DeerflowResearchProvider({ executeTool: mockExecuteTool, mode: 'flash' });

      const sources = await provider.search({ term: 'testing' });

      expect(mockExecuteTool).toHaveBeenCalledWith('deerflow_research', {
        topic: 'testing',
        mode: 'flash'
      });
      expect(sources).toHaveLength(1);
      expect(sources[0].url).toBe('https://example.com');
    });

    it('should handle tool executor object with .execute method', async () => {
      const mockExecutor = {
        execute: vi.fn().mockResolvedValue('[Doc](https://example.com)')
      };
      const provider = new DeerflowResearchProvider({}, mockExecutor);

      const sources = await provider.search({ term: 'testing' });

      expect(mockExecutor.execute).toHaveBeenCalledWith('deerflow_research', {
        topic: 'testing',
        mode: 'pro'
      });
      expect(sources).toHaveLength(1);
      expect(sources[0].url).toBe('https://example.com');
    });

    it('should extract report text from MCP content array format', async () => {
      const mockExecuteTool = vi.fn().mockResolvedValue({
        content: [
          { type: 'text', text: 'Findings: [Vue Docs](https://vuejs.org)' }
        ]
      });

      const provider = new DeerflowResearchProvider({}, mockExecuteTool);
      const sources = await provider.search({ term: 'vue' });

      expect(sources).toHaveLength(1);
      expect(sources[0].title).toBe('Vue Docs');
      expect(sources[0].url).toBe('https://vuejs.org');
    });

    it('should extract report text from object with report property', async () => {
      const mockExecuteTool = vi.fn().mockResolvedValue({
        report: 'Read [Svelte Docs](https://svelte.dev)'
      });

      const provider = new DeerflowResearchProvider({}, mockExecuteTool);
      const sources = await provider.search({ term: 'svelte' });

      expect(sources).toHaveLength(1);
      expect(sources[0].title).toBe('Svelte Docs');
      expect(sources[0].url).toBe('https://svelte.dev');
    });

    it('should throw ResearchProviderUnavailableError when executeTool fails', async () => {
      const mockExecuteTool = vi.fn().mockRejectedValue(new Error('MCP server disconnected'));
      const provider = new DeerflowResearchProvider({}, mockExecuteTool);

      await expect(provider.search({ term: 'fail test' })).rejects.toThrow(ResearchProviderUnavailableError);
    });
  });

  describe('HTTP Fallback Execution via fetch', () => {
    it('should call fetch at default endpoint http://127.0.0.1:2026/api/research', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          report: 'Check [Angular Docs](https://angular.dev)'
        }))
      });

      const provider = new DeerflowResearchProvider({ fetchFn: mockFetch as any });
      const sources = await provider.search({ term: 'angular' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:2026/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'angular',
          mode: 'pro'
        })
      });
      expect(sources).toHaveLength(1);
      expect(sources[0].url).toBe('https://angular.dev');
      expect(sources[0].title).toBe('Angular Docs');
    });

    it('should respect custom endpoint and strip trailing slashes', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('Plain markdown [Vite](https://vitejs.dev)')
      });

      const provider = new DeerflowResearchProvider({
        endpoint: 'http://custom-host:8080///',
        mode: 'ultra',
        fetchFn: mockFetch as any
      });

      const sources = await provider.search({ term: 'bundler' });

      expect(mockFetch).toHaveBeenCalledWith('http://custom-host:8080/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'bundler',
          mode: 'ultra'
        })
      });
      expect(sources).toHaveLength(1);
      expect(sources[0].url).toBe('https://vitejs.dev');
    });

    it('should throw ResearchProviderUnavailableError on non-200 HTTP response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: vi.fn().mockResolvedValue('Offline')
      });

      const provider = new DeerflowResearchProvider({ fetchFn: mockFetch as any });

      await expect(provider.search({ term: 'offline' })).rejects.toThrow(ResearchProviderUnavailableError);
      await expect(provider.search({ term: 'offline' })).rejects.toThrow(/503 Service Unavailable/);
    });

    it('should throw ResearchProviderUnavailableError on network error / connection refused', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:2026'));

      const provider = new DeerflowResearchProvider({ fetchFn: mockFetch as any });

      await expect(provider.search({ term: 'unreachable' })).rejects.toThrow(ResearchProviderUnavailableError);
      await expect(provider.search({ term: 'unreachable' })).rejects.toThrow(/ECONNREFUSED/);
    });
  });

  describe('Citation and Markdown Link Parsing', () => {
    it('should extract both markdown links and citations with titles and snippets', async () => {
      const report = `
# Comprehensive Architectural Analysis

When designing state machines, researchers suggest hierarchical statecharts.
According to [Harel Statecharts](https://www.sciencedirect.com/science/article/pii/0167642387900359), state nesting reduces state explosion.

Key consensus mechanisms were evaluated:
- Raft provides strong leader consistency [citation:In Search of Consensus](https://raft.github.io/raft.pdf).
- Paxos ensures consensus under asynchronous network conditions [Leslie Lamport](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf).
      `;

      const mockExecuteTool = vi.fn().mockResolvedValue(report);
      const provider = new DeerflowResearchProvider({}, mockExecuteTool);

      const sources = await provider.search({ term: 'consensus protocols' });

      expect(sources).toHaveLength(3);

      expect(sources[0]).toEqual({
        url: 'https://www.sciencedirect.com/science/article/pii/0167642387900359',
        title: 'Harel Statecharts',
        type: 'deerflow-research',
        content: expect.stringContaining('Harel Statecharts')
      });

      expect(sources[1]).toEqual({
        url: 'https://raft.github.io/raft.pdf',
        title: 'In Search of Consensus',
        type: 'deerflow-research',
        content: expect.stringContaining('Raft provides strong leader consistency')
      });

      expect(sources[2]).toEqual({
        url: 'https://lamport.azurewebsites.net/pubs/paxos-simple.pdf',
        title: 'Leslie Lamport',
        type: 'deerflow-research',
        content: expect.stringContaining('Paxos ensures consensus')
      });
    });

    it('should return fallback source when report contains no links', async () => {
      const reportWithoutLinks = `
# Summary
No external URLs or citations were found for this topic. All information is synthesized from memory.
      `;

      const mockExecuteTool = vi.fn().mockResolvedValue(reportWithoutLinks);
      const provider = new DeerflowResearchProvider({}, mockExecuteTool);

      const sources = await provider.search({ term: 'obscure query' });

      expect(sources).toHaveLength(1);
      expect(sources[0]).toEqual({
        url: 'deerflow://report',
        title: 'obscure query',
        content: reportWithoutLinks,
        type: 'deerflow-research'
      });
    });
  });

  describe('Follow-up Chat Method', () => {
    it('should send follow-up message via MCP tool deerflow_chat', async () => {
      const mockExecuteTool = vi.fn().mockResolvedValue('Follow-up response text');
      const provider = new DeerflowResearchProvider({ mode: 'pro' }, mockExecuteTool);

      const response = await provider.chat('thread-abc-123', 'Can you clarify section 2?');

      expect(mockExecuteTool).toHaveBeenCalledTimes(1);
      expect(mockExecuteTool).toHaveBeenCalledWith('deerflow_chat', {
        thread_id: 'thread-abc-123',
        threadId: 'thread-abc-123',
        message: 'Can you clarify section 2?',
        mode: 'pro'
      });
      expect(response).toBe('Follow-up response text');
    });

    it('should allow overriding mode for chat call', async () => {
      const mockExecuteTool = vi.fn().mockResolvedValue('Quick answer');
      const provider = new DeerflowResearchProvider({ mode: 'ultra' }, mockExecuteTool);

      const response = await provider.chat('thread-abc-123', 'Give me a brief summary', 'flash');

      expect(mockExecuteTool).toHaveBeenCalledWith('deerflow_chat', {
        thread_id: 'thread-abc-123',
        threadId: 'thread-abc-123',
        message: 'Give me a brief summary',
        mode: 'flash'
      });
      expect(response).toBe('Quick answer');
    });

    it('should send follow-up message via HTTP POST /api/chat when executeTool is absent', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ response: 'Chat response via HTTP' }))
      });

      const provider = new DeerflowResearchProvider({ fetchFn: mockFetch as any });
      const response = await provider.chat('thread-456', 'Follow up query');

      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:2026/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: 'thread-456',
          threadId: 'thread-456',
          message: 'Follow up query',
          mode: 'pro'
        })
      });
      expect(response).toBe('Chat response via HTTP');
    });

    it('should throw ResearchProviderUnavailableError when chat fails', async () => {
      const mockExecuteTool = vi.fn().mockRejectedValue(new Error('Chat failed'));
      const provider = new DeerflowResearchProvider({}, mockExecuteTool);

      await expect(provider.chat('thread-err', 'Hello')).rejects.toThrow(ResearchProviderUnavailableError);
    });
  });
});
