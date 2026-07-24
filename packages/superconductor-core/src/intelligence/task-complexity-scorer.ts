import { RepoContext } from './snapshot-reader.js';

export interface TaskComplexityScore {
  contextLoad: number;      // 0-5: how many files/contexts agent must hold
  reasoningDepth: number;   // 0-5: cyclomatic/hotspot complexity signal
  crossCuttingRisk: number; // 0-5: SAST findings + high coupling
  testSurface: number;      // 0-5: test gap risk + churn
  total: number;            // sum, 0-20
  source: 'intelligence' | 'heuristic';
}

export class TaskComplexityScorer {
  /**
   * Score a task description using intelligence snapshot signals when available.
   * With RepoContext: surgical precision using real hotspot/fanOut/sast/testGap data.
   * Without RepoContext: keyword-based heuristic fallback.
   */
  static score(taskDescription: string, repoContext: RepoContext | null): TaskComplexityScore {
    if (repoContext) {
      return this.scoreWithIntelligence(taskDescription, repoContext);
    } else {
      return this.scoreWithHeuristic(taskDescription);
    }
  }

  private static extractFileReferences(taskDescription: string): string[] {
    const matches = taskDescription.match(/[\w\.\/-]+\.(?:ts|tsx|js|jsx|md)\b/gi) || [];
    return Array.from(new Set(matches));
  }

  private static getMapValue<T>(map: Map<string, T> | undefined, file: string): T | undefined {
    if (!map) return undefined;
    if (map.has(file)) return map.get(file);
    for (const [key, value] of map.entries()) {
      if (key === file || key.endsWith('/' + file) || file.endsWith('/' + key)) {
        return value;
      }
    }
    return undefined;
  }

  private static scoreWithIntelligence(taskDescription: string, repoContext: RepoContext): TaskComplexityScore {
    const mentionedFiles = this.extractFileReferences(taskDescription);

    // 1. contextLoad: for each mentioned file, sum fanOutMap?.get(file) ?? 0 + (couplingMap?.get(file)?.length ?? 0).
    // Normalise: raw 0 -> 1, 1-3 -> 2, 4-8 -> 3, 9-15 -> 4, 16+ -> 5. Cap at 5.
    let rawContextLoad = 0;
    for (const file of mentionedFiles) {
      const fanOut = this.getMapValue(repoContext.fanOutMap, file) ?? 0;
      const coupling = this.getMapValue(repoContext.couplingMap, file)?.length ?? 0;
      rawContextLoad += fanOut + coupling;
    }

    let contextLoad = 1;
    if (rawContextLoad >= 16) {
      contextLoad = 5;
    } else if (rawContextLoad >= 9) {
      contextLoad = 4;
    } else if (rawContextLoad >= 4) {
      contextLoad = 3;
    } else if (rawContextLoad >= 1) {
      contextLoad = 2;
    } else {
      contextLoad = 1;
    }

    // 2. reasoningDepth: max hotspotMap.get(file)?.cyclomatic_complexity ?? 0 across mentioned files.
    // Scale: 0 -> 1, 1-5 -> 2, 6-10 -> 3, 11-15 -> 4, 16+ -> 5. Cap at 5.
    let maxComplexity = 0;
    for (const file of mentionedFiles) {
      const complexity = this.getMapValue(repoContext.hotspotMap, file)?.cyclomatic_complexity ?? 0;
      if (complexity > maxComplexity) {
        maxComplexity = complexity;
      }
    }

    let reasoningDepth = 1;
    if (maxComplexity >= 16) {
      reasoningDepth = 5;
    } else if (maxComplexity >= 11) {
      reasoningDepth = 4;
    } else if (maxComplexity >= 6) {
      reasoningDepth = 3;
    } else if (maxComplexity >= 1) {
      reasoningDepth = 2;
    } else {
      reasoningDepth = 1;
    }

    // 3. crossCuttingRisk: count total SAST findings for mentioned files (sastFindings.get(file)?.length ?? 0).
    // Scale: 0 -> 0, 1 -> 1, 2-3 -> 2, 4-6 -> 3, 7-10 -> 4, 11+ -> 5. Add +2 if any coupling degree > 5 (cap at 5).
    let totalSastFindings = 0;
    let hasHighCoupling = false;

    for (const file of mentionedFiles) {
      const sastList = this.getMapValue(repoContext.sastFindings, file);
      if (sastList) {
        totalSastFindings += sastList.length;
      }
      const couplingList = this.getMapValue(repoContext.couplingMap, file);
      if (couplingList && couplingList.length > 5) {
        hasHighCoupling = true;
      }
    }

    let sastScore = 0;
    if (totalSastFindings >= 11) {
      sastScore = 5;
    } else if (totalSastFindings >= 7) {
      sastScore = 4;
    } else if (totalSastFindings >= 4) {
      sastScore = 3;
    } else if (totalSastFindings >= 2) {
      sastScore = 2;
    } else if (totalSastFindings === 1) {
      sastScore = 1;
    } else {
      sastScore = 0;
    }

    const crossCuttingRisk = Math.min(5, sastScore + (hasHighCoupling ? 2 : 0));

    // 4. testSurface: max testGapMap risk across mentioned files. HIGH -> 4, MEDIUM -> 2, LOW -> 1, none -> 1.
    // Add Math.min(2, Math.floor(gitChurnScore / 20)) for churn. Cap at 5.
    let maxBaseRisk = 1;
    let maxGitChurnScore = 0;

    for (const file of mentionedFiles) {
      const gap = this.getMapValue(repoContext.testGapMap, file);
      if (gap) {
        let fileRiskScore = 1;
        if (gap.risk === 'HIGH') fileRiskScore = 4;
        else if (gap.risk === 'MEDIUM') fileRiskScore = 2;
        else if (gap.risk === 'LOW') fileRiskScore = 1;

        if (fileRiskScore > maxBaseRisk) {
          maxBaseRisk = fileRiskScore;
        }

        if (gap.gitChurnScore > maxGitChurnScore) {
          maxGitChurnScore = gap.gitChurnScore;
        }
      }
    }

    const churnBonus = Math.min(2, Math.floor(maxGitChurnScore / 20));
    const testSurface = Math.min(5, maxBaseRisk + churnBonus);

    const total = contextLoad + reasoningDepth + crossCuttingRisk + testSurface;

    return {
      contextLoad,
      reasoningDepth,
      crossCuttingRisk,
      testSurface,
      total,
      source: 'intelligence',
    };
  }

