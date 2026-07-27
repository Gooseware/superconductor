import { ModelTier } from '../intelligence/model-tier-router.js';
import { TaskComplexityScore } from '../intelligence/task-complexity-scorer.js';

export interface TokenBudgetEstimate {
  contextTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  reviewTokens: number;
  totalEstimate: number;
}

export interface TrackTokenBudget {
  perTask: TokenBudgetEstimate[];
  totalTokens: number;
  estimatedCostUSD: number;
  summary: string; // "~4.2M tokens · ~$0.84 at Flash rates"
}

const TIER_REASONING_TOKENS: Record<ModelTier, number> = {
  'flash-lite': 500,
  'flash': 1500,
  'pro': 4000,
  'pro-thinking': 8000,
};

const TIER_COST_PER_MILLION: Record<ModelTier, number> = {
  'flash-lite': 0.075,
  'flash': 0.15,
  'pro': 3.50,
  'pro-thinking': 10.00,
};

export class TokenBudgetEstimator {
  /**
   * Estimate token budget breakdown for a single task given its TCS and ModelTier.
   * Heuristics:
   * - contextTokens = tcs.contextLoad * 8000
   * - reasoningTokens = flash-lite: 500, flash: 1500, pro: 4000, pro-thinking: 8000
   * - outputTokens = tcs.testSurface * 200 + tcs.reasoningDepth * 500
   * - reviewTokens = outputTokens * 0.3
   * - totalEstimate = contextTokens + reasoningTokens + outputTokens + reviewTokens
   */
  static estimate(tcs: TaskComplexityScore, tier: ModelTier): TokenBudgetEstimate {
    const contextTokens = (tcs.contextLoad ?? 0) * 8000;
    const reasoningTokens = TIER_REASONING_TOKENS[tier] ?? 1500;
    const outputTokens = (tcs.testSurface ?? 0) * 200 + (tcs.reasoningDepth ?? 0) * 500;
    const reviewTokens = outputTokens * 0.3;
    const totalEstimate = contextTokens + reasoningTokens + outputTokens + reviewTokens;

    return {
      contextTokens,
      reasoningTokens,
      outputTokens,
      reviewTokens,
      totalEstimate,
    };
  }

  /**
   * Estimate token budget and cost across a track/list of tasks.
   */
  static estimateTrack(tasks: Array<{ tcs: TaskComplexityScore; tier: ModelTier }>): TrackTokenBudget {
    const perTask: TokenBudgetEstimate[] = [];
    let totalTokens = 0;
    let estimatedCostUSD = 0;

    const tiers = tasks.map(t => t.tier);

    for (const task of tasks) {
      const est = this.estimate(task.tcs, task.tier);
      perTask.push(est);
      totalTokens += est.totalEstimate;

      const rate = TIER_COST_PER_MILLION[task.tier] ?? 0.15;
      estimatedCostUSD += (est.totalEstimate / 1_000_000) * rate;
    }

    const budget: TrackTokenBudget = {
      perTask,
      totalTokens,
      estimatedCostUSD,
      summary: '',
    };

    budget.summary = this.formatCostEstimate(budget, tiers);
    return budget;
  }

  /**
   * Format human-readable cost estimate string.
   * Format: "~4.2M tokens · ~$0.84 at blended rates"
   */
  static formatCostEstimate(budget: TrackTokenBudget, tiers?: ModelTier[]): string {
    if (budget.totalTokens === 0) {
      return '~0.0M tokens · ~$0.00';
    }

    const millions = (budget.totalTokens / 1_000_000).toFixed(1);
    const dollars = budget.estimatedCostUSD.toFixed(2);

    let rateSuffix = 'at blended rates';

    if (tiers && tiers.length > 0) {
      const allFlash = tiers.every(t => t === 'flash');
      const allFlashLite = tiers.every(t => t === 'flash-lite');
      const allPro = tiers.every(t => t === 'pro');
      const allProThinking = tiers.every(t => t === 'pro-thinking');

      if (allFlash) {
        rateSuffix = 'at Flash rates';
      } else if (allFlashLite) {
        rateSuffix = 'at Flash-Lite rates';
      } else if (allPro) {
        rateSuffix = 'at Pro rates';
      } else if (allProThinking) {
        rateSuffix = 'at Pro-Thinking rates';
      } else {
        rateSuffix = 'at blended rates';
      }
    } else {
      const ratePerMillion = (budget.estimatedCostUSD / budget.totalTokens) * 1_000_000;
      if (Math.abs(ratePerMillion - 0.15) < 1e-4) {
        rateSuffix = 'at Flash rates';
      } else if (Math.abs(ratePerMillion - 0.075) < 1e-4) {
        rateSuffix = 'at Flash-Lite rates';
      } else if (Math.abs(ratePerMillion - 3.50) < 1e-4) {
        rateSuffix = 'at Pro rates';
      } else if (Math.abs(ratePerMillion - 10.00) < 1e-4) {
        rateSuffix = 'at Pro-Thinking rates';
      } else {
        rateSuffix = 'at blended rates';
      }
    }

    return `~${millions}M tokens · ~$${dollars} ${rateSuffix}`;
  }
}
