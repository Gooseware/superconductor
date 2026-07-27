import { describe, it, expect } from 'vitest';
import { ModelTierRouter } from '../../src/intelligence/model-tier-router.js';
import { TaskComplexityScore } from '../../src/intelligence/task-complexity-scorer.js';

describe('ModelTierRouter', () => {
  const createMockTcs = (total: number, source: 'intelligence' | 'heuristic' = 'intelligence'): TaskComplexityScore => ({
    contextLoad: 1,
    reasoningDepth: 1,
    crossCuttingRisk: 1,
    testSurface: 1,
    total,
    source,
  });

  describe('Band Boundaries & Routing', () => {
    it('should route total=0 to flash-lite (TIER-1)', () => {
      const result = ModelTierRouter.route(createMockTcs(0));
      expect(result.tier).toBe('flash-lite');
      expect(result.tcsTotal).toBe(0);
      expect(result.annotation).toBe('[TIER-1:TCS=0]');
    });

    it('should route boundary total=5 to flash-lite (TIER-1)', () => {
      const result = ModelTierRouter.route(createMockTcs(5));
      expect(result.tier).toBe('flash-lite');
      expect(result.tcsTotal).toBe(5);
      expect(result.annotation).toBe('[TIER-1:TCS=5]');
    });

    it('should route boundary total=6 to flash (TIER-2)', () => {
      const result = ModelTierRouter.route(createMockTcs(6));
      expect(result.tier).toBe('flash');
      expect(result.tcsTotal).toBe(6);
      expect(result.annotation).toBe('[TIER-2:TCS=6]');
    });

    it('should route boundary total=10 to flash (TIER-2)', () => {
      const result = ModelTierRouter.route(createMockTcs(10));
      expect(result.tier).toBe('flash');
      expect(result.tcsTotal).toBe(10);
      expect(result.annotation).toBe('[TIER-2:TCS=10]');
    });

    it('should route boundary total=11 to pro (TIER-3)', () => {
      const result = ModelTierRouter.route(createMockTcs(11));
      expect(result.tier).toBe('pro');
      expect(result.tcsTotal).toBe(11);
      expect(result.annotation).toBe('[TIER-3:TCS=11]');
    });

    it('should route boundary total=15 to pro (TIER-3)', () => {
      const result = ModelTierRouter.route(createMockTcs(15));
      expect(result.tier).toBe('pro');
      expect(result.tcsTotal).toBe(15);
      expect(result.annotation).toBe('[TIER-3:TCS=15]');
    });

    it('should route boundary total=16 to pro-thinking (TIER-4)', () => {
      const result = ModelTierRouter.route(createMockTcs(16));
      expect(result.tier).toBe('pro-thinking');
      expect(result.tcsTotal).toBe(16);
      expect(result.annotation).toBe('[TIER-4:TCS=16]');
    });

    it('should route boundary total=20 to pro-thinking (TIER-4)', () => {
      const result = ModelTierRouter.route(createMockTcs(20));
      expect(result.tier).toBe('pro-thinking');
      expect(result.tcsTotal).toBe(20);
      expect(result.annotation).toBe('[TIER-4:TCS=20]');
    });
  });

  describe('formatAnnotation', () => {
    it('should format annotation correctly for flash-lite tier', () => {
      const annotation = ModelTierRouter.formatAnnotation(createMockTcs(4));
      expect(annotation).toBe('[TIER-1:TCS=4]');
    });

    it('should format annotation correctly for flash tier', () => {
      const annotation = ModelTierRouter.formatAnnotation(createMockTcs(8));
      expect(annotation).toBe('[TIER-2:TCS=8]');
    });

    it('should format annotation correctly for pro tier', () => {
      const annotation = ModelTierRouter.formatAnnotation(createMockTcs(13));
      expect(annotation).toBe('[TIER-3:TCS=13]');
    });

    it('should format annotation correctly for pro-thinking tier', () => {
      const annotation = ModelTierRouter.formatAnnotation(createMockTcs(18));
      expect(annotation).toBe('[TIER-4:TCS=18]');
    });
  });

  describe('Independence from tcs.source', () => {
    it('should route identically regardless of whether source is intelligence or heuristic', () => {
      const intelScore = createMockTcs(8, 'intelligence');
      const heurScore = createMockTcs(8, 'heuristic');

      const intelRoute = ModelTierRouter.route(intelScore);
      const heurRoute = ModelTierRouter.route(heurScore);

      expect(intelRoute).toEqual(heurRoute);
      expect(intelRoute.tier).toBe('flash');
      expect(intelRoute.annotation).toBe('[TIER-2:TCS=8]');
    });
  });
});
