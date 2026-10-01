import * as fs from 'node:fs';
import * as path from 'node:path';
import { sanitizeId } from '../utils/input-sanitizer.js';
import { extractFencedBlock } from './extract-fenced-block.js';
import {
  type ReviewFinding,
  isValidFinding,
  mapReviewerIssue,
  extractReviewerFindings,
  deduplicateFindings,
  aggregateFindings,
} from './aggregate-findings.js';

export type { ReviewFinding };
export { extractFencedBlock, aggregateFindings };

export interface SeverityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
  advisory: number;
}

export interface AggregatedFindingsResult {
  findings: ReviewFinding[];
  severityBreakdown: SeverityBreakdown;
  severity_breakdown: SeverityBreakdown;
  total: number;
}

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'advisory']);

export function calculateSeverityBreakdown(findings: ReviewFinding[]): SeverityBreakdown {
  const breakdown: SeverityBreakdown = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    advisory: 0,
  };

  if (!Array.isArray(findings)) {
    return breakdown;
  }

  for (const f of findings) {
    if (!f || typeof f !== 'object') continue;
    const rawSev = typeof f.severity === 'string' ? f.severity.toLowerCase().trim() : '';
    const sev = VALID_SEVERITIES.has(rawSev) ? rawSev : 'medium';
    breakdown[sev as keyof SeverityBreakdown]++;
  }

  return breakdown;
}

/**
 * Authoritative review findings pipeline for extracting fenced blocks,
 * parsing reviewer outputs, deduplicating findings, and aggregating severities.
 */
export class ReviewFindingsPipeline {
  /**
   * Unified extraction of markdown fenced code blocks (e.g. ```json:review-findings, ```json:coverage-manifest, or standard ```json).
   */
  public extractFencedBlock<T = unknown>(text: string, identifier: string): T | null {
    return ReviewFindingsPipeline.extractFencedBlock<T>(text, identifier);
  }

  /**
   * Combines findings from multiple reviewer subagents or files. Performs schema validation,
   * issue mapping, deduplication across reviewers, and calculates severity breakdown.
   */
  public aggregateFindings(
    items: Array<{ reviewer_id: string; raw_text?: string }>,
    manifestsDir?: string
  ): AggregatedFindingsResult {
    return ReviewFindingsPipeline.aggregate(items, manifestsDir);
  }

  /**
   * Alias for aggregateFindings
   */
  public aggregate(
    items: Array<{ reviewer_id: string; raw_text?: string }>,
    manifestsDir?: string
  ): AggregatedFindingsResult {
    return ReviewFindingsPipeline.aggregate(items, manifestsDir);
  }

  /**
   * Extracts findings from raw markdown text for a single reviewer.
   */
  public parseReviewText(
    rawText: string,
    reviewerId: string,
    options?: { fallbackToUnstructured?: boolean }
  ): ReviewFinding[] {
    return ReviewFindingsPipeline.parseReviewText(rawText, reviewerId, options);
  }

  // --- Static Helper Methods ---

  public static extractFencedBlock<T = unknown>(text: string, identifier: string): T | null {
    return extractFencedBlock<T>(text, identifier);
  }

  public static parseReviewText(
    rawText: string,
    reviewerId: string,
    options?: { fallbackToUnstructured?: boolean }
  ): ReviewFinding[] {
    if (typeof reviewerId !== 'string' || !reviewerId) {
      throw new TypeError('reviewerId must be a non-empty string');
    }
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return [];
    }

    const fallbackToUnstructured = options?.fallbackToUnstructured ?? true;
    let parsedArray: unknown[] | null = null;

    // Tier 1: Try review-findings identifier first
    const parsedFindings = extractFencedBlock<unknown[]>(rawText, 'review-findings');
    if (Array.isArray(parsedFindings)) {
      parsedArray = parsedFindings;
    } else {
      // Also try standard json block if it contains finding-like objects
      const parsedJson = extractFencedBlock<unknown[]>(rawText, 'json');
      if (Array.isArray(parsedJson) && parsedJson.some(isValidFinding)) {
        parsedArray = parsedJson;
      }
    }

