import * as fs from 'fs';
import * as path from 'path';
import { IResearchSource, IResearchBrief, ResearchBriefSchema, ResearchFinding } from './types.js';

export interface ResearchFindingWithScore extends ResearchFinding {
  confidenceScore: number;
}

export class ResearchBriefSynthesizer {
  private outputDir: string;

  constructor(outputDir: string = 'research') {
    this.outputDir = outputDir;
  }

  public async synthesize(rawResults: IResearchSource[], trackId: string = 'default-track'): Promise<IResearchBrief> {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // 1. Map
    const mappedFindingsBySource = await Promise.all(
      rawResults.map(source => this.llmMapSource(source))
    );

    // Write chunked artifacts
    rawResults.forEach((source, index) => {
      const slug = this.slugify(source.title || source.url);
      const filePath = path.join(this.outputDir, `${slug}.md`);
      const content = `# Source: ${source.title || source.url}\nURL: ${source.url}\n\n## Findings\n\`\`\`json\n${JSON.stringify(mappedFindingsBySource[index], null, 2)}\n\`\`\`\n`;
      fs.writeFileSync(filePath, content, 'utf8');
    });

    // 2. Filter
    const allFindings = mappedFindingsBySource.flat();
    const filteredFindings = allFindings.filter(f => f.confidenceScore >= 0.6);

    // 3. Reduce
    const { executiveSummary, recommendedPatterns, antiPatterns } = await this.llmReduceFindings(filteredFindings);

    const rawOutput = {
      trackId,
      generatedAt: new Date().toISOString(),
      queriesExecuted: [],
      executiveSummary,
      keyFindings: filteredFindings.map(({ confidenceScore, ...rest }) => rest), // Strip internal property
      recommendedPatterns,
      antiPatterns,
      skillsAlreadyInstalled: [],
      artifactPointers: rawResults.map(source => path.join(this.outputDir, `${this.slugify(source.title || source.url)}.md`))
    };

    // 4. Validate
    return ResearchBriefSchema.parse(rawOutput);
  }

  // Virtual methods to allow mocking the LLM in tests
  public async llmMapSource(source: IResearchSource): Promise<ResearchFindingWithScore[]> {
    return [
      {
        category: 'OSS_DISCOVERY',
        description: `Mock finding for ${source.title || source.url}`,
        sourceUrl: source.url,
        confidenceScore: 0.9
      },
      {
        category: 'ARCHITECTURAL_PATTERN',
        description: `Low confidence mock finding for ${source.title || source.url}`,
        sourceUrl: source.url,
        confidenceScore: 0.4
      }
    ];
  }

  public async llmReduceFindings(findings: ResearchFindingWithScore[]): Promise<{
    executiveSummary: string;
    recommendedPatterns: string[];
    antiPatterns: string[];
  }> {
    return {
      executiveSummary: "Mock executive summary based on findings.",
      recommendedPatterns: ["Pattern A", "Pattern B"],
      antiPatterns: ["AntiPattern A"]
    };
  }

  private slugify(text: string): string {
    if (!text) return 'unknown';
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') || 'unknown';
  }
}
