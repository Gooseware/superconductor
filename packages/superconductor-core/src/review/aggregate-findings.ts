import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractFencedBlock } from './extract-fenced-block.js';

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

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'advisory']);
const VALID_CATEGORIES = new Set(['security', 'correctness', 'adversarial', 'architecture', 'style']);

function isValidFinding(f: any): boolean {
  return (
    f !== null &&
    !Array.isArray(f) &&
    typeof f === 'object' &&
    typeof f.finding_id === 'string' &&
    typeof f.severity === 'string' &&
    VALID_SEVERITIES.has(f.severity) &&
    typeof f.category === 'string' &&
    VALID_CATEGORIES.has(f.category) &&
    typeof f.file === 'string' &&
    typeof f.line_range === 'string'
  );
}

export function mapReviewerIssue(issue: any, reviewerId: string, options?: any): ReviewFinding | null {
  if (!isValidFinding(issue)) return null;
  const f = { ...issue };
  if (!f.reviewer_id) {
    f.reviewer_id = reviewerId;
  }
  return f as ReviewFinding;
}

export function extractReviewerFindings(
  item: { reviewer_id: string; raw_text?: string },
  manifestsDir?: string
): ReviewFinding[] {
  let parsedArray: any[] | null = null;

  // Tier 1 Extraction
  if (item.raw_text) {
    const parsed = extractFencedBlock<any[]>(item.raw_text, 'review-findings');
    if (Array.isArray(parsed)) {
      parsedArray = parsed;
    }
  }

  // Tier 2 Extraction
  if (!parsedArray && manifestsDir) {
    const artifactPath = path.join(manifestsDir, `${item.reviewer_id}-findings.json`);
    if (fs.existsSync(artifactPath)) {
      try {
        const content = fs.readFileSync(artifactPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          parsedArray = parsed;
        }
      } catch (e) {
        // parsing failed
      }
    }
  }

  let findings: ReviewFinding[] | null = null;
  if (parsedArray) {
    findings = parsedArray
      .map(issue => mapReviewerIssue(issue, item.reviewer_id))
      .filter((f): f is ReviewFinding => f !== null);
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

  return findings || [];
}

/** Deduplicates findings using isLineRangeClose, merging agreement counts. */
export function deduplicateFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const deduplicated: ReviewFinding[] = [];

  for (const f of findings) {
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

export function aggregateFindings(
  reviewerOutputs: { reviewer_id: string; raw_text?: string }[],
  manifestsDir?: string
): ReviewFinding[] {
  const rawFindings = reviewerOutputs.flatMap((item) =>
    extractReviewerFindings(item, manifestsDir)
  );

  // Deduplicate and count agreement
  return deduplicateFindings(rawFindings);
}

function isLineRangeClose(rangeA: string, rangeB: string): boolean {
  if (rangeA === rangeB) return true;
  if (!rangeA || !rangeB) return false;
  if (rangeA === 'all' && rangeB === 'all') return true;
  if (rangeA === 'all' || rangeB === 'all') return false;
  const numA = parseInt(rangeA.replace(/^L/i, '').split('-')[0], 10);
  const numB = parseInt(rangeB.replace(/^L/i, '').split('-')[0], 10);
  if (isNaN(numA) || isNaN(numB)) return false;
  return Math.abs(numA - numB) <= 3;
}