    let findings: ReviewFinding[] | null = null;
    if (parsedArray) {
      findings = parsedArray
        .filter(issue => typeof issue === 'object' && issue !== null && !Array.isArray(issue))
        .map(issue => mapReviewerIssue(issue, reviewerId))
        .filter((f): f is ReviewFinding => f !== null);
    }

    // Tier 3 Fail-Safe: Create a generic finding from raw text if parsing failed to extract structured findings
    if (!findings && fallbackToUnstructured && rawText && rawText.trim()) {
      findings = [
        {
          finding_id: `UNSTRUCTURED-${reviewerId}`,
          reviewer_id: reviewerId,
          file: 'unknown',
          line_range: 'all',
          severity: 'medium',
          category: 'correctness',
          description: rawText.slice(0, 300) + '...',
          recommendation: 'Manual review required (unstructured output)',
          is_security_critical: false,
        },
      ];
    }

    return findings || [];
  }

  private static loadDiskManifest(reviewerId: string, manifestsDir: string): ReviewFinding[] | null {
    try {
      const safeReviewerId = sanitizeId(reviewerId);
      const resolvedManifestsDir = path.resolve(manifestsDir);
      const artifactPath = path.resolve(manifestsDir, `${safeReviewerId}-findings.json`);
      if (artifactPath.startsWith(resolvedManifestsDir) && fs.existsSync(artifactPath)) {
        const content = fs.readFileSync(artifactPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(issue => typeof issue === 'object' && issue !== null && !Array.isArray(issue))
            .map(issue => mapReviewerIssue(issue, reviewerId))
            .filter((f): f is ReviewFinding => f !== null);
        }
      }
    } catch {
      // ignore parsing or read errors
    }
    return null;
  }

  public static aggregate(
    items: Array<{ reviewer_id: string; raw_text?: string }>,
    manifestsDir?: string
  ): AggregatedFindingsResult {
    const emptyBreakdown: SeverityBreakdown = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      advisory: 0,
    };

    if (!Array.isArray(items)) {
      return {
        findings: [],
        severityBreakdown: emptyBreakdown,
        severity_breakdown: emptyBreakdown,
        total: 0,
      };
    }

    const allFindings: ReviewFinding[] = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        throw new TypeError('item must be an object');
      }
      if (typeof item.reviewer_id !== 'string') {
        throw new TypeError('item.reviewer_id must be a string');
      }

      let itemFindings: ReviewFinding[] = [];

      // Tier 1: Try parseReviewText on raw_text without immediate unstructured fallback
      if (typeof item.raw_text === 'string' && item.raw_text.trim().length > 0) {
        itemFindings = ReviewFindingsPipeline.parseReviewText(item.raw_text, item.reviewer_id, {
          fallbackToUnstructured: false,
        });
      }

      let diskLoaded = false;
      // Tier 2: If raw_text was absent or yielded no findings, fall back to disk manifests
      if (itemFindings.length === 0 && manifestsDir) {
        const diskFindings = ReviewFindingsPipeline.loadDiskManifest(item.reviewer_id, manifestsDir);
        if (diskFindings !== null) {
          itemFindings = diskFindings;
          diskLoaded = true;
        }
      }

      // Tier 3 Fail-Safe: If still no findings, no disk manifest loaded, and raw_text is present
      if (!diskLoaded && itemFindings.length === 0 && typeof item.raw_text === 'string' && item.raw_text.trim().length > 0) {
        itemFindings = ReviewFindingsPipeline.parseReviewText(item.raw_text, item.reviewer_id, {
          fallbackToUnstructured: true,
        });
      }

      allFindings.push(...itemFindings);
    }

    const deduplicated = deduplicateFindings(allFindings);
    const breakdown = calculateSeverityBreakdown(deduplicated);

    return {
      findings: deduplicated,
      severityBreakdown: breakdown,
      severity_breakdown: breakdown,
      total: deduplicated.length,
    };
  }

  public static aggregateFindings(
    items: Array<{ reviewer_id: string; raw_text?: string }>,
    manifestsDir?: string
  ): AggregatedFindingsResult {
    return ReviewFindingsPipeline.aggregate(items, manifestsDir);
  }
}

export const reviewFindingsPipeline = new ReviewFindingsPipeline();
