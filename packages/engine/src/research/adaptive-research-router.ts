import * as fs from 'fs';
import * as path from 'path';
import { IResearchProvider, IResearchQuery, IResearchBrief, IResearchSource } from './types.js';
import { CircuitBreaker, CircuitBreakerOpenError } from './circuit-breaker.js';
import { ResearchProviderRegistry, ResearchProviderOptions } from './provider-registry.js';
import { ResearchBriefSynthesizer } from './brief-synthesizer.js';
import { AgentConfigReader } from './agent-config-reader.js';
import { FallbackFailedError } from './errors/fallback-failed-error.js';
import { ResearchBudgetExceededError } from './errors/research-budget-exceeded-error.js';
import { ResearchProviderUnavailableError } from './errors/research-provider-unavailable-error.js';

export type ResearchIntent = 'INTERNAL' | 'ECOSYSTEM' | 'FRONTIER';
export type ResearchMode = 'auto' | 'deerflow-preferred' | 'gemini-preferred' | 'internal-only';

export interface ResearchRoutingDecision {
  intent: ResearchIntent;
  selectedProvider: string;
  rationale: string;
  fallbackChain: string[];
  effectiveMode?: string;
}

export interface DetermineRouteOptions {
  researchMode?: ResearchMode;
  forceProvider?: string;
  exhaustive?: boolean;
  apiKey?: string;
  workspaceDir?: string;
}

export interface ExecuteResearchOptions extends DetermineRouteOptions {
  executeTool?: (name: string, args: any) => Promise<any>;
  executeLlmTool?: (prompt: string) => Promise<any>;
  providerOptions?: ResearchProviderOptions;
  provider?: IResearchProvider;
}

export interface AdaptiveResearchRouterOptions {
  workspaceDir?: string;
  providerRegistry?: ResearchProviderRegistry;
  executeTool?: (toolName: string, params: Record<string, unknown>) => Promise<unknown>;
  executeLlmTool?: (prompt: string) => Promise<unknown>;
  clock?: () => number;
  circuitBreakers?: Map<string, CircuitBreaker>;
}

export class AdaptiveResearchRouter {
  private workspaceDir: string;
  private providerRegistry: ResearchProviderRegistry;
  private executeTool: (toolName: string, params: Record<string, unknown>) => Promise<unknown>;
  private executeLlmTool?: (prompt: string) => Promise<unknown>;
  private clock: () => number;
  private circuitBreakers: Map<string, CircuitBreaker>;

  constructor(options: AdaptiveResearchRouterOptions = {}) {
    this.workspaceDir = options.workspaceDir || process.cwd();
    this.providerRegistry = options.providerRegistry || new ResearchProviderRegistry();
    this.executeTool = options.executeTool || (async () => []);
    this.executeLlmTool = options.executeLlmTool;
    this.clock = options.clock || (() => Date.now());
    this.circuitBreakers = options.circuitBreakers || new Map();
  }

  public getCircuitBreaker(providerName: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(providerName);
    if (!breaker) {
      breaker = new CircuitBreaker({
        name: providerName,
        failureThreshold: 2,
        cooldownMs: 60000,
        clock: this.clock
      });
      this.circuitBreakers.set(providerName, breaker);
    }
    return breaker;
  }

  public classifyIntent(query: string | IResearchQuery): ResearchIntent {
    let term = '';
    if (typeof query === 'string') {
      term = query;
    } else if (query && typeof query === 'object') {
      if (query.intent) {
        const normalized = query.intent.toUpperCase();
        if (normalized === 'INTERNAL' || normalized === 'ECOSYSTEM' || normalized === 'FRONTIER') {
          return normalized as ResearchIntent;
        }
      }
      term = query.term || '';
    }

    // Check FRONTIER signals (explicit exhaustive/deep research)
    const frontierRegex = /(?:--exhaustive|--deep|\b(?:exhaustive|frontier|deep[\s_-]research|theoretical|multi[\s_-]domain|cross[\s_-]domain)\b)/i;
    if (frontierRegex.test(term)) {
      return 'FRONTIER';
    }

    // Check INTERNAL signals
    const internalExtRegex = /\.(?:ts|tsx|js|jsx|json|md|py|go|rs|toml|ya?ml)\b/i;
    const internalKeywordsRegex = /(?:\bsrc\/|\bpackages\/|\blib\/|\btests?\/|\bcodebase\b|\bworkspace\b|\binvariants?\b|\brefactor(?:ing)?\b|\bexisting\s+code\b|\bsymbols?\b|\bclass\s+\w+|\bfunction\s+\w+|\binterface\s+\w+|\binternal\b)/i;
    if (internalExtRegex.test(term) || internalKeywordsRegex.test(term)) {
      return 'INTERNAL';
    }

    // Default to ECOSYSTEM for track planning
    return 'ECOSYSTEM';
  }

