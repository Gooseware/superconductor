import { describe, it, expect } from 'vitest';
import { TokenBudgetEstimator, TrackTokenBudget } from '../../src/telemetry/token-budget-estimator.js';
import { TaskComplexityScore } from '../../src/intelligence/task-complexity-scorer.js';
import { ModelTier } from '../../src/intelligence/model-tier-router.js';

describe('TokenBudgetEstimator', () => {
  const createMockTcs = (
    contextLoad: number,
    reasoningDepth: number,
    testSurface: number,
    crossCuttingRisk = 0
  ): TaskComplexityScore => ({
    contextLoad,
    reasoningDepth,
    crossCuttingRisk,
    testSurface,
    total: contextLoad + reasoningDepth + crossCuttingRisk + testSurface,
    source: 'intelligence',
  });

  describe('estimate() per tier heuristics', () => {
    it('should correctly calculate sub-estimates for flash-lite tier', () => {
      const tcs = createMockTcs(2, 1, 3);
      const est = TokenBudgetEstimator.estimate(tcs, 'flash-lite');

      expect(est.contextTokens).toBe(16000); // 2 * 8000
      expect(est.reasoningTokens).toBe(500); // flash-lite
      expect(est.outputTokens).toBe(1100); // 3*200 + 1*500
      expect(est.reviewTokens).toBe(330); // 1100 * 0.3
      expect(est.totalEstimate).toBe(17930); // 16000 + 500 + 1100 + 330
    });

    it('should correctly calculate sub-estimates for flash tier', () => {
      const tcs = createMockTcs(3, 2, 4);
      const est = TokenBudgetEstimator.estimate(tcs, 'flash');

      expect(est.contextTokens).toBe(24000); // 3 * 8000
      expect(est.reasoningTokens).toBe(1500); // flash
      expect(est.outputTokens).toBe(1800); // 4*200 + 2*500
      expect(est.reviewTokens).toBe(540); // 1800 * 0.3
      expect(est.totalEstimate).toBe(27840); // 24000 + 1500 + 1800 + 540
    });

    it('should correctly calculate sub-estimates for pro tier', () => {
      const tcs = createMockTcs(4, 4, 3);
      const est = TokenBudgetEstimator.estimate(tcs, 'pro');

      expect(est.contextTokens).toBe(32000); // 4 * 8000
      expect(est.reasoningTokens).toBe(4000); // pro
      expect(est.outputTokens).toBe(2600); // 3*200 + 4*500
      expect(est.reviewTokens).toBe(780); // 2600 * 0.3
      expect(est.totalEstimate).toBe(39380); // 32000 + 4000 + 2600 + 780
    });

    it('should correctly calculate sub-estimates for pro-thinking tier', () => {
      const tcs = createMockTcs(5, 5, 5);
      const est = TokenBudgetEstimator.estimate(tcs, 'pro-thinking');

      expect(est.contextTokens).toBe(40000); // 5 * 8000
      expect(est.reasoningTokens).toBe(8000); // pro-thinking
      expect(est.outputTokens).toBe(3500); // 5*200 + 5*500
      expect(est.reviewTokens).toBe(1050); // 3500 * 0.3
      expect(est.totalEstimate).toBe(52550); // 40000 + 8000 + 3500 + 1050
    });
  });

  describe('Cost calculation accuracy per tier', () => {
    it('should accurately calculate costs for flash-lite ($0.075/1M)', () => {
      const tcs = createMockTcs(2, 1, 3);
      const tasks = [{ tcs, tier: 'flash-lite' as ModelTier }];
      const budget = TokenBudgetEstimator.estimateTrack(tasks);

      const expectedCost = (17930 / 1_000_000) * 0.075;
      expect(budget.estimatedCostUSD).toBeCloseTo(expectedCost, 6);
    });

    it('should accurately calculate costs for flash ($0.15/1M)', () => {
      const tcs = createMockTcs(3, 2, 4);
      const tasks = [{ tcs, tier: 'flash' as ModelTier }];
      const budget = TokenBudgetEstimator.estimateTrack(tasks);

      const expectedCost = (27840 / 1_000_000) * 0.15;
      expect(budget.estimatedCostUSD).toBeCloseTo(expectedCost, 6);
    });

    it('should accurately calculate costs for pro ($3.50/1M)', () => {
      const tcs = createMockTcs(4, 4, 3);
      const tasks = [{ tcs, tier: 'pro' as ModelTier }];
      const budget = TokenBudgetEstimator.estimateTrack(tasks);

      const expectedCost = (39380 / 1_000_000) * 3.50;
      expect(budget.estimatedCostUSD).toBeCloseTo(expectedCost, 6);
    });

    it('should accurately calculate costs for pro-thinking ($10.00/1M)', () => {
      const tcs = createMockTcs(5, 5, 5);
      const tasks = [{ tcs, tier: 'pro-thinking' as ModelTier }];
      const budget = TokenBudgetEstimator.estimateTrack(tasks);

      const expectedCost = (52550 / 1_000_000) * 10.00;
      expect(budget.estimatedCostUSD).toBeCloseTo(expectedCost, 6);
    });
  });

  describe('estimateTrack()', () => {
    it('should aggregate 3 tasks of different tiers correctly', () => {
      const t1 = { tcs: createMockTcs(2, 1, 2), tier: 'flash-lite' as ModelTier }; // total: 17670, cost: 17670 * 0.075 / 1e6 = 0.00132525
      const t2 = { tcs: createMockTcs(3, 2, 3), tier: 'flash' as ModelTier };     // total: 27580, cost: 27580 * 0.15 / 1e6 = 0.004137
      const t3 = { tcs: createMockTcs(4, 4, 3), tier: 'pro' as ModelTier };       // total: 39380, cost: 39380 * 3.50 / 1e6 = 0.13783

      const budget = TokenBudgetEstimator.estimateTrack([t1, t2, t3]);

      expect(budget.perTask.length).toBe(3);
      expect(budget.perTask[0].totalEstimate).toBe(17670);
      expect(budget.perTask[1].totalEstimate).toBe(27580);
      expect(budget.perTask[2].totalEstimate).toBe(39380);

      const expectedTotalTokens = 17670 + 27580 + 39380; // 84630
      expect(budget.totalTokens).toBe(expectedTotalTokens);

      const expectedTotalCost = 0.00132525 + 0.004137 + 0.13783; // ~0.14329225
      expect(budget.estimatedCostUSD).toBeCloseTo(expectedTotalCost, 6);

      expect(budget.summary).toBe('~0.1M tokens · ~$0.14 at blended rates');
    });
  });

  describe('formatCostEstimate()', () => {
    it('should format empty plan (0 tasks) boundary correctly', () => {
      const emptyBudget: TrackTokenBudget = {
        perTask: [],
        totalTokens: 0,
        estimatedCostUSD: 0,
        summary: '',
      };

      const formatted = TokenBudgetEstimator.formatCostEstimate(emptyBudget);
      expect(formatted).toBe('~0.0M tokens · ~$0.00');
    });

    it('should format flash rates correctly when all tasks are flash', () => {
      const budget: TrackTokenBudget = {
        perTask: [],
        totalTokens: 4_200_000,
        estimatedCostUSD: 0.63,
        summary: '',
      };

      const formatted = TokenBudgetEstimator.formatCostEstimate(budget, ['flash', 'flash']);
      expect(formatted).toBe('~4.2M tokens · ~$0.63 at Flash rates');
    });

    it('should format blended rates correctly when tasks are mixed', () => {
      const budget: TrackTokenBudget = {
        perTask: [],
        totalTokens: 4_200_000,
        estimatedCostUSD: 0.84,
        summary: '',
      };

      const formatted = TokenBudgetEstimator.formatCostEstimate(budget, ['flash', 'pro']);
      expect(formatted).toBe('~4.2M tokens · ~$0.84 at blended rates');
    });

    it('should format cost estimate directly from budget without explicit tiers argument', () => {
      const budgetFlash: TrackTokenBudget = {
        perTask: [],
        totalTokens: 1_000_000,
        estimatedCostUSD: 0.15,
        summary: '',
      };
      expect(TokenBudgetEstimator.formatCostEstimate(budgetFlash)).toBe('~1.0M tokens · ~$0.15 at Flash rates');

      const budgetMixed: TrackTokenBudget = {
        perTask: [],
        totalTokens: 4_200_000,
        estimatedCostUSD: 0.84,
        summary: '',
      };
      expect(TokenBudgetEstimator.formatCostEstimate(budgetMixed)).toBe('~4.2M tokens · ~$0.84 at blended rates');
    });
  });
});
