export type ModelTier = 'pro' | 'flash';

export interface ResolveModelOptions {
  complexity?: 'low' | 'high';
  worktreeIsolated?: boolean;
  [key: string]: any;
}

export class ModelRoutingEnforcer {
  /**
   * Resolves the model tier ('pro' | 'flash') for an agent given execution context.
   */
  resolveModel(agentId: string, options?: ResolveModelOptions): ModelTier {
    if (agentId === 'superconductor-oracle' || agentId === 'superconductor-dreamer') {
      return 'pro';
    }

    if (agentId === 'superconductor-processor') {
      if (options?.complexity === 'high' && !options?.worktreeIsolated) {
        return 'pro';
      }
      if (options?.complexity === 'low' && options?.worktreeIsolated) {
        return 'flash';
      }
      if (!options?.worktreeIsolated) {
        return 'pro';
      }
      return 'flash';
    }

    if (agentId === 'superconductor-reviewer') {
      return 'flash';
    }

    return 'flash';
  }

  /**
   * Escalates model tier when failures occur.
   * Fail count >= 2 triggers escalation to 'pro'.
   */
  escalate(agentId: string, failCount: number): ModelTier {
    if (failCount >= 2) {
      return 'pro';
    }
    return 'flash';
  }

  static resolveModel(agentId: string, options?: ResolveModelOptions): ModelTier {
    return new ModelRoutingEnforcer().resolveModel(agentId, options);
  }

  static escalate(agentId: string, failCount: number): ModelTier {
    return new ModelRoutingEnforcer().escalate(agentId, failCount);
  }
}
