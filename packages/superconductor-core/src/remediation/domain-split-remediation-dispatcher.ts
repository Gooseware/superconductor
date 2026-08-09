import { DomainClassifier, type Finding } from './domain-classifier.js';
import { ModelRoutingEnforcer, type ModelTier } from '../orchestration/model-routing-enforcer.js';

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
}

export interface DispatchOptions {
  trackId?: string;
  maxParallel?: number;
}

export interface SpawnedAgentInfo {
  agentId: string;
  domain: string;
  findings: Finding[];
  branch?: string;
  worktreePath?: string;
  model: ModelTier;
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

        const info: SpawnedAgentInfo = {
          agentId,
          domain,
          findings: domainFindings,
          branch,
          model,
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
