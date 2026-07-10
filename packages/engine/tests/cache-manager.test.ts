import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager } from '../src/routing/cache-manager.js';

describe('Prefix Prompt Cache Manager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    // Initialize with a max budget of 1000 tokens
    cacheManager = new CacheManager({ maxTokenBudget: 1000 });
  });

  it('Calculate caching breakpoints efficiently (based on prefix similarity)', () => {
    const context1 = "System Instruction: You are a helpful assistant. \n\nTask: Do A";
    const context2 = "System Instruction: You are a helpful assistant. \n\nTask: Do B";

    const breakpoint = cacheManager.findCommonPrefix(context1, context2);
    
    // The common prefix should be extracted accurately
    expect(breakpoint).toBe("System Instruction: You are a helpful assistant. \n\nTask: Do ");
  });

  it('Deduplicate context payloads across branch nodes', () => {
    const payload1 = {
      taskId: 'A',
      systemInstruction: 'Common System Prompt',
      tools: 'Common Tools Definitions',
      context: 'Specific Context A'
    };

    const payload2 = {
      taskId: 'B',
      systemInstruction: 'Common System Prompt',
      tools: 'Common Tools Definitions',
      context: 'Specific Context B'
    };

    const result1 = cacheManager.processPayload(payload1);
    const result2 = cacheManager.processPayload(payload2);

    // Should indicate cache hit for system/tools
    expect(result2.hitRatio).toBeGreaterThan(0);
    expect(result2.estimatedTokenSavings).toBeGreaterThan(0);
  });

  it('Evict least-recently-used prompts to stay under budget', () => {
    // 1 token ~= 4 chars according to the approximation
    // We add 3 large common prefixes that each take ~400 tokens (1600 chars)
    // Budget is 1000, so adding 3 should evict the first one.

    const largeBlock1 = "A".repeat(1600); // 400 tokens
    const largeBlock2 = "B".repeat(1600); // 400 tokens
    const largeBlock3 = "C".repeat(1600); // 400 tokens

    cacheManager.processPayload({ taskId: '1', systemInstruction: largeBlock1, tools: '', context: '' });
    cacheManager.processPayload({ taskId: '2', systemInstruction: largeBlock2, tools: '', context: '' });
    
    expect(cacheManager.getCurrentTokenUsage()).toBe(800);
    
    // This pushes usage to 1200, which exceeds 1000, forcing eviction of largeBlock1 (taskId 1's prefix)
    cacheManager.processPayload({ taskId: '3', systemInstruction: largeBlock3, tools: '', context: '' });

    expect(cacheManager.getCurrentTokenUsage()).toBe(800);
    expect(cacheManager.hasCached(largeBlock1)).toBe(false);
    expect(cacheManager.hasCached(largeBlock3)).toBe(true);
  });
});
