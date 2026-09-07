import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { AdaptiveResearchRouter, ResearchRoutingDecision } from '../adaptive-research-router.js';
import { CircuitBreakerOpenError } from '../circuit-breaker.js';
import { FallbackFailedError } from '../errors/fallback-failed-error.js';
import { ResearchProviderRegistry } from '../provider-registry.js';
import { IResearchProvider, IResearchQuery, IResearchSource } from '../types.js';

describe('AdaptiveResearchRouter', () => {
  const originalEnv = process.env;
  let mockRegistry: ResearchProviderRegistry;
  let mockExecuteTool: any;
  let mockExecuteLlmTool: any;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;

    mockExecuteTool = vi.fn().mockResolvedValue('Mock search web result');
    mockExecuteLlmTool = vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Extract structured findings')) {
        return [
          { category: 'OSS_DISCOVERY', description: 'Sample library finding', confidenceScore: 0.9 }
        ];
      }
      return {
        executiveSummary: 'Synthesized research summary.',
        recommendedPatterns: ['Modular Architecture'],
        antiPatterns: ['Custom Reinvention']
      };
    });

    mockRegistry = new ResearchProviderRegistry();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('classifyIntent', () => {
    it('should classify queries with code extensions, paths, or refactor keywords as INTERNAL', () => {
      const router = new AdaptiveResearchRouter();

      expect(router.classifyIntent('Check src/research/circuit-breaker.ts for bugs')).toBe('INTERNAL');
      expect(router.classifyIntent('Refactor state machine logic in packages/engine')).toBe('INTERNAL');
      expect(router.classifyIntent('Verify workspace invariants')).toBe('INTERNAL');
      expect(router.classifyIntent('Inspect class CircuitBreaker and its methods')).toBe('INTERNAL');
      expect(router.classifyIntent({ term: 'config.json structure in existing code' })).toBe('INTERNAL');
    });

    it('should classify queries with exhaustive or deep research signals as FRONTIER', () => {
      const router = new AdaptiveResearchRouter();

      expect(router.classifyIntent('Analyze distributed consensus --exhaustive')).toBe('FRONTIER');
      expect(router.classifyIntent('Deep research into zero-knowledge rollups')).toBe('FRONTIER');
      expect(router.classifyIntent('Cross-domain theoretical reasoning on quantum cryptography')).toBe('FRONTIER');
      expect(router.classifyIntent({ term: 'Frontier AI alignment research --deep' })).toBe('FRONTIER');
    });

    it('should classify ecosystem, package, and library queries as ECOSYSTEM', () => {
      const router = new AdaptiveResearchRouter();

      expect(router.classifyIntent('npm package for robust circuit breaking')).toBe('ECOSYSTEM');
      expect(router.classifyIntent('Compare PyPI libraries for data validation')).toBe('ECOSYSTEM');
      expect(router.classifyIntent('Known CVEs and best practices for jwt authentication')).toBe('ECOSYSTEM');
      // Default for track planning
      expect(router.classifyIntent('Add stripe webhook processing to payments')).toBe('ECOSYSTEM');
    });

    it('should respect explicit query.intent property', () => {
      const router = new AdaptiveResearchRouter();

      expect(router.classifyIntent({ term: 'any query', intent: 'INTERNAL' })).toBe('INTERNAL');
      expect(router.classifyIntent({ term: 'any query', intent: 'frontier' })).toBe('FRONTIER');
      expect(router.classifyIntent({ term: 'any query', intent: 'ECOSYSTEM' })).toBe('ECOSYSTEM');
    });
  });

  describe('determineRoute & Credential Verification (Invariant 1)', () => {
    it('should route ECOSYSTEM intent to deerflow by default', () => {
      const router = new AdaptiveResearchRouter();
      const decision = router.determineRoute({ term: 'npm package for rate limiting' });

      expect(decision.intent).toBe('ECOSYSTEM');
      expect(decision.selectedProvider).toBe('deerflow');
      expect(decision.fallbackChain).toContain('deerflow');
      expect(decision.fallbackChain).toContain('search_web');
    });

    it('should route INTERNAL intent to internal by default', () => {
      const router = new AdaptiveResearchRouter();
      const decision = router.determineRoute({ term: 'src/research/circuit-breaker.ts' });

      expect(decision.intent).toBe('INTERNAL');
      expect(decision.selectedProvider).toBe('internal');
    });

    it('Invariant 1: MUST verify GEMINI_API_KEY and reroute to deerflow when key is missing for FRONTIER', () => {
      delete process.env.GEMINI_API_KEY;
      const router = new AdaptiveResearchRouter();
      const decision = router.determineRoute({ term: 'Frontier multi-domain reasoning --exhaustive' });

      expect(decision.intent).toBe('FRONTIER');
      // Must NOT route to gemini without key
      expect(decision.selectedProvider).toBe('deerflow');
      expect(decision.rationale).toMatch(/GEMINI_API_KEY.*missing/i);
      expect(decision.fallbackChain).toEqual(['deerflow', 'search_web']);
    });

    it('Invariant 1: routes to gemini-api-deep-research when GEMINI_API_KEY is present in process.env', () => {
      process.env.GEMINI_API_KEY = 'ai-test-secret-key';
      const router = new AdaptiveResearchRouter();
      const decision = router.determineRoute({ term: 'Frontier multi-domain reasoning --exhaustive' });

      expect(decision.intent).toBe('FRONTIER');
      expect(decision.selectedProvider).toBe('gemini-api-deep-research');
      expect(decision.fallbackChain).toEqual(['gemini-api-deep-research', 'deerflow', 'search_web']);
    });

    it('Invariant 1: routes to gemini-api-deep-research when apiKey is passed in options', () => {
      delete process.env.GEMINI_API_KEY;
      const router = new AdaptiveResearchRouter();
      const decision = router.determineRoute(
        { term: 'Frontier multi-domain reasoning --exhaustive' },
        { apiKey: 'option-api-key' }
      );

      expect(decision.intent).toBe('FRONTIER');
      expect(decision.selectedProvider).toBe('gemini-api-deep-research');
    });

    it('should respect forceProvider override', () => {
      const router = new AdaptiveResearchRouter();
      const decision = router.determineRoute(
        { term: 'src/file.ts' },
        { forceProvider: 'deerflow' }
      );

      expect(decision.selectedProvider).toBe('deerflow');
      expect(decision.rationale).toMatch(/user forced/i);
    });

    it('Invariant 1: should auto-reroute forced gemini provider if GEMINI_API_KEY is missing', () => {
      delete process.env.GEMINI_API_KEY;
      const router = new AdaptiveResearchRouter();
      const decision = router.determineRoute(
        { term: 'any query' },
        { forceProvider: 'gemini-api-deep-research' }
      );

      expect(decision.selectedProvider).toBe('deerflow');
      expect(decision.rationale).toMatch(/GEMINI_API_KEY.*missing/i);
    });

    it('should respect researchMode: "internal-only"', () => {
      const router = new AdaptiveResearchRouter();
      const decision = router.determineRoute(
        { term: 'npm package for rate limiting' },
        { researchMode: 'internal-only' }
      );

      expect(decision.selectedProvider).toBe('internal');
      expect(decision.effectiveMode).toBe('internal-only');
    });

    it('should respect researchMode: "deerflow-preferred"', () => {
      const router = new AdaptiveResearchRouter();
      const decision = router.determineRoute(
        { term: 'Frontier theoretical reasoning --exhaustive' },
        { researchMode: 'deerflow-preferred' }
      );

      expect(decision.selectedProvider).toBe('deerflow');
      expect(decision.effectiveMode).toBe('deerflow-preferred');
    });
  });

  describe('CircuitBreaker Integration & Multi-Tier Fallback Cascade', () => {
    let mockDeerflow: IResearchProvider;
    let mockGemini: IResearchProvider;
    let currentTime: number;
    const mockClock = () => currentTime;

    beforeEach(() => {
      currentTime = 1000000;
      mockDeerflow = {
        search: vi.fn().mockResolvedValue([
          { type: 'community', url: 'https://github.com/org/deerflow-finding', title: 'DeerFlow Source' }
        ])
      };
      mockGemini = {
        search: vi.fn().mockResolvedValue([
          { type: 'paper', url: 'https://arxiv.org/abs/1234.5678', title: 'Gemini Source' }
        ])
      };

      vi.spyOn(mockRegistry, 'resolve').mockImplementation((name?: string) => {
        if (name === 'deerflow') return mockDeerflow;
        if (name === 'gemini-api-deep-research') return mockGemini;
        throw new Error(`Unknown mock provider: ${name}`);
      });
    });

    it('should execute research via primary provider when available', async () => {
      const router = new AdaptiveResearchRouter({
        providerRegistry: mockRegistry,
        executeTool: mockExecuteTool,
        executeLlmTool: mockExecuteLlmTool,
        clock: mockClock,
        workspaceDir: '/tmp/test-workspace'
      });

      const { brief, decision } = await router.executeResearch('test-track-1', [
        { term: 'npm package for logging' }
      ]);

      expect(decision.selectedProvider).toBe('deerflow');
      expect(mockDeerflow.search).toHaveBeenCalledWith({ term: 'npm package for logging' });
      expect(brief).toBeDefined();
      expect(brief.trackId).toBe('test-track-1');
      expect(router.getCircuitBreaker('deerflow').getState()).toBe('CLOSED');
    });

    it('should fallback to search_web when primary provider fails and record failure', async () => {
      mockDeerflow.search = vi.fn().mockRejectedValue(new Error('DeerFlow Docker connection refused'));

      const router = new AdaptiveResearchRouter({
        providerRegistry: mockRegistry,
        executeTool: mockExecuteTool,
        executeLlmTool: mockExecuteLlmTool,
        clock: mockClock,
        workspaceDir: '/tmp/test-workspace'
      });

      const { brief, decision } = await router.executeResearch('test-track-2', [
        { term: 'npm package for logging' }
      ]);

      expect(decision.selectedProvider).toBe('deerflow');
      // DeerFlow failed, should have tried search_web
      expect(mockExecuteTool).toHaveBeenCalledWith('search_web', { query: 'npm package for logging' });
      expect(brief).toBeDefined();
      expect(router.getCircuitBreaker('deerflow').getState()).toBe('CLOSED'); // 1 failure recorded, threshold is 2
    });

    it('Invariant 2: trips circuit breaker after 2 consecutive failures and bypasses primary on 3rd call', async () => {
      mockDeerflow.search = vi.fn().mockRejectedValue(new Error('Connection timed out'));

      const router = new AdaptiveResearchRouter({
        providerRegistry: mockRegistry,
        executeTool: mockExecuteTool,
        executeLlmTool: mockExecuteLlmTool,
        clock: mockClock,
        workspaceDir: '/tmp/test-workspace'
      });

      // Strike 1
      await router.executeResearch('track-strike-1', [{ term: 'query 1' }]);
      expect(router.getCircuitBreaker('deerflow').getState()).toBe('CLOSED');

      // Strike 2 (Trips to OPEN)
      await router.executeResearch('track-strike-2', [{ term: 'query 2' }]);
      expect(router.getCircuitBreaker('deerflow').getState()).toBe('OPEN');
      expect(router.getCircuitBreaker('deerflow').isOpen()).toBe(true);

      // Strike 3: DeerFlow search should NOT even be called because circuit breaker is OPEN
      mockDeerflow.search = vi.fn(); // reset mock to see if called
      const { brief } = await router.executeResearch('track-strike-3', [{ term: 'query 3' }]);

      expect(mockDeerflow.search).not.toHaveBeenCalled();
      expect(mockExecuteTool).toHaveBeenCalledWith('search_web', { query: 'query 3' });
      expect(brief).toBeDefined();
    });

    it('should recover after 60s cooldown when circuit breaker is OPEN (Invariant 2)', async () => {
      mockDeerflow.search = vi.fn().mockRejectedValue(new Error('Server unavailable'));

      const router = new AdaptiveResearchRouter({
        providerRegistry: mockRegistry,
        executeTool: mockExecuteTool,
        executeLlmTool: mockExecuteLlmTool,
        clock: mockClock,
        workspaceDir: '/tmp/test-workspace'
      });

      // Trip breaker to OPEN
      await router.executeResearch('track-fail-1', [{ term: 'q1' }]);
      await router.executeResearch('track-fail-2', [{ term: 'q2' }]);
      expect(router.getCircuitBreaker('deerflow').isOpen()).toBe(true);

      // Advance time by 60s
      currentTime += 60000;
      expect(router.getCircuitBreaker('deerflow').getState()).toBe('HALF_OPEN');

      // Now Deerflow recovers
      mockDeerflow.search = vi.fn().mockResolvedValue([
        { type: 'community', url: 'https://github.com/recovered', title: 'Recovered' }
      ]);

      const { brief } = await router.executeResearch('track-recovered', [{ term: 'q3' }]);
      expect(mockDeerflow.search).toHaveBeenCalledWith({ term: 'q3' });
      expect(router.getCircuitBreaker('deerflow').getState()).toBe('CLOSED');
      expect(brief).toBeDefined();
    });

    it('should cascade through DeerFlow -> Gemini -> search_web when keys present', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      mockDeerflow.search = vi.fn().mockRejectedValue(new Error('DeerFlow down'));

      const router = new AdaptiveResearchRouter({
        providerRegistry: mockRegistry,
        executeTool: mockExecuteTool,
        executeLlmTool: mockExecuteLlmTool,
        clock: mockClock,
        workspaceDir: '/tmp/test-workspace'
      });

      const { brief, decision } = await router.executeResearch('track-gemini-fallback', [
        { term: 'npm package for telemetry' }
      ]);

      expect(mockDeerflow.search).toHaveBeenCalled();
      expect(mockGemini.search).toHaveBeenCalled();
      expect(brief).toBeDefined();
    });

    it('should throw FallbackFailedError when all providers fail', async () => {
      mockDeerflow.search = vi.fn().mockRejectedValue(new Error('DeerFlow down'));
      mockExecuteTool.mockRejectedValue(new Error('search_web tool down'));

      const router = new AdaptiveResearchRouter({
        providerRegistry: mockRegistry,
        executeTool: mockExecuteTool,
        executeLlmTool: mockExecuteLlmTool,
        clock: mockClock,
        workspaceDir: '/tmp/test-workspace'
      });

      await expect(
        router.executeResearch('track-all-failed', [{ term: 'failing query' }])
      ).rejects.toThrow(FallbackFailedError);
    });
  });
});
