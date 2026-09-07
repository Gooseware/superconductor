import { describe, it, expect, vi } from 'vitest';
import { AntiReinventionGate, AntiReinventionReport } from '../anti-reinvention-gate.js';
import { AdaptiveResearchRouter } from '../adaptive-research-router.js';
import { IResearchBrief } from '../types.js';

describe('AntiReinventionGate', () => {
  describe('analyzeTrack', () => {
    it('Invariant 1: emits OSS_DISCOVERY dependencies into ResearchBrief and formats markdown section', async () => {
      const mockBrief: IResearchBrief = {
        trackId: 'track-caching-101',
        generatedAt: '2026-09-07T12:00:00.000Z',
        queriesExecuted: ['caching and rate limiting libraries'],
        executiveSummary: 'Prior art analysis shows battle-tested libraries exist for in-memory caching and rate-limiting.',
        keyFindings: [
          {
            category: 'OSS_DISCOVERY',
            description: '`lru-cache`: High performance in-memory LRU cache library with TTL and size limits',
            sourceUrl: 'https://npmjs.com/package/lru-cache'
          },
          {
            category: 'OSS_DISCOVERY',
            description: '`p-limit`: Run multiple promise-returning & async operations with limited concurrency',
            sourceUrl: 'https://npmjs.com/package/p-limit'
          },
          {
            category: 'ARCHITECTURAL_PATTERN',
            description: 'Circuit breaker pattern wrapped around external fetch calls'
          },
          {
            category: 'SECURITY_CONSIDERATION',
            description: 'Do not store sensitive tokens in unencrypted cache entries'
          }
        ],
        recommendedPatterns: ['Two-tier cache with TTL', 'Concurrency throttling'],
        antiPatterns: ['Hand-rolled LRU cache class', 'Unbounded memory allocations'],
        skillsAlreadyInstalled: [],
        artifactPointers: []
      };

      const mockRouter = {
        executeResearch: vi.fn().mockResolvedValue({
          brief: mockBrief,
          decision: {
            intent: 'ECOSYSTEM',
            selectedProvider: 'deerflow',
            rationale: 'Ecosystem search',
            fallbackChain: ['search_web']
          }
        })
      } as unknown as AdaptiveResearchRouter;

      const gate = new AntiReinventionGate(mockRouter);
      const report: AntiReinventionReport = await gate.analyzeTrack(
        'track-caching-101',
        'Implement in-memory cache and async concurrency throttler'
      );

      // Verify router call formulated targeted queries
      expect(mockRouter.executeResearch).toHaveBeenCalledWith(
        'track-caching-101',
        expect.arrayContaining([
          expect.objectContaining({
            term: expect.stringMatching(/cache.*concurrency/i),
            intent: 'ECOSYSTEM'
          })
        ]),
        undefined
      );

      // Verify Invariant 1: OSS_DISCOVERY dependencies emitted into ResearchBrief
      expect(report.rawBrief).toBeDefined();
      expect(report.rawBrief?.keyFindings.filter(f => f.category === 'OSS_DISCOVERY')).toHaveLength(2);
      expect(report.approvedDependencies).toContain('lru-cache');
      expect(report.approvedDependencies).toContain('p-limit');

      // Verify architectural and anti-patterns
      expect(report.antiPatterns).toContain('Hand-rolled LRU cache class');
      expect(report.architecturalPatterns).toContain('Two-tier cache with TTL');

      // Verify markdownSection formatting
      expect(report.markdownSection).toContain('## Ecosystem Alignment & Prior Art (Anti-Reinvention)');
      expect(report.markdownSection).toContain('- **Approved Dependencies:** lru-cache, p-limit');
      expect(report.markdownSection).toContain('- **Architectural Reference:**');
      expect(report.markdownSection).toContain('- **Anti-Patterns & Traps:**');
    });

    it('handles fallback when router is not provided and still emits OSS_DISCOVERY', async () => {
      const gate = new AntiReinventionGate();
      const report = await gate.analyzeTrack(
        'track-auth-jwt',
        'JWT token validation and schema parsing'
      );

      expect(report.trackId).toBe('track-auth-jwt');
      expect(report.rawBrief).toBeDefined();
      expect(report.rawBrief?.keyFindings.some(f => f.category === 'OSS_DISCOVERY')).toBe(true);
      expect(report.markdownSection).toContain('## Ecosystem Alignment & Prior Art (Anti-Reinvention)');
      expect(report.markdownSection).toContain('- **Approved Dependencies:**');
    });

    it('injects OSS_DISCOVERY findings into brief if router brief omitted them', async () => {
      const bareBrief: IResearchBrief = {
        trackId: 'track-validation',
        generatedAt: '2026-09-07T12:00:00.000Z',
        queriesExecuted: ['schema validation'],
        executiveSummary: 'Validation requirements investigated.',
        keyFindings: [
          {
            category: 'COMMUNITY_PATTERN',
            description: 'Common practice is to validate on ingress'
          }
        ],
        recommendedPatterns: ['Parse, do not validate', 'zod schema validation'],
        antiPatterns: ['Ad-hoc regex validation'],
        skillsAlreadyInstalled: [],
        artifactPointers: []
      };

      const mockRouter = {
        executeResearch: vi.fn().mockResolvedValue({ brief: bareBrief, decision: {} })
      } as unknown as AdaptiveResearchRouter;

      const gate = new AntiReinventionGate(mockRouter);
      const report = await gate.analyzeTrack(
        'track-validation',
        'Schema parsing and data validation'
      );

      // Invariant 1: Anti-reinvention gate MUST emit OSS_DISCOVERY dependencies into ResearchBrief
      const ossFindings = report.rawBrief?.keyFindings.filter(f => f.category === 'OSS_DISCOVERY');
      expect(ossFindings?.length).toBeGreaterThan(0);
      expect(report.approvedDependencies.length).toBeGreaterThan(0);
    });

    it('formats markdownSection as "none" when no dependencies are identified', async () => {
      const emptyBrief: IResearchBrief = {
        trackId: 'track-docs',
        generatedAt: '2026-09-07T12:00:00.000Z',
        queriesExecuted: ['documentation update'],
        executiveSummary: 'Documentation track with no code dependencies.',
        keyFindings: [],
        recommendedPatterns: ['Markdown formatting'],
        antiPatterns: ['Stale documentation'],
        skillsAlreadyInstalled: [],
        artifactPointers: []
      };

      const mockRouter = {
        executeResearch: vi.fn().mockResolvedValue({ brief: emptyBrief, decision: {} })
      } as unknown as AdaptiveResearchRouter;

      const gate = new AntiReinventionGate(mockRouter);
      const report = await gate.analyzeTrack('track-docs', 'Update documentation files');

      expect(report.markdownSection).toContain('## Ecosystem Alignment & Prior Art (Anti-Reinvention)');
      expect(report.markdownSection).toContain('- **Approved Dependencies:**');
    });
  });

  describe('detectReinvention', () => {
    const gate = new AntiReinventionGate();

    it('detects hand-rolled base64 decoder regex and custom logic', () => {
      const badCode = `
        const b64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
        function decodeBase64(input: string) {
          const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
          let output = "";
          // custom bit-shifting decoder
          return output;
        }
      `;

      const result = gate.detectReinvention(badCode, []);
      expect(result.hasViolation).toBe(true);
      expect(result.violations.some(v => v.toLowerCase().includes('base64'))).toBe(true);
    });

    it('detects hand-rolled LRU cache class implementation', () => {
      const badCode = `
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

      const result = gate.detectReinvention(badCode, ['lru-cache']);
      expect(result.hasViolation).toBe(true);
      expect(result.violations.some(v => v.toLowerCase().includes('lru'))).toBe(true);
      expect(result.violations.some(v => v.includes('lru-cache'))).toBe(true);
    });

    it('detects hand-rolled JWT decoder regex and parsing logic', () => {
      const badCode = `
        const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
        export function parseJwt(token: string) {
          const parts = token.split('.');
          const payload = JSON.parse(atob(parts[1]));
          return payload;
        }
      `;

      const result = gate.detectReinvention(badCode, ['jose']);
      expect(result.hasViolation).toBe(true);
      expect(result.violations.some(v => v.toLowerCase().includes('jwt'))).toBe(true);
    });

    it('detects hand-rolled deep-clone recursion', () => {
      const badCode = `
        export function deepClone<T>(obj: T): T {
          if (obj === null || typeof obj !== 'object') return obj;
          const copy = (Array.isArray(obj) ? [] : {}) as any;
          for (const key of Object.keys(obj)) {
            copy[key] = deepClone((obj as any)[key]);
          }
          return copy;
        }
      `;

      const result = gate.detectReinvention(badCode, ['rfdc']);
      expect(result.hasViolation).toBe(true);
      expect(result.violations.some(v => v.toLowerCase().includes('deep'))).toBe(true);
    });

    it('detects hand-rolled concurrency limiter / semaphore class', () => {
      const badCode = `
        export class Semaphore {
          private tasks: (() => void)[] = [];
          private active = 0;
          constructor(private limit: number) {}
          async acquire() {
            if (this.active < this.limit) {
              this.active++;
              return;
            }
          }
        }
      `;

      const result = gate.detectReinvention(badCode, ['p-limit']);
      expect(result.hasViolation).toBe(true);
      expect(result.violations.some(v => v.toLowerCase().includes('concurrency') || v.toLowerCase().includes('semaphore'))).toBe(true);
    });

    it('passes clean code that utilizes approved dependencies or standard platform APIs', () => {
      const cleanCode = `
        import { LRUCache } from 'lru-cache';
        import pLimit from 'p-limit';
        import { z } from 'zod';

        const cache = new LRUCache({ max: 500 });
        const limit = pLimit(5);
        const UserSchema = z.object({ id: z.string(), name: z.string() });

        export function cloneData<T>(data: T): T {
          return structuredClone(data);
        }

        export function decodeBase64String(str: string): Buffer {
          return Buffer.from(str, 'base64');
        }
      `;

      const result = gate.detectReinvention(cleanCode, ['lru-cache', 'p-limit', 'zod']);
      expect(result.hasViolation).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('does NOT trigger false positives for normal unspaced assignments or equality checks (REV-1)', () => {
      const codeSnippet = `
        const len=0;
        const res=fetch();
        if(foo==bar) {
          const sum=1+2;
        }
      `;
      const result = gate.detectReinvention(codeSnippet, []);
      expect(result.hasViolation).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('detects common aliases for hand-rolled primitives (REV-3)', () => {
      // 1. b64Decode alias
      const b64Code = `
        export const b64Decode = (str: string) => {
          return atob(str);
        };
      `;
      const b64Result = gate.detectReinvention(b64Code, []);
      expect(b64Result.hasViolation).toBe(true);
      expect(b64Result.violations.some(v => v.toLowerCase().includes('base64'))).toBe(true);

      // 2. duplicate (deep clone) alias
      const duplicateCode = `
        export function duplicate<T>(source: T): T {
          return JSON.parse(JSON.stringify(source));
        }
      `;
      const duplicateResult = gate.detectReinvention(duplicateCode, []);
      expect(duplicateResult.hasViolation).toBe(true);
      expect(duplicateResult.violations.some(v => v.toLowerCase().includes('deep-clone'))).toBe(true);

      // 3. MemoryCache with capacity/limit
      const memoryCacheCode = `
        export class MemoryCache {
          private limit: number;
          private store = new Map<string, any>();
          constructor(limit: number) {
            this.limit = limit;
          }
          get(key: string) { return this.store.get(key); }
          set(key: string, val: any) { this.store.set(key, val); }
        }
      `;
      const cacheResult = gate.detectReinvention(memoryCacheCode, []);
      expect(cacheResult.hasViolation).toBe(true);
      expect(cacheResult.violations.some(v => v.toLowerCase().includes('lru cache'))).toBe(true);

      // 4. TaskQueuePool / concurrency pool alias
      const poolCode = `
        export class TaskQueuePool {
          private concurrency: number;
          constructor(concurrency: number) {
            this.concurrency = concurrency;
          }
        }
      `;
      const poolResult = gate.detectReinvention(poolCode, []);
      expect(poolResult.hasViolation).toBe(true);
      expect(poolResult.violations.some(v => v.toLowerCase().includes('concurrency limiter') || v.toLowerCase().includes('semaphore'))).toBe(true);

      // 5. 2 ** attempt exponential backoff
      const backoffCode = `
        export async function retryWithBackoff(fn: () => Promise<any>, attempt = 0) {
          const delay = 2 ** attempt * 1000;
          await new Promise(r => setTimeout(r, delay));
          return fn();
        }
      `;
      const backoffResult = gate.detectReinvention(backoffCode, []);
      expect(backoffResult.hasViolation).toBe(true);
      expect(backoffResult.violations.some(v => v.toLowerCase().includes('retry/exponential backoff'))).toBe(true);
    });
  });
});