  public determineRoute(
    query: IResearchQuery,
    options?: DetermineRouteOptions
  ): ResearchRoutingDecision {
    let intent: ResearchIntent;
    if (options?.exhaustive) {
      intent = 'FRONTIER';
    } else {
      intent = this.classifyIntent(query);
    }

    const workspaceDir = options?.workspaceDir || this.workspaceDir;
    let mode = options?.researchMode;
    if (!mode && workspaceDir) {
      mode = AgentConfigReader.getResearchMode(workspaceDir);
    }
    const effectiveMode: ResearchMode = mode || 'auto';

    const apiKey = options?.apiKey || process.env.GEMINI_API_KEY;
    const hasGeminiKey = Boolean(apiKey && apiKey.trim().length > 0);

    const isGeminiFamily = (provider: string) =>
      ['gemini-api-deep-research', 'gemini_api_deep_research', 'vertex-ai-deep-research', 'vertex_ai_deep_research', 'google'].includes(provider);

    // 1. User forced provider override
    if (options?.forceProvider) {
      const forced = options.forceProvider;
      if (isGeminiFamily(forced) && !hasGeminiKey) {
        return {
          intent,
          selectedProvider: 'deerflow',
          rationale: `GEMINI_API_KEY is missing for forced provider '${forced}'; auto-rerouted to deerflow.`,
          fallbackChain: ['deerflow', 'search_web'],
          effectiveMode
        };
      }
      return {
        intent,
        selectedProvider: forced,
        rationale: `User forced provider: ${forced}.`,
        fallbackChain: forced === 'deerflow'
          ? (hasGeminiKey ? ['deerflow', 'gemini-api-deep-research', 'search_web'] : ['deerflow', 'search_web'])
          : [forced, 'deerflow', 'search_web'],
        effectiveMode
      };
    }

    // 2. Internal-only mode
    if (effectiveMode === 'internal-only') {
      return {
        intent,
        selectedProvider: 'internal',
        rationale: 'Internal-only research mode active; external providers bypassed.',
        fallbackChain: ['internal'],
        effectiveMode
      };
    }

    // 3. Gemini-preferred mode
    if (effectiveMode === 'gemini-preferred') {
      if (hasGeminiKey) {
        return {
          intent,
          selectedProvider: 'gemini-api-deep-research',
          rationale: 'Gemini-preferred mode active with verified GEMINI_API_KEY.',
          fallbackChain: ['gemini-api-deep-research', 'deerflow', 'search_web'],
          effectiveMode
        };
      } else {
        return {
          intent,
          selectedProvider: 'deerflow',
          rationale: 'Gemini-preferred mode requested but GEMINI_API_KEY is missing; auto-rerouted to deerflow.',
          fallbackChain: ['deerflow', 'search_web'],
          effectiveMode
        };
      }
    }

    // 4. DeerFlow-preferred mode
    if (effectiveMode === 'deerflow-preferred') {
      return {
        intent,
        selectedProvider: 'deerflow',
        rationale: 'DeerFlow-preferred mode active.',
        fallbackChain: hasGeminiKey ? ['deerflow', 'gemini-api-deep-research', 'search_web'] : ['deerflow', 'search_web'],
        effectiveMode
      };
    }

    // 5. Auto mode (default)
    if (intent === 'INTERNAL') {
      return {
        intent,
        selectedProvider: 'internal',
        rationale: 'Internal codebase query detected; routed to internal intelligence.',
        fallbackChain: hasGeminiKey ? ['internal', 'deerflow', 'gemini-api-deep-research', 'search_web'] : ['internal', 'deerflow', 'search_web'],
        effectiveMode
      };
    }

    if (intent === 'FRONTIER') {
      if (hasGeminiKey) {
        return {
          intent,
          selectedProvider: 'gemini-api-deep-research',
          rationale: 'Frontier reasoning query detected; routed to Gemini Deep Research.',
          fallbackChain: ['gemini-api-deep-research', 'deerflow', 'search_web'],
          effectiveMode
        };
      } else {
        return {
          intent,
          selectedProvider: 'deerflow',
          rationale: 'Frontier reasoning query detected but GEMINI_API_KEY is missing; auto-rerouted to deerflow.',
          fallbackChain: ['deerflow', 'search_web'],
          effectiveMode
        };
      }
    }

    // Default ECOSYSTEM
    return {
      intent,
      selectedProvider: 'deerflow',
      rationale: 'Ecosystem discovery query detected; routed to DeerFlow.',
      fallbackChain: hasGeminiKey ? ['deerflow', 'gemini-api-deep-research', 'search_web'] : ['deerflow', 'search_web'],
      effectiveMode
    };
  }

