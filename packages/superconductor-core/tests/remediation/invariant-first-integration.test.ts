import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  InMemorySQLiteSandbox,
  ExecutionProofRunner,
  DiffOnDiffAuditor,
  QuorumRemediationLoop,
  AutonomousQuorumRemediationLoop,
  DomainSplitRemediationDispatcher,
  buildRemediationSystemPrompt,
  INVARIANT_REMEDIATION_DOGMA,
  getDomainInceptionHint,
  type Finding,
} from '../../src/remediation/index.js';

import {
  PreflightASTChecker,
  RULE_TEST_FIXTURE_AUTOGEN,
  RULE_CF_WORKER_WAITUNTIL,
} from '../../src/review/preflight-ast-checker.js';

import {
  RunRetrospectiveEngine,
  TrackProposalBuilder,
} from '../../src/retrospective/index.js';

describe('Invariant-First Remediation & Quorum Integration Lifecycle', () => {
  let tmpDir: string;
  let suggestionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-invariant-e2e-'));
    suggestionsDir = path.join('superconductor', 'suggestions');
    fs.mkdirSync(path.join(tmpDir, suggestionsDir), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Stage A: Reviewer Finding Validation (Execution Proof vs Speculative Rejection)', () => {
    it('verifies defect reproduction against SQLite constraints and rejects speculative findings without proof', async () => {
      // 1. Initialize SQLite sandbox with relational integrity and CHECK constraints
      const sandbox = await InMemorySQLiteSandbox.create({
        schema: `
          CREATE TABLE accounts (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            balance INTEGER NOT NULL CHECK (balance >= 0),
            created_at INTEGER NOT NULL
          );
        `,
      });

      // Verify sandbox enforces CHECK constraint at execution time
      await expect(
        sandbox.execute({
          sql: 'INSERT INTO accounts (id, owner_id, balance, created_at) VALUES (?, ?, ?, ?);',
          args: ['acc_invalid', 'user_1', -50, Date.now()],
        })
      ).rejects.toThrow();

      await sandbox.close();

      // 2. Reviewer produces two candidate findings:
      // - Finding A (Verified): accompanied by an execution reproduction script that triggers the error
      // - Finding B (Speculative): speculative claim without reproducible error trace
      const runner = new ExecutionProofRunner();

      const verifiedReproSnippet = `
        console.error('SqliteError: CHECK constraint failed: balance >= 0 in accounts table');
        process.exit(1);
      `;
      const verifiedProof = await runner.execute(verifiedReproSnippet, {
        runtime: 'node',
        expectedToFail: true,
      });

      expect(verifiedProof.verified).toBe(true);
      expect(verifiedProof.exitCode).toBe(1);
      expect(verifiedProof.errorTrace).toContain('CHECK constraint failed: balance >= 0');

      const speculativeSnippet = `
        console.log('Speculative review assumption: code seems possibly slow or redundant');
        process.exit(0);
      `;
      const speculativeProof = await runner.execute(speculativeSnippet, {
        runtime: 'node',
        expectedToFail: true,
      });

      // Since expectedToFail is true, exit 0 means defect failed to reproduce -> unverified
      expect(speculativeProof.verified).toBe(false);
      expect(speculativeProof.exitCode).toBe(0);

      // Quorum gate filter: Only verified findings with execution proofs are admitted
      const candidateFindings: Array<{
        finding: Finding;
        reproCode?: string;
        proof?: typeof verifiedProof;
      }> = [
        {
          finding: {
            id: 'F_CHECK_CONSTRAINT',
            file: 'src/data/accounts.ts',
            domain: 'data',
            severity: 'CRITICAL',
            description: 'Negative account balance violates schema CHECK constraint at runtime',
          },
          reproCode: verifiedReproSnippet,
          proof: verifiedProof,
        },
        {
          finding: {
            id: 'F_SPECULATIVE_CLAIM',
            file: 'src/data/accounts.ts',
            domain: 'data',
            severity: 'LOW',
            description: 'Speculative performance concern with zero reproducible trace',
          },
          reproCode: speculativeSnippet,
          proof: speculativeProof,
        },
      ];

      const admittedFindings = candidateFindings
        .filter((c) => c.proof && c.proof.verified)
        .map((c) => ({
          ...c.finding,
          execution_proof: ExecutionProofRunner.formatProofMarkdown(c.proof!),
        }));

      expect(admittedFindings).toHaveLength(1);
      expect(admittedFindings[0].id).toBe('F_CHECK_CONSTRAINT');
      expect(admittedFindings[0].execution_proof).toContain('### 🔬 Ephemeral Execution Proof');
      expect(admittedFindings[0].execution_proof).toContain('CHECK constraint failed');
    });
  });

  describe('Stage B: Remediator Prompt Invariant Dogma & Domain Inception Guidance', () => {
    it('injects invariant-first dogma, forbids call-site defensive patching, and attaches domain inception hints', () => {
      const basePrompt = 'You are the assigned Superconductor Processor subagent.';
      const findings: Finding[] = [
        {
          id: 'F_CHECK_CONSTRAINT',
          file: 'src/data/accounts.ts',
          domain: 'data',
          severity: 'CRITICAL',
          description: 'Negative account balance violates schema CHECK constraint',
        },
      ];

      const generatedPrompt = buildRemediationSystemPrompt(basePrompt, {
        domain: 'data',
        findings,
      });

      // 1. Invariant-First Dogma rules
      expect(generatedPrompt).toContain(INVARIANT_REMEDIATION_DOGMA);
      expect(generatedPrompt).toContain('1. INCEPTION MANDATE (No Call-Site Defensive Nulling)');
      expect(generatedPrompt).toContain('Strictly FORBID call-site defensive nulling (?? 0, || [], ?? \'\', ?., or empty catch {})');
      expect(generatedPrompt).toContain('2. ATOMIC DUAL-WRITE & SINGLE SOURCE OF TRUTH (SSOT)');
      expect(generatedPrompt).toContain('3. EXECUTION FIDELITY (Production Schema & Runtime Lifecycle)');
      expect(generatedPrompt).toContain('4. STRICT SEQUENCE MONOTONICITY');
      expect(generatedPrompt).toContain('5. ZERO TEST WEAKENING (Anti-Test-Theatre)');

      // 2. Domain Inception Hint for "data" domain
      const expectedHint = getDomainInceptionHint('data');
      expect(expectedHint).toBeDefined();
      expect(generatedPrompt).toContain('### Domain Inception Guidance (data)');
      expect(generatedPrompt).toContain(expectedHint!);
      expect(generatedPrompt).toContain('Trace state mutations to database transactions, migration scripts, SQLite CHECK constraints');
    });
  });

  describe('Stage C: Diff-on-Diff Scrutiny & Secondary Regression Blocking in Quorum Loop', () => {
    it('detects scope creep, defensive nulling ?? 0, and swallowed exceptions, blocking the quorum remediation loop', async () => {
      const auditor = new DiffOnDiffAuditor();

      // Diff simulating remediator attempting quick local-patch anti-patterns
      const dirtyRemediationDiff = `diff --git a/src/data/accounts.ts b/src/data/accounts.ts
--- a/src/data/accounts.ts
+++ b/src/data/accounts.ts
@@ -14,6 +14,14 @@
+  // Anti-pattern 1: defensive nulling instead of root invariant fix
+  const safeBalance = account.balance ?? 0;
+  // Anti-pattern 2: swallowed exception
+  try {
+    persistBalance(safeBalance);
+  } catch (err) {}
diff --git a/src/unrelated/config.ts b/src/unrelated/config.ts
--- a/src/unrelated/config.ts
+++ b/src/unrelated/config.ts
@@ -1,2 +1,3 @@
+// Anti-pattern 3: scope creep in unrelated file
+export const UNRELATED = true;
`;

      const auditResult = await auditor.audit({
        rawDiff: dirtyRemediationDiff,
        expectedFiles: ['src/data/accounts.ts'],
        targetFindings: [
          { id: 'F_CHECK_CONSTRAINT', file: 'src/data/accounts.ts', domain: 'data' },
        ],
      });

      expect(auditResult.passed).toBe(false);
      expect(auditResult.secondaryFindings.length).toBeGreaterThanOrEqual(3);

      const categories = auditResult.secondaryFindings.map((f) => f.category);
      expect(categories).toContain('scope_creep');
      expect(categories).toContain('defensive_nulling');
      expect(categories).toContain('swallowed_error');

      // Now verify that QuorumRemediationLoop halts and blocks re-review when secondary regressions are detected
      let cycle = 0;
      const getDiffFn = vi.fn().mockImplementation(() => {
        cycle++;
        if (cycle === 1) {
          return 'diff --git a/src/data/accounts.ts b/src/data/accounts.ts\n+const originalIssue = 1;';
        }
        return dirtyRemediationDiff;
      });

      const reviewerFn = vi.fn().mockImplementation(async (c: number) => {
        if (c === 1) {
          return {
            status: 'NEEDS_FIXES' as const,
            findings: [{ id: 'F_CHECK_CONSTRAINT', file: 'src/data/accounts.ts', severity: 'HIGH' }],
          };
        }
        return { status: 'RESOLVED' as const, findings: [] };
      });

      const loop = new AutonomousQuorumRemediationLoop({
        trackId: 'track-secondary-regression-guard',
        reviewerFn,
        getDiffFn,
        diffAuditor: auditor,
        expectedFiles: ['src/data/accounts.ts'],
        secondaryRegressionPolicy: 'abort',
        maxCycles: 5,
      });

      const result = await loop.run();

      expect(result.allGreen).toBe(false);
      expect(result.state).toBe('HALTED');
      expect(result.secondaryRegressionDetected).toBe(true);
      expect(result.cycles).toBe(2);
      // Reviewer MUST NOT be invoked on cycle 2 because diff-on-diff blocked before re-review
      expect(reviewerFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Stage D: Preflight AST Static Guard Verifications', () => {
    const checker = new PreflightASTChecker();

    it('detects forbidden snapshot writeFileSync inside test files', () => {
      const violatingTestCode = `
        import fs from 'node:fs';
        import { describe, it } from 'vitest';

        describe('Accounts Integration', () => {
          it('auto-generates snapshot on failure', () => {
            fs.writeFileSync('fixtures/accounts-snapshot.json', JSON.stringify({ ok: true }));
          });
        });
      `;

      const result = checker.scanContent(violatingTestCode, 'tests/data/accounts.test.ts');
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.rule === RULE_TEST_FIXTURE_AUTOGEN)).toBe(true);
      expect(result.violations[0].message).toContain('writeFileSync');
    });

    it('detects Cloudflare Worker background operations missing ctx.waitUntil', () => {
      const violatingWorkerCode = `
        export default {
          async fetch(request, env, ctx) {
            // Unawaited async background call on env without ctx.waitUntil
            env.ANALYTICS.put('event', 'request_received');
            return new Response('OK');
          }
        };
      `;

      const result = checker.scanContent(violatingWorkerCode, 'src/workers/telemetry-worker.ts');
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.rule === RULE_CF_WORKER_WAITUNTIL)).toBe(true);
      expect(result.violations[0].message).toContain('ctx.waitUntil');
    });

    it('validates compliant invariant-first code without violations', () => {
      const compliantWorkerCode = `
        export default {
          async fetch(request, env, ctx) {
            ctx.waitUntil(env.ANALYTICS.put('event', 'request_received'));
            return new Response('OK');
          }
        };
      `;

      const result = checker.scanContent(compliantWorkerCode, 'src/workers/telemetry-worker.ts');
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Stage E: Closed-Loop Post-Run Retrospective & Proposal Generation', () => {
    it('ingests run notes and writes structured track proposals in superconductor/suggestions/', async () => {
      const runNotes = [
        {
          note_type: 'quorum',
          content: 'Quorum review failed on cycle 1 due to SQLite CHECK constraint violation in accounts schema',
          severity: 'warning',
          track_id: 'invariant_e2e_track',
        },
        {
          note_type: 'procedure',
          content: 'Secondary regression caught by DiffOnDiffAuditor: unhandled scope creep in config module',
          severity: 'warning',
          track_id: 'invariant_e2e_track',
        },
        {
          note_type: 'warning',
          content: 'Need automated schema-level validator for transaction boundaries to prevent negative balances',
          severity: 'critical',
          track_id: 'invariant_e2e_track',
        },
      ];

      const notebookQueryFn = vi.fn().mockResolvedValue(runNotes);

      const engine = new RunRetrospectiveEngine({
        projectRoot: tmpDir,
        suggestionsDir,
        notebookQueryFn,
        confidenceThreshold: 0.7,
      });

      const result = await engine.run({
        trackId: 'invariant_e2e_track',
        remediationCycles: 2,
        errorCount: 1,
        touchedFiles: ['src/data/accounts.ts'],
        notes: runNotes,
      });

      expect(result.skippedDueToLowConfidence).toBe(false);
      expect(result.proposalsGenerated.length).toBeGreaterThan(0);
      expect(result.savedProposalPaths.length).toBeGreaterThan(0);

      const generatedFile = result.savedProposalPaths[0];
      expect(fs.existsSync(generatedFile)).toBe(true);

      const content = fs.readFileSync(generatedFile, 'utf8');
      expect(content).toContain('category:');
      expect(content).toContain('confidence:');
      expect(content).toContain('# Superconductor Track Proposal:');
      expect(content).toContain('## 1. Problem Statement');
    });
  });

  describe('Stage F: End-to-End Complete Lifecycle Flow', () => {
    it('orchestrates end-to-end: finding -> proof -> invariant prompt -> diff audit block -> clean invariant fix -> preflight check -> retrospective proposal', async () => {
      // Step 1: Real SQLite constraint validation + Reviewer execution proof
      const dbSandbox = await InMemorySQLiteSandbox.create({
        schema: `
          CREATE TABLE accounts (
            id TEXT PRIMARY KEY,
            balance INTEGER NOT NULL CHECK (balance >= 0)
          );
        `,
      });

      const proofRunner = new ExecutionProofRunner();
      const reproProof = await proofRunner.execute(
        `console.error('SqliteError: CHECK constraint failed: balance >= 0'); process.exit(1);`,
        { runtime: 'node', expectedToFail: true }
      );
      expect(reproProof.verified).toBe(true);

      const initialFinding: Finding = {
        id: 'FINDING_ACCOUNT_CHECK',
        file: 'src/data/accounts.ts',
        domain: 'data',
        severity: 'CRITICAL',
        description: 'Negative balance violates SQLite CHECK constraint',
        execution_proof: ExecutionProofRunner.formatProofMarkdown(reproProof),
      };

      // Step 2: Build remediator prompt with invariant-first dogma
      const prompt = buildRemediationSystemPrompt('Fix the reported accounts issue', {
        domain: 'data',
        findings: [initialFinding],
      });
      expect(prompt).toContain(INVARIANT_REMEDIATION_DOGMA);
      expect(prompt).toContain('Strictly FORBID call-site defensive nulling');

      // Step 3: Quorum execution simulation
      // Attempt 1 fails diff-on-diff with secondary regression;
      // Remediator corrects to clean invariant fix on schema & transaction origin.
      let currentDiff = 'diff --git a/src/data/accounts.ts b/src/data/accounts.ts\n+const broken = true;';
      const diffAuditor = new DiffOnDiffAuditor();

      let cycleNumber = 0;
      const getDiffFn = vi.fn().mockImplementation(() => {
        cycleNumber++;
        if (cycleNumber === 1) {
          return currentDiff;
        }
        // Cycle 2: Remediator provides clean invariant fix at inception
        return `diff --git a/src/data/accounts.ts b/src/data/accounts.ts
--- a/src/data/accounts.ts
+++ b/src/data/accounts.ts
@@ -10,3 +10,6 @@
+export function createAccount(id: string, initialBalance: number) {
+  if (initialBalance < 0) throw new RangeError('Initial balance cannot be negative');
+  return { id, balance: initialBalance };
+}
`;
      });

      const reviewerFn = vi.fn().mockImplementation(async (cycle: number) => {
        if (cycle === 1) {
          return {
            status: 'NEEDS_FIXES' as const,
            findings: [initialFinding],
          };
        }
        // Cycle 2: verified against invariant
        return {
          status: 'RESOLVED' as const,
          findings: [],
        };
      });

      const quorumLoop = new AutonomousQuorumRemediationLoop({
        trackId: 'track-full-lifecycle-e2e',
        reviewerFn,
        getDiffFn,
        diffAuditor,
        expectedFiles: ['src/data/accounts.ts'],
        maxCycles: 5,
      });

      const loopResult = await quorumLoop.run();

      expect(loopResult.allGreen).toBe(true);
      expect(loopResult.state).toBe('PASSED');
      expect(loopResult.cycles).toBe(2);

      // Step 4: Verify preflight AST gate passes on the final code
      const astChecker = new PreflightASTChecker();
      const finalCode = `
        export function createAccount(id: string, initialBalance: number) {
          if (initialBalance < 0) throw new RangeError('Initial balance cannot be negative');
          return { id, balance: initialBalance };
        }
      `;
      const preflightResult = astChecker.scanContent(finalCode, 'src/data/accounts.ts');
      expect(preflightResult.valid).toBe(true);
      expect(preflightResult.violations).toHaveLength(0);

      // Verify that applying clean fix in SQLite sandbox succeeds
      await dbSandbox.execute({
        sql: 'INSERT INTO accounts (id, balance) VALUES (?, ?);',
        args: ['acc_clean', 100],
      });
      const queryRes = await dbSandbox.execute({
        sql: 'SELECT * FROM accounts WHERE id = ?;',
        args: ['acc_clean'],
      });
      expect(queryRes.rows.length).toBe(1);
      expect(Number(queryRes.rows[0].balance)).toBe(100);
      await dbSandbox.close();

      // Step 5: Post-run retrospective engine writes proposal to superconductor/suggestions/
      const retroEngine = new RunRetrospectiveEngine({
        projectRoot: tmpDir,
        suggestionsDir,
        notebookQueryFn: vi.fn().mockResolvedValue([
          {
            note_type: 'quorum',
            content: 'Quorum completed in 2 cycles. Invariant-first inception fix resolved SQLite constraint.',
            severity: 'procedure',
            track_id: 'track-full-lifecycle-e2e',
          },
        ]),
        confidenceThreshold: 0.7,
      });

      const retroResult = await retroEngine.run({
        trackId: 'track-full-lifecycle-e2e',
        remediationCycles: 2,
        errorCount: 0,
        touchedFiles: ['src/data/accounts.ts'],
        notes: [
          {
            note_type: 'procedure',
            content: 'Process improvement: enforce transaction balance invariants before DB ingress.',
            severity: 'warning',
            track_id: 'track-full-lifecycle-e2e',
          },
        ],
      });

      expect(retroResult.savedProposalPaths.length).toBeGreaterThan(0);
      const savedProposal = retroResult.savedProposalPaths[0];
      expect(fs.existsSync(savedProposal)).toBe(true);
      const savedProposalContent = fs.readFileSync(savedProposal, 'utf8');
      expect(savedProposalContent).toContain('# Superconductor Track Proposal:');
      expect(savedProposalContent).toContain('track-full-lifecycle-e2e');
    });
  });
});
