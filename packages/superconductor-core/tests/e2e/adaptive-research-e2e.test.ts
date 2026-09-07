import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

import {
  AdaptiveResearchRouter,
  ResearchIntent,
  CircuitBreaker,
  CircuitBreakerState,
  DeerflowResearchProvider,
  AntiReinventionGate,
  detectReinvention,
  IResearchProvider,
  IResearchQuery,
  IResearchSource,
  ResearchProviderUnavailableError
} from '../../../engine/src/research/index.js';


import {
  DeepResearchEscalationHandler,
  EscalationRequest,
  Prompter
} from '../../src/remediation/deep-research-escalation-handler.js';

describe('Adaptive Research Router & Resilient Fallback - End-to-End Suite', () => {
  let tempWorkspace: string;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-research-e2e-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    try {
      if (fs.existsSync(tempWorkspace)) {
        fs.rmSync(tempWorkspace, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup
    }
  });

  describe('Scenario 1: Full Lifecycle Inception & Dependency Lock', () => {
    it('verifies full lifecycle: intent classification -> research dispatch -> brief synthesis -> dependency lock', async () => {
      const trackId = 'track-distributed-caching-2026';
      const description = 'Implement distributed caching with LRU eviction and memory bounds';

      // 1. Intent Classification: Scaffold track description and verify router classifies as ECOSYSTEM
      const router = new AdaptiveResearchRouter({
        workspaceDir: tempWorkspace
      });

      const classifiedIntent: ResearchIntent = router.classifyIntent(description);
      expect(classifiedIntent).toBe('ECOSYSTEM');

      // 2. Mock DeerFlow Provider returning ecosystem findings and prior art traps
      const mockDeerflowTool = vi.fn().mockImplementation(async (toolName: string, params: Record<string, unknown>) => {
        if (toolName === 'deerflow_research') {
          return {
            content: [
              {
                text: [
                  '# Ecosystem Prior Art: Memory-Bounded Caching & LRU Eviction',
                  '## Battle-Tested Libraries',
                  '- `lru-cache`: High-performance in-memory LRU cache library with TTL and size limits.',
                  '- `quick-lru`: High-throughput simple and fast LRU cache.',
                  '## Anti-Patterns & Common Traps',
                  '- Hand-rolling custom LRUCache classes leads to memory leaks and eviction race conditions.'
                ].join('\n')
              }
            ]
          };
        }
        return '';
      });

      const mockLlmTool = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Extract structured findings')) {
          return [
            {
              category: 'OSS_DISCOVERY',
              description: '`lru-cache`: Battle-tested in-memory cache with TTL and size limits',
              confidenceScore: 0.95,
              sourceUrl: 'https://npmjs.com/package/lru-cache'
            },
            {
              category: 'OSS_DISCOVERY',
              description: '`quick-lru`: High-performance simple and fast LRU cache',
              confidenceScore: 0.92,
              sourceUrl: 'https://npmjs.com/package/quick-lru'
            },
            {
              category: 'ARCHITECTURAL_PATTERN',
              description: 'Two-tier memory-bounded cache eviction policy',
              confidenceScore: 0.88
            },
            {
              category: 'SECURITY_CONSIDERATION',
              description: 'Hand-rolled LRU cache class causes unbounded memory leaks',
              confidenceScore: 0.85
            }
          ];
        }

        return {
          executiveSummary: 'Prior art analysis shows battle-tested libraries lru-cache and quick-lru exist for memory-bounded caching.',
          recommendedPatterns: ['Two-tier cache with TTL', 'Memory-bounded eviction limits'],
          antiPatterns: ['Hand-rolled LRU cache class', 'Unbounded memory allocations']
        };
      });

      const deerflowProvider = new DeerflowResearchProvider(
        { mode: 'pro' },
        mockDeerflowTool
      );

      const mockRegistry = {
        resolve: vi.fn().mockImplementation((providerName: string) => {
          if (providerName === 'deerflow' || providerName === 'deerflow_research') {
            return deerflowProvider;
          }
          throw new Error(`Unknown mock provider: ${providerName}`);
        })
      };

      const configuredRouter = new AdaptiveResearchRouter({
        workspaceDir: tempWorkspace,
        providerRegistry: mockRegistry as any,
        executeTool: mockDeerflowTool,
        executeLlmTool: mockLlmTool
      });

      // 3. Research Dispatch & Brief Synthesis: Pass track through AntiReinventionGate.analyzeTrack
      const report = await AntiReinventionGate.analyzeTrack(
        trackId,
        description,
        configuredRouter
      );

      // Verify router executed research and deerflow was queried
      expect(mockDeerflowTool).toHaveBeenCalledWith(
        'deerflow_research',
        expect.objectContaining({
          mode: 'pro',
          topic: expect.stringMatching(/distributed caching.*LRU eviction/i)
        })
      );

      // 4. Verify resulting ResearchBrief and AntiReinventionReport
      expect(report).toBeDefined();
      expect(report.trackId).toBe(trackId);
      expect(report.rawBrief).toBeDefined();

      const brief = report.rawBrief!;
      const ossFindings = brief.keyFindings.filter(f => f.category === 'OSS_DISCOVERY');
      expect(ossFindings.length).toBeGreaterThanOrEqual(2);
      expect(ossFindings.some(f => f.description.includes('lru-cache'))).toBe(true);
      expect(ossFindings.some(f => f.description.includes('quick-lru'))).toBe(true);

      // 5. Verify dependency lock in report and markdown section
      expect(report.approvedDependencies).toContain('lru-cache');
      expect(report.approvedDependencies).toContain('quick-lru');

      expect(report.markdownSection).toContain('## Ecosystem Alignment & Prior Art (Anti-Reinvention)');
      expect(report.markdownSection).toContain('- **Approved Dependencies:**');
      expect(report.markdownSection).toContain('lru-cache');
      expect(report.markdownSection).toContain('quick-lru');
      expect(report.markdownSection).toContain('- **Anti-Patterns & Traps:**');

      // 6. Verify detectReinvention catches hand-rolled LRU cache and passes compliant code
      const reinventionCode = `
        export class LRUCache<K, V> {
          private capacity: number;
          private map = new Map<K, V>();
          constructor(capacity: number) {
            this.capacity = capacity;
          }
          get(key: K): V | undefined {
            if (!this.map.has(key)) return undefined;
            const val = this.map.get(key)!;
            this.map.delete(key);
            this.map.set(key, val);
            return val;
          }
        }
      `;

      const reinventionResult = detectReinvention(reinventionCode, report.approvedDependencies);
      expect(reinventionResult.hasViolation).toBe(true);
      expect(reinventionResult.violations.some(v => v.toLowerCase().includes('lru'))).toBe(true);
      expect(reinventionResult.violations.some(v => v.includes('lru-cache'))).toBe(true);

      const compliantCode = `
        import { LRUCache } from 'lru-cache';

        export class MemoryCacheService<K extends {}, V extends {}> {
          private cache: LRUCache<K, V>;
          constructor(maxSize: number = 1000) {
            this.cache = new LRUCache({ max: maxSize, ttl: 1000 * 60 * 10 });
          }
          public get(key: K): V | undefined {
            return this.cache.get(key);
          }
          public set(key: K, value: V): void {
            this.cache.set(key, value);
          }
        }
      `;

      const compliantResult = detectReinvention(compliantCode, report.approvedDependencies);
      expect(compliantResult.hasViolation).toBe(false);
      expect(compliantResult.violations).toHaveLength(0);
    });
  });

  describe('Scenario 2: Circuit Breaker Resilience & Tier Fallback', () => {
    it('manages circuit breaker failure tracking, trips to OPEN after 2 strikes, and recovers via HALF_OPEN after cooldown', async () => {
      let currentTime = 1700000000000;
      const mockClock = () => currentTime;

      const failingDeerflowSearch = vi.fn().mockRejectedValue(
        new ResearchProviderUnavailableError('DeerFlow service connection refused: ECONNREFUSED 127.0.0.1:2026')
      );

      const mockDeerflowProvider: IResearchProvider = {
        search: failingDeerflowSearch
      };

      const mockFallbackExecuteTool = vi.fn().mockImplementation(async (toolName: string, params: Record<string, unknown>) => {
        if (toolName === 'search_web') {
          return JSON.stringify({
            results: [
              {
                title: 'Web Search Fallback for ' + params.query,
                url: 'https://web.search/cache-research',
                content: 'Battle-tested distributed caching libraries: lru-cache, redis'
              }
            ]
          });
        }
        return '';
      });

      const mockLlmTool = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Extract structured findings')) {
          return [
            {
              category: 'COMMUNITY_PATTERN',
              description: 'Distributed caching pattern with fallback tier',
              confidenceScore: 0.9
            }
          ];
        }
        return {
          executiveSummary: 'Fallback synthesized summary via search_web tier.',
          recommendedPatterns: ['Distributed cache cluster'],
          antiPatterns: ['Unbounded caches']
        };
      });


      const mockRegistry = {
        resolve: vi.fn().mockImplementation((providerName: string) => {
          if (providerName === 'deerflow' || providerName === 'deerflow_research') {
            return mockDeerflowProvider;
          }
          throw new Error(`Unknown mock provider: ${providerName}`);
        })
      };

      const router = new AdaptiveResearchRouter({
        workspaceDir: tempWorkspace,
        providerRegistry: mockRegistry as any,
        executeTool: mockFallbackExecuteTool,
        executeLlmTool: mockLlmTool,
        clock: mockClock
      });

      const deerflowBreaker = router.getCircuitBreaker('deerflow');
      expect(deerflowBreaker.getState()).toBe('CLOSED');
      expect(deerflowBreaker.isOpen()).toBe(false);

      // --- Strike 1: Primary fails, fallback succeeds, circuit breaker failure count = 1, state = CLOSED ---
      const result1 = await router.executeResearch('track-strike-1', [
        { term: 'distributed caching prior art' }
      ]);

      expect(failingDeerflowSearch).toHaveBeenCalledTimes(1);
      expect(mockFallbackExecuteTool).toHaveBeenCalledWith('search_web', {
        query: 'distributed caching prior art'
      });
      expect(result1.brief).toBeDefined();
      expect(deerflowBreaker.getState()).toBe('CLOSED');
      expect(deerflowBreaker.isOpen()).toBe(false);

      // --- Strike 2: Primary fails, fallback succeeds, circuit breaker trips to OPEN ---
      const result2 = await router.executeResearch('track-strike-2', [
        { term: 'cache invalidation patterns' }
      ]);

      expect(failingDeerflowSearch).toHaveBeenCalledTimes(2);
      expect(result2.brief).toBeDefined();
      expect(deerflowBreaker.getState()).toBe('OPEN');
      expect(deerflowBreaker.isOpen()).toBe(true);

      // --- Strike 3: Primary skipped immediately due to circuit breaker OPEN, fallback succeeds seamlessly ---
      failingDeerflowSearch.mockClear();
      mockFallbackExecuteTool.mockClear();

      const result3 = await router.executeResearch('track-strike-3', [
        { term: 'cache consistency protocols' }
      ]);

      // Verify primary DeerFlow search was NOT called because circuit breaker was OPEN
      expect(failingDeerflowSearch).not.toHaveBeenCalled();
      expect(mockFallbackExecuteTool).toHaveBeenCalledWith('search_web', {
        query: 'cache consistency protocols'
      });
      expect(result3.brief).toBeDefined();
      expect(deerflowBreaker.getState()).toBe('OPEN');

      // --- Cooldown (60s): Advance clock and verify transition to HALF_OPEN & health test ---
      currentTime += 60000;
      expect(deerflowBreaker.getState()).toBe('HALF_OPEN');
      expect(deerflowBreaker.isOpen()).toBe(false);

      // DeerFlow recovers and responds successfully
      failingDeerflowSearch.mockResolvedValueOnce([
        {
          type: 'community',
          url: 'https://deerflow.recovered/caching',
          title: 'Recovered DeerFlow Cache Intelligence',
          content: 'Healthy response from recovered DeerFlow provider'
        }
      ]);

      const result4 = await router.executeResearch('track-recovery-4', [
        { term: 'cache recovery verification' }
      ]);

      // Primary was tested in HALF_OPEN and succeeded
      expect(failingDeerflowSearch).toHaveBeenCalledTimes(1);
      expect(deerflowBreaker.getState()).toBe('CLOSED');
      expect(deerflowBreaker.isOpen()).toBe(false);
      expect(result4.brief).toBeDefined();
    });
  });

  describe('Scenario 3: Remediation Escalation End-to-End', () => {
    it('handles diagnostic escalation payload, multi-turn chat with preserved threadId, and policy confirmation gates', async () => {
      // 1. Simulate an escalation request with finding, errorContext stack, and priorDiff
      const escalationRequest: EscalationRequest = {
        finding: { message: 'Type safety broken in cache serializer', rule: 'no-any' },
        errorContext: { stack: 'TypeError: Cannot read properties of undefined (reading serialize)\n  at Cache.get' },
        priorDiff: '--- a/cache.ts\n+++ b/cache.ts\n@@ -10 +10 @@\n- return data;\n+ return (data as any).serialize();'
      };

      const capturedQueries: IResearchQuery[] = [];
      const mockRouter = {
        executeResearch: vi.fn().mockImplementation(async (trackId: string, queries: IResearchQuery[]) => {
          capturedQueries.push(...queries);
          return {
            brief: {
              executiveSummary: 'Add null-safe guard data?.serialize() before invocation to fix TypeError and remove (data as any).',
              recommendedPatterns: ['Optional chaining serializer guard'],
              antiPatterns: ['Unsafe casting with as any']
            },
            threadId: 'thread-cache-escalation-101'
          };
        }),
        chat: vi.fn()
      };

      // 2. Call DeepResearchEscalationHandler.escalateWithRouter
      const result1 = await DeepResearchEscalationHandler.escalateWithRouter(
        escalationRequest,
        mockRouter,
        { trackId: 'test-track' }
      );

      // Verify router call arguments and diagnostic query contents
      expect(mockRouter.executeResearch).toHaveBeenCalledTimes(1);
      expect(mockRouter.executeResearch).toHaveBeenCalledWith('test-track', expect.any(Array));

      expect(capturedQueries).toHaveLength(1);
      const diagnosticQuery = capturedQueries[0].term;

      // Diagnostic query must contain finding, stack trace, and diff
      expect(diagnosticQuery).toContain('Type safety broken in cache serializer');
      expect(diagnosticQuery).toContain('TypeError: Cannot read properties of undefined (reading serialize)\n  at Cache.get');
      expect(diagnosticQuery).toContain('--- a/cache.ts\n+++ b/cache.ts\n@@ -10 +10 @@\n- return data;\n+ return (data as any).serialize();');

      // Verify returned result properties
      expect(result1.classification).toBe('auto-applicable');
      expect(result1.threadId).toBe('thread-cache-escalation-101');
      expect(result1.suggestedFix).toContain('Add null-safe guard');
      expect(result1.spotlightedContent).toContain('<DEEP_RESEARCH_RESULT>');
      expect(result1.spotlightedContent).toContain('</DEEP_RESEARCH_RESULT>');

      // 3. Multi-turn follow-up using preserved threadId
      mockRouter.chat.mockResolvedValueOnce({
        content: 'Refinement: Export SerializableCacheEntry interface to guarantee compile-time safety.',
        threadId: 'thread-cache-escalation-101'
      });

      const followUpRequest: EscalationRequest = {
        finding: { message: 'Missing explicit return type on Cache.get' },
        errorContext: { stack: 'TypeScript Error TS7023: Cache.get implicitly has an any return type.' },
        priorDiff: '--- a/cache.ts\n+++ b/cache.ts\n@@ -15 +15 @@\n+ get(key: string) { return this.map.get(key); }'
      };

      const result2 = await DeepResearchEscalationHandler.escalateWithRouter(
        followUpRequest,
        mockRouter,
        { threadId: result1.threadId }
      );

      // Verify multi-turn chat used preserved threadId and router.executeResearch was not called again
      expect(mockRouter.chat).toHaveBeenCalledTimes(1);
      expect(mockRouter.chat).toHaveBeenCalledWith(
        'thread-cache-escalation-101',
        expect.stringContaining('Missing explicit return type on Cache.get')
      );
      expect(result2.threadId).toBe('thread-cache-escalation-101');
      expect(result2.researchContent).toContain('SerializableCacheEntry');

      // 4. Policy confirmation gate when policy keywords (breaking change, CVE) are detected
      const policyEscalationRequest: EscalationRequest = {
        finding: { message: 'Critical security vulnerability in cache serializer buffer' },
        errorContext: { stack: 'SecurityAlert: CVE-2026-9812 detected in buffer parsing' },
        priorDiff: '--- a/serializer.ts\n+++ b/serializer.ts\n@@ -1 +1 @@\n- Buffer.alloc(10);'
      };

      const policyBreachRouter = {
        executeResearch: vi.fn().mockResolvedValue({
          brief: {
            executiveSummary: 'Addressing CVE-2026-9812 requires a breaking change to serializer API contracts and data format migration.',
            recommendedPatterns: ['Strict buffer validation v2']
          },
          threadId: 'thread-policy-cve-007'
        })
      };

      const mockPrompter: Prompter = {
        askQuestion: vi.fn().mockResolvedValue('Acknowledge & Abort')
      };

      const handler = new DeepResearchEscalationHandler(undefined, mockPrompter);
      const policyResult = await handler.escalateWithRouter(
        policyEscalationRequest,
        policyBreachRouter,
        { trackId: 'test-track' }
      );

      // Verify policy decision classification and rationale
      expect(policyResult.classification).toBe('policy-decision-required');
      expect(policyResult.policyRationale).toContain('breaking change');
      expect(policyResult.policyRationale).toContain('CVE');
      expect(policyResult.suggestedFix).toBeUndefined();

      // Trigger interactive confirmation gate
      const decisionAbort = await handler.handlePolicyDecision(policyResult);
      expect(decisionAbort).toBe('aborted');
      expect(mockPrompter.askQuestion).toHaveBeenCalledWith(
        expect.stringContaining('A policy decision is required for this fix:'),
        ['Acknowledge & Abort', 'Acknowledge & Revert']
      );

      // Verify Acknowledge & Revert option
      mockPrompter.askQuestion = vi.fn().mockResolvedValue('Acknowledge & Revert');
      const decisionRevert = await handler.handlePolicyDecision(policyResult);
      expect(decisionRevert).toBe('reverted');
    });
  });
});
