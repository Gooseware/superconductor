import { getAcceptanceCriteria, CriterionItem } from './track-reader.js';

export interface PlanGapReport {
  trackId: string;
  covered: CriterionItem[];
  uncovered: CriterionItem[];
  confidence: number;
}

export function checkPlanGap(
  projectRoot: string,
  trackId: string,
  changedFiles: string[]
): PlanGapReport {
  const criteria = getAcceptanceCriteria(projectRoot, trackId);
  const covered: CriterionItem[] = [];
  const uncovered: CriterionItem[] = [];

  for (const criterion of criteria) {
    // Basic heuristic gap check: if criterion is checked OR keywords match changed files
    if (criterion.checked) {
      covered.push(criterion);
    } else {
      const keywords = criterion.text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3);

      const hasMatch = changedFiles.some((file) =>
        keywords.some((kw) => file.toLowerCase().includes(kw))
      );

      if (hasMatch) {
        covered.push(criterion);
      } else {
        uncovered.push(criterion);
      }
    }
  }

  const total = criteria.length;
  const confidence = total > 0 ? Math.round((covered.length / total) * 100) / 100 : 0.0;

  return {
    trackId,
    covered,
    uncovered,
    confidence
  };
}
