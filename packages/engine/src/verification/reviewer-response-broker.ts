import * as fs from 'fs';
import * as path from 'path';
import { ReviewerFindingsSchema, isResolved, type ReviewerFindings } from './reviewer-findings-schema.js';
import { sanitizeId, PathTraversalError } from '../cli/quorum-store.js';

export interface ReviewerResult {
  reviewerId: string;
  findings: ReviewerFindings;
  timedOut: boolean;
}

export interface ReviewerResponseBrokerOptions {
  timeoutMs?: number;     // default: 30_000
  workspaceDir?: string;  // default: process.cwd()
}

/**
 * ReviewerResponseBroker watches QuorumStore consensus files and extracts
 * `json:review-findings` blocks written by reviewer agents.
 *
 * Fail-closed: unresponsive reviewers are treated as FAILED after timeout.
 * Uses fs.watchFile for efficient file watching (no full-file polling).
 */
export class ReviewerResponseBroker {
  private readonly timeoutMs: number;
  private readonly workspaceDir: string;

  constructor(options: ReviewerResponseBrokerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.workspaceDir = options.workspaceDir ?? process.cwd();
  }

  /**
   * Waits for all reviewer consensus files to be written and parses their findings.
   * Fail-closed: unresponsive reviewers are treated as FAILED after timeout.
   */
  async aggregate(reviewerIds: string[]): Promise<ReviewerResult[]> {
    return Promise.all(reviewerIds.map(id => this.waitForReviewer(id)));
  }

  /**
   * Returns true only if ALL reviewers returned RESOLVED with no findings.
   */
  isConsensusResolved(results: ReviewerResult[]): boolean {
    return results.every(r => !r.timedOut && isResolved(r.findings));
  }

  private async waitForReviewer(reviewerId: string): Promise<ReviewerResult> {
    // Sanitize the ID before constructing any path
    let consensusPath: string;
    try {
      const sanitized = sanitizeId(reviewerId, this.workspaceDir, '.superconductor/quorum');
      // The actual consensus file path
      consensusPath = path.join(sanitized, 'consensus.json');
    } catch (e) {
      if (e instanceof PathTraversalError) {
        return {
          reviewerId,
          findings: { severity: 'CRITICAL', findings: [`Invalid reviewer ID: ${reviewerId}`] },
          timedOut: false,
        };
      }
      throw e;
    }

    return new Promise<ReviewerResult>((resolve) => {
      let settled = false;
      let byteOffset = 0;

      const settle = (findings: ReviewerFindings, timedOut = false) => {
        if (settled) return;
        settled = true;
        fs.unwatchFile(consensusPath);
        clearTimeout(timer);
        resolve({ reviewerId, findings, timedOut });
      };

      const checkFile = () => {
        try {
          const stat = fs.statSync(consensusPath);
          if (stat.size > byteOffset) {
            byteOffset = stat.size;
            const fullText = fs.readFileSync(consensusPath, 'utf8');
            const extracted = extractJsonBlock(fullText);
            if (extracted !== null) {
              const parsed = ReviewerFindingsSchema.safeParse(extracted);
              if (parsed.success) {
                settle(parsed.data);
                return;
              }
            }
            // Also try parsing the whole file as JSON directly (non-markdown format)
            try {
              const directParsed = ReviewerFindingsSchema.safeParse(JSON.parse(fullText));
              if (directParsed.success) {
                settle(directParsed.data);
              }
            } catch (e) { console.debug('Invalid consensus JSON format:', e instanceof Error ? e.message : String(e)); }
          }
        } catch (e) { console.debug('Consensus file not yet created:', e instanceof Error ? e.message : String(e)); }
      };

      const timer = setTimeout(() => {
        settle(
          {
            severity: 'CRITICAL',
            findings: [`Reviewer ${reviewerId} timed out after ${this.timeoutMs}ms`],
          },
          true,
        );
      }, this.timeoutMs);

      // Check immediately in case file already exists
      checkFile();
      if (!settled) {
        fs.watchFile(consensusPath, { interval: 500, persistent: false }, checkFile);
      }
    });
  }
}

/**
 * Extracts the contents of a ```json:review-findings ... ``` block from text.
 * Returns parsed JSON or null if no block is found / JSON is invalid.
 */
export function extractJsonBlock(text: string): unknown | null {
  const match = text.match(/```json:review-findings\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (e) { console.debug('Failed to parse json block:', e instanceof Error ? e.message : String(e)); return null; }
}
