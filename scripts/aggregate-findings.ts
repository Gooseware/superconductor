import * as fs from 'fs';
import * as path from 'path';
import { extractFencedBlock } from './extract-fenced-block';

export interface ReviewFinding {
  finding_id: string;
  reviewer_id: string;
  file: string;
  line_range: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'advisory';
  category: 'security' | 'correctness' | 'adversarial' | 'architecture' | 'style';
  description: string;
  recommendation: string;
  is_security_critical: boolean;
  reviewer_ids?: string[];
  agreement_count?: number;
}

export function aggregateFindings(
  reviewerOutputs: { reviewer_id: string; raw_text?: string }[],
  manifestsDir?: string
): ReviewFinding[] {
  const rawFindings: ReviewFinding[] = [];

  for (const item of reviewerOutputs) {
    let findings: ReviewFinding[] | null = null;

    // Tier 1 Extraction
    if (item.raw_text) {
      findings = extractFencedBlock<ReviewFinding[]>(item.raw_text, 'review-findings');
    }

    // Tier 2 Extraction
    if (!findings && manifestsDir) {
      const artifactPath = path.join(manifestsDir, `${item.reviewer_id}-findings.json`);
      if (fs.existsSync(artifactPath)) {
        try {
          const content = fs.readFileSync(artifactPath, 'utf-8');
          findings = JSON.parse(content);
        } catch (e) {
          findings = null;
        }
      }
    }

    // Tier 3 Fail-Safe: Create a generic finding from raw text if parsing failed
    if (!findings && item.raw_text) {
      findings = [
        {
          finding_id: `UNSTRUCTURED-${item.reviewer_id}`,
          reviewer_id: item.reviewer_id,
          file: 'unknown',
          line_range: 'all',
          severity: 'medium',
          category: 'correctness',
          description: item.raw_text.slice(0, 300) + '...',
          recommendation: 'Manual review required (unstructured output)',
          is_security_critical: false
        }
      ];
    }

    if (findings) {
      rawFindings.push(...findings);
    }
  }

  // Deduplicate and count agreement
  const deduplicated: ReviewFinding[] = [];

  for (const f of rawFindings) {
    const existing = deduplicated.find(
      (item) => item.file === f.file && isLineRangeClose(item.line_range, f.line_range)
    );

    if (existing) {
      if (!existing.reviewer_ids) existing.reviewer_ids = [existing.reviewer_id];
      if (!existing.reviewer_ids.includes(f.reviewer_id)) {
        existing.reviewer_ids.push(f.reviewer_id);
      }
      existing.agreement_count = existing.reviewer_ids.length;
      if (f.is_security_critical) existing.is_security_critical = true;
    } else {
      const copy = { ...f };
      copy.reviewer_ids = [f.reviewer_id];
      copy.agreement_count = 1;
      deduplicated.push(copy);
    }
  }

  return deduplicated;
}

function isLineRangeClose(rangeA: string, rangeB: string): boolean {
  if (rangeA === rangeB) return true;
  if (rangeA === 'all' && rangeB === 'all') return true;
  if (rangeA === 'all' || rangeB === 'all') return false;
  const numA = parseInt(rangeA.split('-')[0], 10);
  const numB = parseInt(rangeB.split('-')[0], 10);
  if (isNaN(numA) || isNaN(numB)) return false;
  return Math.abs(numA - numB) <= 3;
}
