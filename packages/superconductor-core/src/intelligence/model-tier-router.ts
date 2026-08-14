import { TaskComplexityScore } from './task-complexity-scorer.js';

export type ModelTier = 'flash-lite' | 'flash' | 'pro' | 'pro-thinking';

export interface TierAnnotation {
  tier: ModelTier;
  tcsTotal: number;
  annotation: string; // e.g. "[TIER-1:TCS=4]"
}

export const DEFAULT_ROLE_TIER_MAP: Record<string, ModelTier> = {
  'superconductor-processor': 'flash',
  'superconductor-reviewer': 'flash',
  'superconductor-reviewer (quorum)': 'flash',
  'superconductor-dreamer': 'pro',
  'superconductor-oracle': 'pro-thinking',
  'remediation-processor': 'flash',
};

export const DEFAULT_ROLE_MODEL_MAP: Record<string, string> = {
  'superconductor-processor': 'gemini-3.6-flash-high',
  'superconductor-reviewer': 'gemini-3.6-flash-high',
  'superconductor-reviewer (quorum)': 'gemini-3.6-flash-high',
  'superconductor-dreamer': 'gemini-3.1-pro-high',
  'superconductor-oracle': 'gemini-3.1-pro-high',
  'remediation-processor': 'gemini-3.6-flash-high',
};

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

  /**
   * Returns default model tier associated with a specific Superconductor role.
   */
  static getTierForRole(role: string): ModelTier {
    return DEFAULT_ROLE_TIER_MAP[role] || 'flash';
  }

  /**
   * Resolves the configured or default model identifier for a specific role.
   */
  static resolveRoleModel(
    role: string,
    customConfig?: { roles?: Record<string, string> } | Record<string, string>
  ): string {
    if (customConfig) {
      const roles: Record<string, string> | undefined =
        typeof customConfig === 'object' && 'roles' in customConfig && customConfig.roles
          ? (customConfig.roles as Record<string, string>)
          : (customConfig as Record<string, string>);

      if (roles && roles[role]) {
        return roles[role];
      }
      if (role === 'superconductor-reviewer' && roles && roles['superconductor-reviewer (quorum)']) {
        return roles['superconductor-reviewer (quorum)'];
      }
    }
    return DEFAULT_ROLE_MODEL_MAP[role] || 'gemini-3.6-flash-high';
  }

  /**
   * Convenience alias for resolveRoleModel.
   */
  static getRoleModel(role: string, customConfig?: Record<string, string>): string {
    return this.resolveRoleModel(role, customConfig);
  }

  /**
   * Returns a copy of the default role-to-tier map.
   */
  static getRoleTierMap(): Record<string, ModelTier> {
    return { ...DEFAULT_ROLE_TIER_MAP };
  }

  /**
   * Returns a copy of the default role-to-model map.
   */
  static getRoleModelMap(): Record<string, string> {
    return { ...DEFAULT_ROLE_MODEL_MAP };
  }
}
