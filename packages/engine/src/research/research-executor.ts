import * as fs from 'fs';
import * as path from 'path';
import { IResearchProvider, IResearchQuery, IResearchBrief, IResearchSource } from './types.js';
import { SemanticCache } from '@superconductor/core/src/cache/semantic-cache.js';
import { WorkUnit, WorkUnitState, WorkUnitStateMachine } from '@superconductor/core/src/track/work-unit.js';
import { ResearchBudgetExceededError } from './errors/research-budget-exceeded-error.js';
import { ResearchProviderUnavailableError } from './errors/research-provider-unavailable-error.js';
import { ResearchBriefSynthesizer } from './brief-synthesizer.js';
import { sanitizeUntrustedText } from '@superconductor/core/src/utils/input-sanitizer.js';

export class ResearchExecutor {
    private cache: SemanticCache<IResearchBrief>;
    private synthesizer: ResearchBriefSynthesizer;
    
    constructor(
        private workspaceDir: string, 
        private executeTool: (toolName: string, args: any) => Promise<any> = async () => [],
        private executeLlmTool?: (prompt: string) => Promise<any>
    ) {
        const cacheDir = path.join(this.workspaceDir, '.superconductor', 'cache');
        this.cache = new SemanticCache<IResearchBrief>('research-briefs', 0.85, cacheDir);
    }

    public async execute(
        trackId: string, 
        queries: IResearchQuery[], 
        provider: IResearchProvider,
        workUnit?: WorkUnit
    ): Promise<IResearchBrief> {
        if (queries.length > 3) {
            throw new ResearchBudgetExceededError('Cost cap exceeded: max 3 queries per track allowed');
        }

        const cacheKey = JSON.stringify(queries);
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        if (workUnit) {
            const sm = new WorkUnitStateMachine();
            const updated = sm.transition(workUnit, WorkUnitState.RESEARCHING);
            workUnit.state = updated.state;
        }

        const results: IResearchSource[] = [];

        try {
            for (const query of queries) {
                const searchResults = await provider.search(query);
                results.push(...searchResults);
            }
        } catch (error) {
            if (error instanceof ResearchProviderUnavailableError) {
                console.warn('[ResearchExecutor] Degraded mode: Provider unavailable, falling back to standard search_web');
                
                for (const query of queries) {
                    try {
                        const rawResults = await this.executeTool('search_web', { query: query.term });
                        if (Array.isArray(rawResults)) {
                            for (const res of rawResults) {
                                results.push({
                                    url: `<untrusted_research_results>${sanitizeUntrustedText(res.url)}</untrusted_research_results>`,
                                    title: `<untrusted_research_results>${sanitizeUntrustedText(res.title || '')}</untrusted_research_results>`,
                                });
                            }
                        }
                    } catch (fallbackError) {
                        console.error('[ResearchExecutor] Fallback search_web also failed:', fallbackError);
                    }
                }
            } else {
                throw error;
            }
        }

        const outDir = path.join(this.workspaceDir, '.superconductor', 'research', trackId);
        this.synthesizer = new ResearchBriefSynthesizer(outDir, this.executeLlmTool);
        
        const brief = await this.synthesizer.synthesize(results, trackId);
        brief.queriesExecuted = queries.map(q => q.term);

        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(outDir, 'brief.json'), JSON.stringify(brief, null, 2), 'utf8');

        await this.cache.set(cacheKey, brief);

        return brief;
    }
}