  private static scoreWithHeuristic(taskDescription: string): TaskComplexityScore {
    const mentionedFiles = this.extractFileReferences(taskDescription);
    const count = mentionedFiles.length;

    // 1. contextLoad: count distinct file references in text. 0->1, 1-2->2, 3-4->3, 5-7->4, 8+->5
    let contextLoad = 1;
    if (count >= 8) {
      contextLoad = 5;
    } else if (count >= 5) {
      contextLoad = 4;
    } else if (count >= 3) {
      contextLoad = 3;
    } else if (count >= 1) {
      contextLoad = 2;
    } else {
      contextLoad = 1;
    }

    const lowerText = taskDescription.toLowerCase();

    // 2. reasoningDepth: keyword scan: ['algorithm','complex','recursive','concurrent','race','deadlock','cache','security'] -> each hit +1, cap at 5
    const depthKeywords = ['algorithm', 'complex', 'recursive', 'concurrent', 'race', 'deadlock', 'cache', 'security'];
    let depthHits = 0;
    for (const kw of depthKeywords) {
      if (lowerText.includes(kw)) {
        depthHits++;
      }
    }
    const reasoningDepth = Math.min(5, depthHits);

    // 3. crossCuttingRisk: ['auth','permission','sql','inject','xss','csrf','crypto'] -> each hit +2, cap at 5
    const riskKeywords = ['auth', 'permission', 'sql', 'inject', 'xss', 'csrf', 'crypto'];
    let riskHits = 0;
    for (const kw of riskKeywords) {
      if (lowerText.includes(kw)) {
        riskHits++;
      }
    }
    const crossCuttingRisk = Math.min(5, riskHits * 2);

    // 4. testSurface: ['test','spec','coverage','mock','assert'] -> each hit +1, cap at 5; if none -> 2 (default test surface)
    const testKeywords = ['test', 'spec', 'coverage', 'mock', 'assert'];
    let testHits = 0;
    for (const kw of testKeywords) {
      if (lowerText.includes(kw)) {
        testHits++;
      }
    }
    const testSurface = testHits === 0 ? 2 : Math.min(5, testHits);

    const total = contextLoad + reasoningDepth + crossCuttingRisk + testSurface;

    return {
      contextLoad,
      reasoningDepth,
      crossCuttingRisk,
      testSurface,
      total,
      source: 'heuristic',
    };
  }
}
