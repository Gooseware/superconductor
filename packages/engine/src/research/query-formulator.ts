export interface ResearchQueryDraft {
  dimension: string;
  query: string;
  rationale: string;
}

export class ResearchQueryFormulator {
  private readonly mandatoryDimensions = [
    'OSS',
    'academic',
    'ecosystem',
    'SC_skills',
    'community'
  ];
  /**
   * MVP Phase: Template-based query formulation using keyword extraction.
   * Full LLM-based generative query formulation is deferred to a future phase.
   */
  formulate(trackDescription: string, maxQueries: number = 8): ResearchQueryDraft[] {
    if (maxQueries < this.mandatoryDimensions.length) {
      throw new Error(`maxQueries must be at least ${this.mandatoryDimensions.length}`);
    }

    const queries: ResearchQueryDraft[] = [];
    const keywords = this.extractKeywords(trackDescription);
    const target = keywords.length > 0 ? keywords.join(' ') : 'system architecture';

    // 1. Mandatory dimensions
    for (const dimension of this.mandatoryDimensions) {
      queries.push({
        dimension,
        query: `Analyze ${dimension} trends and best practices for: ${target}`,
        rationale: `Ensure comprehensive coverage of the ${dimension} dimension based on core requirements.`
      });
    }

    // 2. Extra queries up to maxQueries
    let extraCount = 1;
    while (queries.length < maxQueries && extraCount <= 3) {
      queries.push({
        dimension: 'deep_dive',
        query: `Detailed technical exploration of ${target} aspect ${extraCount}`,
        rationale: `Provide deeper technical insight into specific domain requirements.`
      });
      extraCount++;
    }

    return queries.slice(0, maxQueries);
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'with', 'to', 'for', 'of', 'create', 'build', 'implement', 'make', 'add', 'system', 'app', 'application']);
    const words = text.toLowerCase().split(/[^a-z0-9_]+/);
    return words.filter(w => w.length > 2 && !stopWords.has(w)).slice(0, 8);
  }
}
