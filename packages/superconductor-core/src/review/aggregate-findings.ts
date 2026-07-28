import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractFencedBlock } from './extract-fenced-block.js';
import { sanitizeId } from '../utils/input-sanitizer.js';

export interface ReviewFinding {
  finding_id: string;
  reviewer_id: string;
  file: string;
  line_range: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'advisory';
  category: 'security' | 'correctness' | 'adversarial' | 'architecture' | 'style';
  categories?: string[];
  description: string;
  recommendation: string;
  is_security_critical: boolean;
  reviewer_ids?: string[];
  agreement_count?: number;
}

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'advisory']);
const VALID_CATEGORIES = new Set(['security', 'correctness', 'adversarial', 'architecture', 'style']);

export function isValidFinding(f: unknown): f is ReviewFinding {
  if (f === null || Array.isArray(f) || typeof f !== 'object') return false;
  const obj = f as Record<string, unknown>;
  return (
    typeof obj.finding_id === 'string' &&
    typeof obj.severity === 'string' &&
    VALID_SEVERITIES.has(obj.severity) &&
    typeof obj.category === 'string' &&
    VALID_CATEGORIES.has(obj.category) &&
    typeof obj.file === 'string' &&
    typeof obj.line_range === 'string'
  );
}

export function mapReviewerIssue(issue: unknown, reviewerId: string, options?: unknown): ReviewFinding | null {
  if (typeof issue !== 'object' || issue === null) {
    throw new TypeError('issue must be a non-null object');
  }
  if (!isValidFinding(issue)) return null;
  const f = { ...(issue as Record<string, unknown>) };
  if (!f.reviewer_id) {
    f.reviewer_id = reviewerId;
  }
  if (typeof f.reviewer_id !== 'string') {
    throw new TypeError('reviewer_id must be a string');
  }
  return f as unknown as ReviewFinding;
}

export function extractReviewerFindings(
  item: { reviewer_id: string; raw_text?: string },
  manifestsDir?: string
): ReviewFinding[] {
  if (!item || typeof item !== 'object') {
    throw new TypeError('item must be an object');
  }
  if (typeof item.reviewer_id !== 'string') {
    throw new TypeError('item.reviewer_id must be a string');
  }

  let parsedArray: unknown[] | null = null;

  // Tier 1 Extraction
  if (item.raw_text) {
    const parsed = extractFencedBlock<unknown[]>(item.raw_text, 'review-findings');
    if (Array.isArray(parsed)) {
      parsedArray = parsed;
    }
  }

  // Tier 2 Extraction
  if (!parsedArray && manifestsDir) {
    const safeReviewerId = sanitizeId(item.reviewer_id);
    const artifactPath = path.resolve(manifestsDir, `${safeReviewerId}-findings.json`);
    const resolvedManifestsDir = path.resolve(manifestsDir);
    
    if (artifactPath.startsWith(resolvedManifestsDir) && fs.existsSync(artifactPath)) {
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
      if (!existing.categories) existing.categories = [existing.category];
      if (f.category && !existing.categories.includes(f.category)) {
        existing.categories.push(f.category);
      }
    } else {
      const copy = { ...f };
      copy.reviewer_ids = [f.reviewer_id];
      copy.agreement_count = 1;
      copy.categories = [f.category];
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

export interface KeyholePayload {
  finding: ReviewFinding;
  workUnitSpec: string;
  contextLines: string;
  fullFileContent?: never;
  branchDiff?: never;
  crossDomainFindings?: never;
}

export class KeyholeContextManager<T extends { domain?: string; researchContext?: string }> {
  public extractReviewFeedback(finding: ReviewFinding, fileContent: string, workUnitSpec: string): KeyholePayload {
    return KeyholeContextManager.extractPayload(finding, fileContent, workUnitSpec);
  }

  public injectResearchContext(workUnit: T, brief: any): void {
    const domain = workUnit.domain;
    if (!domain) return;
    
    const filteredFindings = (brief.keyFindings || []).filter((f: any) => 
      f.domain === domain || f.category === domain
    );
    
    let contextAddition = '';
    if (brief.executiveSummary) {
      contextAddition += `Executive Summary:\n${brief.executiveSummary}\n\n`;
    }
    
    if (filteredFindings.length > 0) {
      contextAddition += `Domain Findings (${domain}):\n`;
      contextAddition += JSON.stringify(filteredFindings, null, 2);
    }
    
    if (contextAddition) {
      workUnit.researchContext = (workUnit.researchContext ? workUnit.researchContext + '\n\n' : '') + contextAddition.trim();
    }
  }

  static extractPayload(finding: ReviewFinding, fileContent: string, workUnitSpec: string): KeyholePayload {
    const lines = fileContent.split('\n');
    let startLine = 1;
    let endLine = lines.length;

    if (finding.line_range && finding.line_range !== 'all') {
      const match = finding.line_range.match(/L(\d+)(?:-L(\d+))?/);
      if (match) {
        const l1 = parseInt(match[1], 10);
        const l2 = match[2] ? parseInt(match[2], 10) : l1;
        startLine = Math.max(1, l1 - 50);
        endLine = Math.min(lines.length, l2 + 50);
      } else {
        throw new Error(`Invalid line_range format: ${finding.line_range}`);
      }
    }

    const contextLines = lines.slice(startLine - 1, endLine).join('\n');

    return {
      finding,
      workUnitSpec,
      contextLines
    };
  }
}

export const KeyholeFeedbackExtractor = KeyholeContextManager;