  public async executeResearch(
    trackId: string,
    queries: IResearchQuery[],
    options?: ExecuteResearchOptions
  ): Promise<{ brief: IResearchBrief; decision: ResearchRoutingDecision }> {
    if (queries.length > 3) {
      throw new ResearchBudgetExceededError('Cost cap exceeded: max 3 queries per track allowed');
    }

    const primaryQuery = queries[0] || { term: '' };
    const decision = this.determineRoute(primaryQuery, options);

    const workspaceDir = options?.workspaceDir || this.workspaceDir;
    const executeTool = options?.executeTool || this.executeTool;
    const executeLlmTool = options?.executeLlmTool || this.executeLlmTool;

    const candidateProviders: string[] = [];
    if (decision.selectedProvider) {
      candidateProviders.push(decision.selectedProvider);
    }
    for (const p of decision.fallbackChain) {
      if (!candidateProviders.includes(p)) {
        candidateProviders.push(p);
      }
    }

    const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '') || 'default-track';
    const outDir = path.join(workspaceDir, '.superconductor', 'research', safeTrackId);
    const errors: Error[] = [];

    for (const candidate of candidateProviders) {
      // 1. Internal
      if (candidate === 'internal') {
        try {
          const results: IResearchSource[] = [];
          for (const q of queries) {
            results.push({
              type: 'community',
              url: `workspace://${q.term.replace(/\s+/g, '-')}`,
              title: `Internal Intelligence for: ${q.term}`,
              content: `Internal codebase context for query: ${q.term}`
            });
          }
          const synthesizer = new ResearchBriefSynthesizer(outDir, executeLlmTool);
          const brief = await synthesizer.synthesize(results, trackId, queries.map(q => q.term));
          this.writeBriefFile(outDir, brief);
          return { brief, decision };
        } catch (err: any) {
          errors.push(err);
          continue;
        }
      }

      // 2. search_web
      if (candidate === 'search_web') {
        try {
          const results: IResearchSource[] = [];
          for (const q of queries) {
            const raw = await executeTool('search_web', { query: q.term });
            const rawString = typeof raw === 'string' ? raw : JSON.stringify(raw);
            if (rawString && rawString.trim().length > 0) {
              results.push({
                type: 'community',
                url: 'https://search.web/results',
                title: rawString,
                content: rawString
              });
            }
          }
          if (results.length > 0) {
            const synthesizer = new ResearchBriefSynthesizer(outDir, executeLlmTool);
            const brief = await synthesizer.synthesize(results, trackId, queries.map(q => q.term));
            this.writeBriefFile(outDir, brief);
            return { brief, decision };
          }
        } catch (err: any) {
          errors.push(err);
          continue;
        }
      }

      // 3. Registry-backed external providers
      const breaker = this.getCircuitBreaker(candidate);
      if (breaker.isOpen()) {
        console.warn(`[AdaptiveResearchRouter] Circuit breaker for ${candidate} is OPEN. Skipping to fallback.`);
        continue;
      }

      try {
        const brief = await breaker.execute(async () => {
          let provider: IResearchProvider;
          if (options?.provider) {
            provider = options.provider;
          } else {
            provider = this.providerRegistry.resolve(candidate, options?.providerOptions, executeTool);
          }

          const results: IResearchSource[] = [];
          for (const q of queries) {
            const searchResults = await provider.search(q);
            for (const s of searchResults) {
              results.push(s);
            }
          }

          if (results.length === 0) {
            throw new ResearchProviderUnavailableError(`Provider ${candidate} returned no sources`);
          }

          const synthesizer = new ResearchBriefSynthesizer(outDir, executeLlmTool);
          const synthesizedBrief = await synthesizer.synthesize(results, trackId, queries.map(q => q.term));
          this.writeBriefFile(outDir, synthesizedBrief);
          return synthesizedBrief;
        });

        return { brief, decision };
      } catch (err: any) {
        console.warn(`[AdaptiveResearchRouter] Provider ${candidate} failed: ${err.message}. Cascading to fallback.`);
        errors.push(err);
      }
    }

    throw new FallbackFailedError(
      'All research providers in fallback chain failed: ' + errors.map(e => e.message).join('; '),
      errors[0],
      errors[errors.length - 1]
    );
  }

  private writeBriefFile(outDir: string, brief: IResearchBrief): void {
    try {
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      fs.writeFileSync(path.join(outDir, 'brief.json'), JSON.stringify(brief, null, 2), 'utf8');
    } catch {
      // Best-effort in environments where fs is mocked
    }
  }
}
