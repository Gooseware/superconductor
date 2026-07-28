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

  formulate(trackDescription: string, maxQueries: number = 8): ResearchQueryDraft[] {
    if (maxQueries < this.mandatoryDimensions.length) {
      throw new Error(`maxQueries must be at least ${this.mandatoryDimensions.length}`);
    }

    const queries: ResearchQueryDraft[] = [];

    // 1. Mandatory dimensions
    for (const dimension of this.mandatoryDimensions) {
      queries.push({
        dimension,
        query: `Analyze ${dimension} trends for: ${trackDescription.substring(0, 50)}`,
        rationale: `Ensure comprehensive coverage of the ${dimension} dimension.`
      });
    }

    // 2. Extra queries up to maxQueries
    let extraCount = 1;
    while (queries.length < maxQueries && extraCount <= 3) {
      queries.push({
        dimension: 'deep_dive',
        query: `Detailed exploration of aspect ${extraCount} for ${trackDescription.substring(0, 30)}`,
        rationale: `Provide deeper technical insight into specific domain requirements.`
      });
      extraCount++;
    }

    return queries.slice(0, maxQueries);
  }
}
