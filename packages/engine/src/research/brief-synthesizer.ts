import * as fs from 'fs';
import * as path from 'path';
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
      if (prompt.includes('Extract')) {
        return [
          {
            category: 'ARCHITECTURAL_PATTERN',
            description: `Extracted pattern`,
            sourceUrl: '',
            confidenceScore: 0.85
          },
          {
            category: 'OSS_DISCOVERY',
            description: `Potential tool`,
            sourceUrl: '',
            confidenceScore: 0.4
          }
        ];
      }
      if (prompt.includes('Synthesize')) {
        return { 
          executiveSummary: 'Based on high-confidence findings, we observed consistent trends. This is a short summary.', 
          recommendedPatterns: ['Event-Driven Architecture'], 
          antiPatterns: ['God Object'] 
        };
      }
      return {};
    });
  }

  /**
   * Synthesize raw research results into a structured ResearchBrief.
   * Maps sources to findings, filters by confidence, reduces to brief,
   * saves chunked artifacts, and validates against Zod schema.
   */
  async synthesize(rawResults: IResearchSource[]): Promise<IResearchBrief> {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const allFindings: ResearchFindingWithScore[] = [];

    // 1. Map: per-source LLM summarization into structured finding
    for (const source of rawResults) {
      const slug = this.generateSlug(source);
      
      // Save chunked artifact file
      const artifactPath = path.join(this.outputDir, `${slug}.md`);
      const artifactContent = `# ${source.title || slug}\n\nURL: ${source.url}\n\n${source.content || ''}`;
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
    let { executiveSummary, recommendedPatterns, antiPatterns } = await this.llmReduceFindings(allFindings.filter(f => f.confidenceScore >= 0.6));

    // Enforce 400 words
    if (executiveSummary) {
      const words = executiveSummary.trim().split(/\s+/);
      if (words.length > 400) {
        executiveSummary = words.slice(0, 400).join(' ');
      }
    }

    const skillsAlreadyInstalled = ['aws-cli', 'docker'];
    
    // Create the final object
    const brief = {
      trackId: 'track-' + Date.now(),
      generatedAt: new Date().toISOString(),
      queriesExecuted: ['query1', 'query2'],
      executiveSummary,
      keyFindings,
      recommendedPatterns,
      antiPatterns,
      skillsAlreadyInstalled,
      artifactPointers: rawResults.map(r => path.join(this.outputDir, `${this.generateSlug(r)}.md`))
    };

    // 4. Validate output against ResearchBriefSchema (Zod)
    const validatedBrief = ResearchBriefSchema.parse(brief);

    return validatedBrief;
  }

  private generateSlug(source: IResearchSource): string {
    const base = source.title || source.url;
    return base.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().substring(0, 50) || 'unknown-source';
  }

  public async llmMapSource(source: IResearchSource): Promise<ResearchFindingWithScore[]> {
    const res = await this.executeLlm(`Extract structured findings from ${source.url}`);
    if (Array.isArray(res)) return res;
    
    throw new Error('LLM did not return an array of findings');
  }

  public async llmReduceFindings(findings: ResearchFindingWithScore[]): Promise<{
    executiveSummary: string;
    recommendedPatterns: string[];
    antiPatterns: string[];
  }> {
    const res = await this.executeLlm(`Synthesize ${findings.length} findings into a brief.`);
    if (res && res.executiveSummary) {
        return res;
    }
    
    throw new Error('LLM did not return a valid synthesis object');
  }
}
