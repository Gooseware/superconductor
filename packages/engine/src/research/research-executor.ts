import * as fs from 'fs';
import * as path from 'path';
import { IResearchProvider, IResearchQuery, IResearchBrief, IResearchSource } from './types.js';
import { SemanticCache } from '@superconductor/core/src/cache/semantic-cache.js';
import { WorkUnit, WorkUnitState, WorkUnitStateMachine } from '@superconductor/core/src/track/work-unit.js';
import { ResearchBudgetExceededError } from './errors/research-budget-exceeded-error.js';
import { ResearchProviderUnavailableError } from './errors/research-provider-unavailable-error.js';
import { ResearchBriefSynthesizer } from './brief-synthesizer.js';
import { sanitizeUntrustedText } from '@superconductor/core/src/utils/input-sanitizer.js';
import { ResearchSourceQualityGate } from './source-quality-gate.js';

export class ResearchExecutor {
    private cache: SemanticCache<IResearchBrief>;
    private qualityGate: ResearchSourceQualityGate;
    
    // removed private synthesizer to fix COR-4 race condition
    constructor(
        private workspaceDir: string, 
        private executeTool: (toolName: string, args: any) => Promise<any> = async () => [],
        private executeLlmTool?: (prompt: string) => Promise<any>
    ) {
        const cacheDir = path.join(this.workspaceDir, '.superconductor', 'cache');
        this.cache = new SemanticCache<IResearchBrief>('research-briefs', 0.85, cacheDir);
        this.qualityGate = new ResearchSourceQualityGate();
    }

    public async execute(
        trackId: string, 
        queries: IResearchQuery[], 
        provider: IResearchProvider,
        workUnit?: WorkUnit
    ): Promise<{ brief: IResearchBrief; updatedWorkUnit?: WorkUnit }> {
        if (queries.length > 3) {
            throw new ResearchBudgetExceededError('Cost cap exceeded: max 3 queries per track allowed');
        }

        let updatedWorkUnit = workUnit;
        if (workUnit) {
            const sm = new WorkUnitStateMachine();
            updatedWorkUnit = sm.transition(workUnit, WorkUnitState.RESEARCHING);
        }

        const cacheKey = JSON.stringify({ trackId, queries }); // Includes trackId to prevent cross-track leakage (REG-2)
        const cached = await this.cache.get(cacheKey);
        
        // Sanitize trackId to prevent Path Traversal (SEC-1)
        const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '');
        const outDir = path.join(this.workspaceDir, '.superconductor', 'research', safeTrackId);
        
        if (cached) {
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }
            fs.writeFileSync(path.join(outDir, 'brief.json'), JSON.stringify(cached, null, 2), 'utf8'); // Restore brief.json on cache hit (REG-5)
            return { brief: cached, updatedWorkUnit };
        }

        const results: IResearchSource[] = [];
        let fallbackFailed = false;

        try {
            for (const query of queries) {
                const searchResults = await provider.search(query);
                results.push(...searchResults);
            }
        } catch (error) {
            if (error instanceof ResearchProviderUnavailableError) {
                console.warn('[ResearchExecutor] Degraded mode: Provider unavailable, falling back to standard search_web');
                let successfulFallback = false;
                let lastFallbackError: any = null;
                for (const query of queries) {
                    try {
                        const rawResults = await this.executeTool('search_web', { query: query.term });
                        const rawString = typeof rawResults === 'string' ? rawResults : String(rawResults);
                        if (rawString.trim().length > 0) {
                            results.push({
                                url: `<untrusted_research_results>fallback-search</untrusted_research_results>`,
                                title: `<untrusted_research_results>${sanitizeUntrustedText(rawString)}</untrusted_research_results>`,
                            });
                        }
                    } catch (fallbackError) {
                        console.error('[ResearchExecutor] Fallback search_web also failed:', fallbackError);
                        throw fallbackError;
                    }
                }
            } else {
                throw error;
            }
        }

        if (fallbackFailed && results.length === 0) {
            throw new Error('FallbackFailedError: Both primary and fallback providers failed.'); // Explicit failure (COR-3, ADV-2)
        }

        if (results.length === 0) {
            throw new Error('No research sources found');
        }

        const synthesizer = new ResearchBriefSynthesizer(outDir, this.executeLlmTool); // Local var (COR-4)
        
        const brief = await synthesizer.synthesize(results, trackId, queries.map(q => q.term));
        brief.queriesExecuted = queries.map(q => q.term);

        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(outDir, 'brief.json'), JSON.stringify(brief, null, 2), 'utf8');

        await this.cache.set(cacheKey, brief);

        return { brief, updatedWorkUnit };
    }
}
