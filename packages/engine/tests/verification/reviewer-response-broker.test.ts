/**
 * reviewer-response-broker.test.ts
 *
 * TDD tests for ReviewerResponseBroker + Zod schema.
 * Tests are ordered: schema validation → broker mechanics → security.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ReviewerResponseBroker,
  extractJsonBlock,
} from '../../src/verification/reviewer-response-broker.js';
import {
  ReviewerFindingsSchema,
  isResolved,
} from '../../src/verification/reviewer-findings-schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrb-test-'));
  return dir;
}

/**
 * Writes a consensus file in the expected location for a given reviewerId.
 * Content may be a plain JSON string or markdown with a json:review-findings block.
 */
function writeConsensusFile(workspaceDir: string, reviewerId: string, content: string): void {
  const dir = path.join(workspaceDir, '.superconductor', 'quorum', reviewerId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'consensus.json'), content, 'utf8');
}

// ---------------------------------------------------------------------------
// Zod schema tests
// ---------------------------------------------------------------------------

describe('ReviewerFindingsSchema', () => {
  it('accepts RESOLVED status', () => {
    const result = ReviewerFindingsSchema.safeParse({ status: 'RESOLVED' });
    expect(result.success).toBe(true);
  });

  it('accepts CRITICAL findings payload', () => {
    const result = ReviewerFindingsSchema.safeParse({
      severity: 'CRITICAL',
      findings: ['something bad'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts ADVISORY findings with object findings', () => {
    const result = ReviewerFindingsSchema.safeParse({
      severity: 'ADVISORY',
      findings: [
        {
          severity: 'advisory',
          description: 'Minor issue',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects malformed payload — missing findings array', () => {
    const result = ReviewerFindingsSchema.safeParse({
      severity: 'CRITICAL',
      // findings is required and must have at least 1 item
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed payload — empty findings array', () => {
    const result = ReviewerFindingsSchema.safeParse({
      severity: 'CRITICAL',
      findings: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown status value', () => {
    const result = ReviewerFindingsSchema.safeParse({
      status: 'PENDING',
      findings: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects finding object missing required description', () => {
    const result = ReviewerFindingsSchema.safeParse({
      severity: 'CRITICAL',
      findings: [{ severity: 'critical' /* description missing */ }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isResolved helper
// ---------------------------------------------------------------------------

describe('isResolved()', () => {
  it('returns true for RESOLVED findings', () => {
    const resolved = ReviewerFindingsSchema.parse({ status: 'RESOLVED' });
    expect(isResolved(resolved)).toBe(true);
  });

  it('returns false for CRITICAL findings', () => {
    const failed = ReviewerFindingsSchema.parse({
      severity: 'CRITICAL',
      findings: ['bad'],
    });
    expect(isResolved(failed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractJsonBlock
// ---------------------------------------------------------------------------

describe('extractJsonBlock()', () => {
  it('extracts valid json:review-findings block from surrounding text', () => {
    const text = `
Some preamble text here.

\`\`\`json:review-findings
{"status":"RESOLVED"}
\`\`\`

Trailing text.
`;
    const result = extractJsonBlock(text);
    expect(result).toEqual({ status: 'RESOLVED' });
  });

  it('returns null when no block is found', () => {
    const result = extractJsonBlock('No code block here at all');
    expect(result).toBeNull();
  });

  it('returns null for malformed JSON inside block', () => {
    const text = '```json:review-findings\n{not-valid-json}\n```';
    const result = extractJsonBlock(text);
    expect(result).toBeNull();
  });

  it('extracts CRITICAL findings payload correctly', () => {
    const payload = { severity: 'CRITICAL', findings: ['Issue A', 'Issue B'] };
    const text = `\`\`\`json:review-findings\n${JSON.stringify(payload)}\n\`\`\``;
    const result = extractJsonBlock(text);
    expect(result).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// ReviewerResponseBroker — core behavior
// ---------------------------------------------------------------------------

describe('ReviewerResponseBroker', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
  });

  function mkTmp(): string {
    const d = makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  // ── RESOLVED ──────────────────────────────────────────────────────────────

  it('aggregate returns RESOLVED when consensus file contains {"status":"RESOLVED"}', async () => {
    const workspaceDir = mkTmp();
    writeConsensusFile(workspaceDir, 'reviewer-1', JSON.stringify({ status: 'RESOLVED' }));

    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 2000 });
    const results = await broker.aggregate(['reviewer-1']);

    expect(results).toHaveLength(1);
    expect(results[0].timedOut).toBe(false);
    expect(isResolved(results[0].findings)).toBe(true);
  });

  it('aggregate returns RESOLVED when consensus file contains markdown json:review-findings block', async () => {
    const workspaceDir = mkTmp();
    const content = `Agent completed review.\n\`\`\`json:review-findings\n{"status":"RESOLVED"}\n\`\`\`\nEnd.`;
    writeConsensusFile(workspaceDir, 'reviewer-1', content);

    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 2000 });
    const results = await broker.aggregate(['reviewer-1']);

    expect(results[0].timedOut).toBe(false);
    expect(isResolved(results[0].findings)).toBe(true);
  });

  // ── CRITICAL ──────────────────────────────────────────────────────────────

  it('aggregate returns CRITICAL when consensus file contains {"severity":"CRITICAL","findings":["bad"]}', async () => {
    const workspaceDir = mkTmp();
    writeConsensusFile(
      workspaceDir,
      'reviewer-1',
      JSON.stringify({ severity: 'CRITICAL', findings: ['bad'] }),
    );

    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 2000 });
    const results = await broker.aggregate(['reviewer-1']);

    expect(results[0].timedOut).toBe(false);
    expect(isResolved(results[0].findings)).toBe(false);
    const findings = results[0].findings as { severity: string; findings: unknown[] };
    expect(findings.severity).toBe('CRITICAL');
  });

  // ── TIMEOUT ───────────────────────────────────────────────────────────────

  it('aggregate returns CRITICAL with timedOut:true when file is NOT written within timeout', async () => {
    const workspaceDir = mkTmp();
    // Do NOT write any consensus file

    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 100 });
    const results = await broker.aggregate(['reviewer-1']);

    expect(results[0].timedOut).toBe(true);
    expect(isResolved(results[0].findings)).toBe(false);
    const findings = results[0].findings as { severity: string; findings: string[] };
    expect(findings.severity).toBe('CRITICAL');
    expect(findings.findings[0]).toContain('timed out');
  }, 3000);

  // ── MALFORMED PAYLOAD ─────────────────────────────────────────────────────

  it('treats malformed payload (missing required fields) as timeout/FAILED', async () => {
    const workspaceDir = mkTmp();
    // Write a file that passes JSON parse but fails Zod validation
    // Missing 'findings' field on CRITICAL severity → Zod rejects
    writeConsensusFile(workspaceDir, 'reviewer-1', JSON.stringify({ severity: 'CRITICAL' }));

    // Use short timeout so the test doesn't hang waiting for valid content
    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 150 });
    const results = await broker.aggregate(['reviewer-1']);

    // Should time out because the written payload is invalid
    expect(results[0].timedOut).toBe(true);
    expect(isResolved(results[0].findings)).toBe(false);
  }, 3000);

  // ── isConsensusResolved ───────────────────────────────────────────────────

  it('isConsensusResolved returns true only when ALL reviewers resolved', async () => {
    const workspaceDir = mkTmp();
    writeConsensusFile(workspaceDir, 'reviewer-1', JSON.stringify({ status: 'RESOLVED' }));
    writeConsensusFile(workspaceDir, 'reviewer-2', JSON.stringify({ status: 'RESOLVED' }));

    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 2000 });
    const results = await broker.aggregate(['reviewer-1', 'reviewer-2']);

    expect(broker.isConsensusResolved(results)).toBe(true);
  });

  it('isConsensusResolved returns false if any reviewer returns CRITICAL', async () => {
    const workspaceDir = mkTmp();
    writeConsensusFile(workspaceDir, 'reviewer-1', JSON.stringify({ status: 'RESOLVED' }));
    writeConsensusFile(
      workspaceDir,
      'reviewer-2',
      JSON.stringify({ severity: 'CRITICAL', findings: ['bad'] }),
    );

    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 2000 });
    const results = await broker.aggregate(['reviewer-1', 'reviewer-2']);

    expect(broker.isConsensusResolved(results)).toBe(false);
  });

  it('isConsensusResolved returns false if any reviewer timed out', async () => {
    const workspaceDir = mkTmp();
    writeConsensusFile(workspaceDir, 'reviewer-1', JSON.stringify({ status: 'RESOLVED' }));
    // reviewer-2 NOT written → times out

    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 100 });
    const results = await broker.aggregate(['reviewer-1', 'reviewer-2']);

    expect(broker.isConsensusResolved(results)).toBe(false);
    const r2 = results.find(r => r.reviewerId === 'reviewer-2')!;
    expect(r2.timedOut).toBe(true);
  }, 3000);

  // ── SECURITY: path traversal ──────────────────────────────────────────────

  it('aggregate with path-traversal reviewerId ("../evil") returns CRITICAL finding with timedOut:false', async () => {
    const workspaceDir = mkTmp();

    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 1000 });
    const results = await broker.aggregate(['../evil']);

    expect(results).toHaveLength(1);
    expect(results[0].timedOut).toBe(false);
    expect(isResolved(results[0].findings)).toBe(false);
    const findings = results[0].findings as { severity: string; findings: string[] };
    expect(findings.severity).toBe('CRITICAL');
    expect(findings.findings[0]).toContain('Invalid reviewer ID');
  }, 3000);

  it('aggregate with path-traversal reviewerId does NOT throw', async () => {
    const workspaceDir = mkTmp();
    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 1000 });

    await expect(broker.aggregate(['../../../etc/passwd'])).resolves.toBeDefined();
  }, 3000);

  // ── Multiple reviewers ────────────────────────────────────────────────────

  it('aggregate handles multiple reviewers returning in parallel', async () => {
    const workspaceDir = mkTmp();
    writeConsensusFile(workspaceDir, 'reviewer-1', JSON.stringify({ status: 'RESOLVED' }));
    writeConsensusFile(workspaceDir, 'reviewer-2', JSON.stringify({ status: 'RESOLVED' }));
    writeConsensusFile(
      workspaceDir,
      'reviewer-3',
      JSON.stringify({ severity: 'ADVISORY', findings: ['minor issue'] }),
    );

    const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 2000 });
    const results = await broker.aggregate(['reviewer-1', 'reviewer-2', 'reviewer-3']);

    expect(results).toHaveLength(3);
    expect(isResolved(results[0].findings)).toBe(true);
    expect(isResolved(results[1].findings)).toBe(true);
    expect(isResolved(results[2].findings)).toBe(false);
    expect(broker.isConsensusResolved(results)).toBe(false);
  });
});
