#!/usr/bin/env node
// Usage: node scripts/quorum-review.ts --branch <b> [--codebase] [--fast] [--remediate] [--no-signoff]

import { parseArgs } from 'node:util';
import { promisify } from 'node:util';
import * as child_process from 'node:child_process';
import { QuorumFSM } from '../packages/quorum-fsm/src/fsm/quorum-fsm.js';
import { QuorumStateStore } from '../packages/quorum-fsm/src/persistence/quorum-state-store.js';
import { StagnantDiffDetector } from '../packages/quorum-fsm/src/circuit-breaker/stagnant-diff-detector.js';
import { ZeroBiasContextBuilder } from '../packages/quorum-fsm/src/zero-bias/zero-bias-context-builder.js';
import { DomainSplitRemediationDispatcher } from '../packages/superconductor-core/dist/remediation/domain-split-remediation-dispatcher.js';
import { aggregateFindings } from './aggregate-findings.js';
import { QuorumValidator } from '../packages/superconductor-core/dist/orchestration/quorum-validator.js';
import { PreflightGate } from '../packages/superconductor-core/dist/orchestration/preflight-gate.js';

const execFileAsync = promisify(child_process.execFile);
const MAX_CYCLES = 5;

export interface RunQuorumOptions {
  store?: QuorumStateStore;
  fsm?: QuorumFSM;
  getDiffFn?: (branch?: string) => string;
  exitFn?: (code: number) => never | void;
  sessionId?: string;
}

function sanitizePath(p?: string): string {
  if (!p) return '';
  const sanitized = p.replace(/[^a-zA-Z0-9_\-\.\/]/g, '');
  if (sanitized.startsWith('-')) {
    throw new Error('Invalid path: cannot start with a hyphen');
  }
  return sanitized;
}

