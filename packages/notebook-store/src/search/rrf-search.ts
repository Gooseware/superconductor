import { NotebookEntry } from '../types.js';

// Reciprocal Rank Fusion
// score = Σ(1/(k + r_vector) + 1/(k + r_bm25)), k=60
export function rrfMerge(
  vectorResults: NotebookEntry[],
  bm25Results: NotebookEntry[],
  k = 60
): NotebookEntry[] {
  const scores = new Map<string, number>();
  vectorResults.forEach((e, i) => scores.set(e.id, (scores.get(e.id) || 0) + 1 / (k + i + 1)));
  bm25Results.forEach((e, i) => scores.set(e.id, (scores.get(e.id) || 0) + 1 / (k + i + 1)));
  const allEntries = new Map<string, NotebookEntry>();
  [...vectorResults, ...bm25Results].forEach((e) => allEntries.set(e.id, e));
  return [...allEntries.values()].sort(
    (a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0)
  );
}

// Token-budget reranker: cap at ~800 tokens (≈3200 chars)
export function applyTokenBudget(entries: NotebookEntry[], maxChars = 3200): NotebookEntry[] {
  let total = 0;
  return entries.filter((e) => {
    if (total + e.content.length <= maxChars) {
      total += e.content.length;
      return true;
    }
    return false;
  });
}
