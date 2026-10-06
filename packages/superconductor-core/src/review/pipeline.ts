import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
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

export interface InjectDiffOnDiffOptions {
  cycle: number;
  projectDir?: string;
  diff?: string | null;
  baseCommit?: string;
  reviewerRole?: string;
  targetRoles?: string[];
}

export const DIFF_ON_DIFF_DEFAULT_ROLES = [
  'adversarial-reviewer',
  'correctness-reviewer',
  'adversarial',
  'correctness',
] as const;

/**
 * Normalizes a reviewer role string by trimming, lowercasing, and replacing underscores with dashes.
 */
function normalizeRole(role: string): string {
  return role.toLowerCase().trim().replace(/_/g, '-');
}

/**
 * Validates whether a git revision or range contains only safe revision syntax.
 * Rejects command injection characters such as semicolons, pipes, backticks, newlines, etc.
 */
function isValidGitRevision(rev: string): boolean {
  return /^[a-zA-Z0-9_.~^/@{}:-]+$/.test(rev);
}

/**
 * Computes git diff introduced in previous remediation attempts.
 * Returns null if cycle < 2, if projectDir is invalid, or if git diff fails.
 * On cycle >= 2, executes git diff HEAD~1..HEAD (or against baseCommit).
 */
export function computeDiffOnDiff(
  projectDir: string,
  cycle: number,
  baseCommit?: string
): string | null {
  if (typeof cycle !== 'number' || isNaN(cycle) || cycle < 2) {
    return null;
  }

  if (!projectDir || typeof projectDir !== 'string') {
    return null;
  }

  try {
    if (!fs.existsSync(projectDir)) {
      return null;
    }
  } catch {
    return null;
  }

  let range = 'HEAD~1..HEAD';
  if (typeof baseCommit === 'string' && baseCommit.trim().length > 0) {
    const trimmedBase = baseCommit.trim();
    if (!isValidGitRevision(trimmedBase)) {
      return null;
    }
    range = trimmedBase.includes('..') ? trimmedBase : `${trimmedBase}..HEAD`;
  }

  try {
    const output = execSync(`git diff ${range}`, {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    });
    const trimmed = output.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Formats the diff-on-diff context block for reviewer prompts according to
 * Adversarial Execution Dogma §Core Mandate 3.
 */
export function formatDiffOnDiffContext(
  diff: string,
  cycle: number,
  baseCommit?: string
): string {
  const range =
    typeof baseCommit === 'string' && baseCommit.trim().length > 0
      ? baseCommit.includes('..')
        ? baseCommit.trim()
        : `${baseCommit.trim()}..HEAD`
      : 'HEAD~1..HEAD';

  return [
    `## Diff-on-Diff Remediation Audit (${range})`,
    `Remediation Cycle: ${cycle}. Audit previous remediator's changes for secondary flaws, unintended file modifications, or swallowed errors.`,
    '',
    '```diff',
    diff.trim(),
    '```',
  ].join('\n');
}

/**
 * Determines whether the given reviewer role is eligible to receive diff-on-diff scrutiny.
 */
export function isRoleEligibleForDiffOnDiff(
  role?: string,
  targetRoles?: readonly string[] | string[]
): boolean {
  if (!role) {
    return true;
  }
  const allowed = (targetRoles ?? DIFF_ON_DIFF_DEFAULT_ROLES).map(normalizeRole);
  const normalized = normalizeRole(role);
  return allowed.includes(normalized);
}

/**
 * Injects the diff-on-diff audit section into a reviewer prompt or context payload on remediation cycles >= 2.
 */
export function injectDiffOnDiff(
  basePrompt: string,
  diffOrOptions: string | null | InjectDiffOnDiffOptions,
  cycle?: number,
  reviewerRole?: string,
  options?: Partial<InjectDiffOnDiffOptions>
): string {
  let resolvedCycle = 0;
  let resolvedDiff: string | null = null;
  let resolvedProjectDir: string | undefined;
  let resolvedBaseCommit: string | undefined;
  let resolvedReviewerRole: string | undefined;
  let resolvedTargetRoles: string[] | undefined;

  if (typeof diffOrOptions === 'object' && diffOrOptions !== null) {
    resolvedCycle = diffOrOptions.cycle;
    resolvedDiff = diffOrOptions.diff ?? null;
    resolvedProjectDir = diffOrOptions.projectDir;
    resolvedBaseCommit = diffOrOptions.baseCommit;
    resolvedReviewerRole = diffOrOptions.reviewerRole;
    resolvedTargetRoles = diffOrOptions.targetRoles;
  } else {
    resolvedDiff = diffOrOptions;
    resolvedCycle = typeof cycle === 'number' ? cycle : 0;
    resolvedReviewerRole = reviewerRole;
    if (options) {
      if (options.projectDir) resolvedProjectDir = options.projectDir;
      if (options.baseCommit) resolvedBaseCommit = options.baseCommit;
      if (options.targetRoles) resolvedTargetRoles = options.targetRoles;
      if (options.reviewerRole && !resolvedReviewerRole) resolvedReviewerRole = options.reviewerRole;
    }
  }

  if (resolvedCycle < 2) {
    return basePrompt;
  }

  if (resolvedDiff === null && resolvedProjectDir) {
    resolvedDiff = computeDiffOnDiff(resolvedProjectDir, resolvedCycle, resolvedBaseCommit);
  }

  if (!resolvedDiff || typeof resolvedDiff !== 'string' || !resolvedDiff.trim()) {
    return basePrompt;
  }

  // If targetRoles is provided, enforce it
  if (resolvedTargetRoles && resolvedReviewerRole) {
    const normalizedRole = normalizeRole(resolvedReviewerRole);
    const normalizedTargets = resolvedTargetRoles.map(normalizeRole);
    if (!normalizedTargets.includes(normalizedRole)) {
      return basePrompt;
    }
  }

  const contextBlock = formatDiffOnDiffContext(resolvedDiff, resolvedCycle, resolvedBaseCommit);

  if (!basePrompt || !basePrompt.trim()) {
    return contextBlock;
  }

  return `${basePrompt}\n\n${contextBlock}`;
}

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

  /**
   * Computes git diff introduced in previous remediation attempts (HEAD~1..HEAD).
   */
  public computeDiffOnDiff(projectDir: string, cycle: number, baseCommit?: string): string | null {
    return ReviewFindingsPipeline.computeDiffOnDiff(projectDir, cycle, baseCommit);
  }

  /**
   * Formats diff-on-diff context block for reviewer prompts.
   */
  public formatDiffOnDiffContext(diff: string, cycle: number, baseCommit?: string): string {
    return ReviewFindingsPipeline.formatDiffOnDiffContext(diff, cycle, baseCommit);
  }

  /**
   * Injects diff-on-diff audit section into reviewer prompt on remediation cycles >= 2.
   */
  public injectDiffOnDiff(
    basePrompt: string,
    diffOrOptions: string | null | InjectDiffOnDiffOptions,
    cycle?: number,
    reviewerRole?: string,
    options?: Partial<InjectDiffOnDiffOptions>
  ): string {
    return ReviewFindingsPipeline.injectDiffOnDiff(basePrompt, diffOrOptions, cycle, reviewerRole, options);
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

  public static computeDiffOnDiff(projectDir: string, cycle: number, baseCommit?: string): string | null {
    return computeDiffOnDiff(projectDir, cycle, baseCommit);
  }

  public static formatDiffOnDiffContext(diff: string, cycle: number, baseCommit?: string): string {
    return formatDiffOnDiffContext(diff, cycle, baseCommit);
  }

  public static injectDiffOnDiff(
    basePrompt: string,
    diffOrOptions: string | null | InjectDiffOnDiffOptions,
    cycle?: number,
    reviewerRole?: string,
    options?: Partial<InjectDiffOnDiffOptions>
  ): string {
    return injectDiffOnDiff(basePrompt, diffOrOptions, cycle, reviewerRole, options);
  }
}

export const reviewFindingsPipeline = new ReviewFindingsPipeline();
