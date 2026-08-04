import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

import {
  IResearchSource,
  IResearchBrief,
  ResearchBriefSchema,
  ResearchFinding,
  FindingCategory
} from './types.js';

export interface ResearchFindingWithScore extends ResearchFinding {
  confidenceScore: number;
}

export type ExecuteLlmFn = (prompt: string) => Promise<any>;

export class ResearchBriefSynthesizer {
  private outputDir: string;
  private executeLlm: ExecuteLlmFn;

  constructor(outputDir: string = 'research', executeLlm?: ExecuteLlmFn) {
    this.outputDir = outputDir;
    // Default to a functional mock if none provided for testing
    this.executeLlm = executeLlm || (async (prompt: string) => {
      if (process.env.NODE_ENV !== 'test') {
        throw new Error('executeLlm must be provided in non-test environments');
      }
      return prompt.includes('Extract structured findings') ? 
        [
          { category: 'OSS_DISCOVERY', description: 'Sample finding', confidenceScore: 0.95 }
        ] :
        {
          executiveSummary: 'This is a mocked executive summary.',
          recommendedPatterns: ['Event-Driven Architecture'],
          antiPatterns: ['God Object']
        };
    });
  }

  /**
   * Synthesize raw research results into a structured ResearchBrief.
   * Maps sources to findings, filters by confidence, reduces to brief,
   * saves chunked artifacts, and validates against Zod schema.
   */
  async synthesize(
    rawResults: IResearchSource[],
    trackIdOrOptions?: string | { trackId?: string; queriesExecuted?: string[]; skillsAlreadyInstalled?: string[] },
    queriesExecuted?: string[],
    skillsAlreadyInstalled?: string[]
  ): Promise<IResearchBrief> {
    let trackId = 'track-' + Date.now();
    let actualQueries: string[] = [];
    let actualSkills: string[] = [];

    if (typeof trackIdOrOptions === 'string') {
      trackId = trackIdOrOptions;
      if (queriesExecuted) actualQueries = queriesExecuted;
      if (skillsAlreadyInstalled) actualSkills = skillsAlreadyInstalled;
    } else if (trackIdOrOptions && typeof trackIdOrOptions === 'object') {
      if (trackIdOrOptions.trackId) trackId = trackIdOrOptions.trackId;
      if (trackIdOrOptions.queriesExecuted) actualQueries = trackIdOrOptions.queriesExecuted;
      if (trackIdOrOptions.skillsAlreadyInstalled) actualSkills = trackIdOrOptions.skillsAlreadyInstalled;
    } else {
      if (queriesExecuted) actualQueries = queriesExecuted;
      if (skillsAlreadyInstalled) actualSkills = skillsAlreadyInstalled;
    }
    fs.mkdirSync(this.outputDir, { recursive: true });

    const allFindings: ResearchFindingWithScore[] = [];

    // 1. Map: per-source LLM summarization into structured finding
    for (const source of rawResults) {
      const slug = this.generateSlug(source);
      
      // Save chunked artifact file
      const artifactPath = path.join(this.outputDir, `${slug}.md`);
      const artifactContent = `# ${source.title || slug}

URL: ${source.url}

${source.content || ''}`;
      fs.writeFileSync(artifactPath, artifactContent, 'utf-8');

      // LLM extracting finding and assigning a confidence score
      const findings = await this.llmMapSource(source);
      // Ensure sourceUrl is attached if missing
      findings.forEach(f => f.sourceUrl = f.sourceUrl || source.url);
      allFindings.push(...findings);
    }

    // 2. Filter: drop findings with confidenceScore < 0.6
    const filteredFindings = allFindings.filter(f => f.confidenceScore >= 0.6);

    // Remove confidenceScore from final output to match ResearchFinding schema
    const keyFindings: ResearchFinding[] = filteredFindings.map(f => ({
      category: f.category,
      description: f.description,
      sourceUrl: f.sourceUrl
    }));

    // 3. Reduce: LLM synthesis into executiveSummary, recommendedPatterns, antiPatterns
    let { executiveSummary, recommendedPatterns = [], antiPatterns = [] } = await this.llmReduceFindings(allFindings.filter(f => f.confidenceScore >= 0.6));

    // Enforce 400 words
    if (executiveSummary) {
      const words = executiveSummary.trim().split(/\s+/);
      if (words.length > 400) {
        executiveSummary = words.slice(0, 400).join(' ');
      }
    }
    // Create the final object
    const brief = {
      trackId,
      generatedAt: new Date().toISOString(),
      queriesExecuted: actualQueries,
      executiveSummary,
      keyFindings,
      recommendedPatterns,
      antiPatterns,
      skillsAlreadyInstalled: actualSkills,
      artifactPointers: rawResults.map(r => path.join(this.outputDir, `${this.generateSlug(r)}.md`))
    };

    // 4. Validate output against ResearchBriefSchema (Zod)
    const validatedBrief = ResearchBriefSchema.parse(brief);

    return validatedBrief;
  }

  private generateSlug(source: IResearchSource): string {
    const url = typeof source.url === 'string' ? source.url.replace(/<[^>]+>/g, '') : 'unknown';
    const cleanHostname = url.replace(/^https?:\/\//, '').split('/')[0].replace(/[^a-zA-Z0-9-]/g, '-');
    const titleStr = typeof source.title === 'string' ? source.title.replace(/<[^>]+>/g, '') : url;
    const cleanPath = titleStr.replace(/[^a-zA-Z0-9-]/g, '-');
    const hash = crypto.createHash('sha256').update(url + (source.title || '')).digest('hex').substring(0, 8);
    return `${cleanHostname}-${cleanPath}`.substring(0, 50) + '-' + hash;
  }

  public async llmMapSource(source: IResearchSource): Promise<ResearchFindingWithScore[]> {
    const input = source.content ?? source.title ?? source.url;
    const prompt = `Extract structured findings from: ${input}`;
    const res = await this.executeLlm(prompt);
    if (Array.isArray(res)) return res;
    
    throw new Error('LLM did not return an array of findings');
  }

  public async llmReduceFindings(findings: ResearchFindingWithScore[]): Promise<{
    executiveSummary: string;
    recommendedPatterns: string[];
    antiPatterns: string[];
  }> {
    const serializedFindings = JSON.stringify(findings, null, 2);
    const prompt = `Synthesize ${findings.length} findings into a brief:\n${serializedFindings}`;
    const res = await this.executeLlm(prompt);
    if (res && res.executiveSummary) {
      let { executiveSummary, recommendedPatterns = [], antiPatterns = [] } = res;
      return { executiveSummary, recommendedPatterns, antiPatterns };
    }
    
    throw new Error('LLM did not return a valid synthesis object');
  }
}
