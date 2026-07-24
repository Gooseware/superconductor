import { TaskComplexityScore } from './task-complexity-scorer.js';

export type ModelTier = 'flash-lite' | 'flash' | 'pro' | 'pro-thinking';

export interface TierAnnotation {
  tier: ModelTier;
  tcsTotal: number;
  annotation: string; // e.g. "[TIER-1:TCS=4]"
}

export class ModelTierRouter {
  /**
   * Route a task to the appropriate model tier based on TCS total.
   * Bands: 0-5 -> flash-lite (TIER-1), 6-10 -> flash (TIER-2),
   *        11-15 -> pro (TIER-3), 16-20 -> pro-thinking (TIER-4)
   */
  static route(tcs: TaskComplexityScore): TierAnnotation {
    const total = tcs.total;
    let tier: ModelTier;
    let tierNum: number;

    if (total <= 5) {
      tier = 'flash-lite';
      tierNum = 1;
    } else if (total <= 10) {
      tier = 'flash';
      tierNum = 2;
    } else if (total <= 15) {
      tier = 'pro';
      tierNum = 3;
    } else {
      tier = 'pro-thinking';
      tierNum = 4;
    }

    const annotation = `[TIER-${tierNum}:TCS=${total}]`;

    return {
      tier,
      tcsTotal: total,
      annotation,
    };
  }

  /**
   * Format the tier annotation string for injection into plan.md
   * Format: "[TIER-N:TCS=<total>]" where N is 1-4
   */
  static formatAnnotation(tcs: TaskComplexityScore): string {
    return this.route(tcs).annotation;
  }
}
