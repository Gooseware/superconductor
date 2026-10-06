import { DomainClassifier, type Finding } from './domain-classifier.js';
import { ModelRoutingEnforcer, type ModelTier } from '../orchestration/model-routing-enforcer.js';
import {
  INVARIANT_REMEDIATION_DOGMA,
  buildRemediationSystemPrompt,
  getDomainInceptionHint,
} from './prompts/invariant-remediation-dogma.js';

export interface WorktreeManagerLike {
  allocate(agentId: string, trackId: string): Promise<string>;
  release?(agentId: string): Promise<void>;
  [key: string]: any;
}

export type AgentSpawnerFn = (info: SpawnedAgentInfo) => Promise<any>;

export interface DomainSplitDispatcherOptions {
  worktreeManager?: WorktreeManagerLike;
  spawner?: AgentSpawnerFn;
  domainMap?: Record<string, string>;
  domainClassifier?: DomainClassifier;
  modelRouter?: ModelRoutingEnforcer;
  basePrompt?: string;
  systemPrompt?: string;
}

export interface DispatchOptions {
  trackId?: string;
  maxParallel?: number;
  basePrompt?: string;
  systemPrompt?: string;
}

export interface SpawnedAgentInfo {
  agentId: string;
  domain: string;
  findings: Finding[];
  branch?: string;
  worktreePath?: string;
  model: ModelTier;
  prompt?: string;
  systemPrompt?: string;
}

export interface DispatchResult {
  spawned: SpawnedAgentInfo[];
  queued: { domain: string; findings: Finding[] }[];
}

function severityToComplexity(severity?: string): 'low' | 'high' {
  return severity && ['critical', 'high'].includes(severity.toLowerCase()) ? 'high' : 'low';
}

export class DomainSplitRemediationDispatcher {
  private domainClassifier: DomainClassifier;
  private modelRouter: ModelRoutingEnforcer;

  constructor(private options: DomainSplitDispatcherOptions = {}) {
    this.domainClassifier =
      options.domainClassifier || new DomainClassifier(options.domainMap);
    this.modelRouter = options.modelRouter || new ModelRoutingEnforcer();
  }

  async dispatch(
    findings: Finding[],
    options: DispatchOptions = {}
  ): Promise<DispatchResult> {
    const trackId = options.trackId || 'remediation-track';
    const maxParallel = options.maxParallel ?? 6;

    const grouped = this.domainClassifier.groupByDomain(findings);
    const domainEntries = Object.entries(grouped);

    const activeEntries = domainEntries.slice(0, maxParallel);
    const queuedEntries = domainEntries.slice(maxParallel);

    const spawned = await Promise.all(
      activeEntries.map(async ([domain, domainFindings]) => {
        const agentId = `remediator-${domain}`;
        const worktreeIsolated = !!this.options.worktreeManager;
        const complexity = severityToComplexity(domainFindings[0]?.severity);

        const model = this.modelRouter.resolveModel('superconductor-processor', {
          complexity,
          worktreeIsolated,
        });

        let branch: string | undefined;
        if (this.options.worktreeManager) {
          branch = await this.options.worktreeManager.allocate(agentId, trackId);
        }

        const basePrompt =
          options.systemPrompt ||
          options.basePrompt ||
          this.options.systemPrompt ||
          this.options.basePrompt ||
          `You are a Superconductor Remediator Subagent (${domain}). Your mission is to remediate ${domainFindings.length} findings in the '${domain}' domain.`;

        const generatedPrompt = buildRemediationSystemPrompt(basePrompt, {
          domain,
          findings: domainFindings,
        });

        const info: SpawnedAgentInfo = {
          agentId,
          domain,
          findings: domainFindings,
          branch,
          model,
          prompt: generatedPrompt,
          systemPrompt: generatedPrompt,
        };

        if (this.options.spawner) {
          await this.options.spawner(info);
        }

        return info;
      })
    );

    const queued = queuedEntries.map(([domain, domainFindings]) => ({
      domain,
      findings: domainFindings,
    }));

    return {
      spawned,
      queued,
    };
  }
}