export async function runQuorumReview(rawArgs: string[], options: RunQuorumOptions = {}): Promise<{ cycles: number; state: string }> {
  const { values } = parseArgs({
    args: rawArgs,
    options: {
      branch: { type: 'string' },
      domain: { type: 'string' },
      codebase: { type: 'boolean' },
      fast: { type: 'boolean' },
      remediate: { type: 'boolean' },
      'no-signoff': { type: 'boolean' },
    },
  });

  const track_id = sanitizePath(values.domain) || sanitizePath(values.branch) || 'codebase';
  const session_id = options.sessionId || Date.now().toString();
  const store = options.store || new QuorumStateStore();
  const fsm = options.fsm || new QuorumFSM();
  const exit = options.exitFn || ((code: number) => process.exit(code));
  const defaultGetDiff = (branchName?: string) => {
    try {
      return child_process.execFileSync('git', ['diff', `main..${sanitizePath(branchName) || 'HEAD'}`]).toString();
    } catch (error: any) {
      console.error(`[QuorumFSM] Failed to get diff: ${error.message}`);
      return exit(1);
    }
  };
  const getDiff = options.getDiffFn || defaultGetDiff;

  let record = await store.load(track_id, session_id);
  if (!record) {
    record = {
      track_id,
      session_id,
      state: 'INIT',
      cycle_count: 0,
      last_diff_hash: null,
      reviewer_session_id: null,
      timestamp: Date.now(),
      sha256_checksum: '',
    };
  }

  if (record.cycle_count >= MAX_CYCLES) {
    record.state = fsm.transition(record.state, 'MAX_CYCLES_EXCEEDED').newState;
    await store.save(record);
    console.error(`[QuorumFSM] MAX_CYCLES (${MAX_CYCLES}) exceeded. Escalating to Oracle.`);
    console.log(JSON.stringify({ type: 'escalation_report', reason: 'MAX_CYCLES_EXCEEDED', track_id }));
    return exit(2) as never;
  }

  if (record.state === 'INIT') {
    record.state = fsm.transition(record.state, 'START').newState;
    await store.save(record);
    console.log(`[QuorumFSM] State: ${record.state} | Cycle: ${record.cycle_count}/${MAX_CYCLES}`);
  }

  // In --fast mode: single pass, no loop
  if (values.fast) {
    console.log('[QuorumFSM] Fast mode: single pass, no quorum loop.');
    return { cycles: record.cycle_count, state: record.state };
  }

  // PreflightGate verification
  const preflightGate = new PreflightGate(store);
  const preflightRes = await preflightGate.check({ trackId: track_id, sessionId: session_id });
  if (!preflightRes.passed) {
    console.error(`[PreflightGate] Blocked: ${preflightRes.reason}`);
    return exit(3) as never;
  }

  // Main quorum loop (max MAX_CYCLES)
  while (record.state !== 'PASSED' && record.state !== 'HALTED' && record.cycle_count < MAX_CYCLES) {
    const diff = getDiff(values.branch || values.domain);
    const diffHash = StagnantDiffDetector.hashDiff(diff);

    // Check stagnant diff
    if (StagnantDiffDetector.isStagnant(diffHash, record.last_diff_hash)) {
      console.error('[QuorumFSM] STAGNANT_DIFF detected: remediation produced identical diff. Halting.');
      record.state = fsm.transition(record.state, 'STAGNANT_DIFF').newState;
      await store.save(record);
      console.log(JSON.stringify({ type: 'escalation_report', reason: 'STAGNANT_DIFF', track_id }));
      return exit(1) as never;
    }

    record.last_diff_hash = diffHash;
    record.cycle_count++;
    await store.save(record);

    let priorFindings: any[] = [];
    const findingsPath = require('node:path').join(process.cwd(), 'superconductor', 'logs', 'quorum-state.json');
    if (require('node:fs').existsSync(findingsPath)) {
      try {
        const stateData = JSON.parse(require('node:fs').readFileSync(findingsPath, 'utf8'));
        if (stateData.findings && Array.isArray(stateData.findings)) {
          priorFindings = stateData.findings;
        }
      } catch (e) {}
    }

    const zbContext = ZeroBiasContextBuilder.build({
      diff,
      preflight_output: '',
      prior_findings: priorFindings,
      cycle: record.cycle_count
    });

    console.log(`[QuorumFSM] Cycle ${record.cycle_count}: reviewing diff (hash: ${diffHash.slice(0, 8)}...). ZeroBias context built.`);
    console.log(`[QuorumFSM] Dispatching reviewer for cycle ${record.cycle_count}.`);
    
    try {
      if (values.remediate) {
        let reviewerOutputs: { reviewer_id: string; raw_text?: string }[] = [
          { reviewer_id: 'security-reviewer' },
          { reviewer_id: 'correctness-reviewer' },
          { reviewer_id: 'adversarial-reviewer' },
          { reviewer_id: 'regression-reviewer' }
        ];
        
        if (priorFindings.length > 0) {
          reviewerOutputs = reviewerOutputs.concat(priorFindings.map((f: any) => ({
            reviewer_id: f.reviewer_id || 'system',
            raw_text: `\`\`\`json:review-findings\n[${JSON.stringify(f)}]\n\`\`\``
          })));
        }
        
        const manifestsDir = require('node:path').join(process.cwd(), 'superconductor', 'manifests');
        const findings = aggregateFindings(reviewerOutputs, manifestsDir);
        const dispatcher = new DomainSplitRemediationDispatcher({
          spawner: async (info) => {
            await execFileAsync('antigravity', ['--remediate', track_id, '--domain', info.domain]);
          }
        });
        await dispatcher.dispatch(findings, { trackId: track_id });
      } else {
        await execFileAsync('antigravity', ['--review', track_id]);
        
        if (priorFindings.length > 0 && require('node:fs').existsSync(findingsPath)) {
          try {
            const newStateData = JSON.parse(require('node:fs').readFileSync(findingsPath, 'utf8'));
            if (newStateData.findings && Array.isArray(newStateData.findings)) {
              const priorStrs = new Set(priorFindings.map((f: any) => JSON.stringify(f)));
              for (const f of newStateData.findings) {
                if (priorStrs.has(JSON.stringify(f))) {
                  console.error('[QuorumFSM] EXACT_FINDING_DUPLICATED: exact same finding emitted again. Fast-failing.');
                  record.state = fsm.transition(record.state, 'STAGNANT_DIFF').newState;
                  await store.save(record);
                  return exit(1) as never;
                }
              }
            }
          } catch (e) {}
        }
      }
    } catch (err: any) {
      console.error(`[QuorumFSM] Sub-process failed: ${err.message}`);
      record.state = 'HALTED';
      await store.save(record);
      return exit(1) as never;
    }

    // Refresh state after run
    const refreshed = await store.load(track_id, session_id);
    if (refreshed) {
      record = refreshed;
    }

    let unresolvedCount = 0;
    if (require('node:fs').existsSync(findingsPath)) {
      try {
        const stateData = JSON.parse(require('node:fs').readFileSync(findingsPath, 'utf8'));
        if (stateData.findings && Array.isArray(stateData.findings)) {
          unresolvedCount = stateData.findings.filter((f: any) => f.status !== 'RESOLVED').length;
        }
      } catch (e) {}
    }

    if (unresolvedCount === 0) {
      record.state = fsm.transition(record.state, 'ALL_PASSED').newState;
      await store.save(record);
    }
  }

  if (record.cycle_count >= MAX_CYCLES && record.state !== 'PASSED') {
    record.state = fsm.transition(record.state, 'MAX_CYCLES_EXCEEDED').newState;
    await store.save(record);
    console.error(`[QuorumFSM] MAX_CYCLES (${MAX_CYCLES}) exceeded. Escalating to Oracle.`);
    console.log(JSON.stringify({ type: 'escalation_report', reason: 'MAX_CYCLES_EXCEEDED', track_id }));
    return exit(2) as never;
  }

  if (record.state === 'PASSED') {
    QuorumValidator.gateOracle({ quorumPassed: true });
    try {
      const findingsPath = require('node:path').join(process.cwd(), 'superconductor', 'logs', 'quorum-state.json');
      let invoked = false;
      if (require('node:fs').existsSync(findingsPath)) {
        const stateData = JSON.parse(require('node:fs').readFileSync(findingsPath, 'utf8'));
        const resolvedFindings = (stateData.findings || []).filter((f: any) => f.status === 'RESOLVED');
        for (const finding of resolvedFindings) {
          await execFileAsync('antigravity', [
            '--mcp', 'notebook_write',
            '--note_type', 'quorum',
            '--content', `Quorum passed for ${track_id}`,
            '--files', '[]',
            '--domain', values.domain || 'codebase',
            '--severity', 'info',
            '--invocation_id', Date.now().toString(),
            '--reviewer_token', finding.reviewer_id || record.reviewer_session_id || ''
          ]);
          invoked = true;
        }
      }
      if (!invoked) {
        await execFileAsync('antigravity', [
          '--mcp', 'notebook_write',
          '--note_type', 'quorum',
          '--content', `Quorum passed for ${track_id}`,
          '--files', '[]',
          '--domain', values.domain || 'codebase',
          '--severity', 'info',
          '--invocation_id', Date.now().toString(),
          '--reviewer_token', record.reviewer_session_id || ''
        ]);
      }
    } catch (e: any) {
      console.error(`[QuorumFSM] Failed to emit notebook_write: ${e.message}`);
    }
  }

  console.log(`[QuorumFSM] Final state: ${record.state}`);
  return { cycles: record.cycle_count, state: record.state };
}

if (process.argv[1] && process.argv[1].endsWith('quorum-review.ts')) {
  runQuorumReview(process.argv.slice(2)).catch(console.error);
}
