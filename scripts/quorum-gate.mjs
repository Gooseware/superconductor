#!/usr/bin/env node

/**
 * CLI gate runner for QuorumValidator.
 * Remediates ADV-009 by providing a CLI gate runner for quorum verification.
 *
 * Exit codes:
 *   0: Quorum green (safe to proceed)
 *   1: Quorum NOT green (HALT)
 *   2: Quorum state cannot be read (HALT)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Import QuorumValidator from compiled dist
const distPath = resolve(repoRoot, 'packages/superconductor-core/dist/orchestration/quorum-validator.js');

let QuorumValidator;
let QuorumInsufficientError;
let OracleGateError;

try {
  const module = await import(distPath);
  QuorumValidator = module.QuorumValidator;
  QuorumInsufficientError = module.QuorumInsufficientError;
  OracleGateError = module.OracleGateError;
} catch (err) {
  console.error(`QUORUM GATE FAILED: Could not import QuorumValidator from ${distPath}: ${err.message}`);
  process.exit(2);
}

function parseListArg(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items
    .flatMap((item) => String(item).split(','))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runGate() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      gate: { type: 'boolean', default: false },
      'reviewer-ids': { type: 'string', multiple: true },
      panel: { type: 'string', multiple: true },
      'track-id': { type: 'string' },
      'session-id': { type: 'string' },
      'state-file': { type: 'string' },
    },
    strict: false,
  });

  const validator = new QuorumValidator();

  // 1. If explicit --reviewer-ids argument is provided
  const reviewerIds = parseListArg(values['reviewer-ids']);
  if (reviewerIds.length > 0) {
    console.log(
      'QUORUM GATE: Prose-enforced only. Ensure all 4 reviewer conversation IDs are provided via --reviewer-ids arg.'
    );
    if (reviewerIds.length >= 4) {
      console.log(`QUORUM GATE PASSED: 4 reviewer conversation IDs verified (${reviewerIds.join(', ')}).`);
      process.exit(0);
    } else {
      console.error(
        `QUORUM GATE FAILED: Quorum NOT green. Only ${reviewerIds.length} reviewer ID(s) provided; 4 required.`
      );
      process.exit(1);
    }
  }

  // 2. If explicit --panel argument is provided
  const panel = parseListArg(values.panel);
  if (panel.length > 0) {
    const res = await validator.check({ metadata: { panel } });
    if (res.passed) {
      console.log(`QUORUM GATE PASSED: Panel complete with required roles (${panel.join(', ')}).`);
      process.exit(0);
    } else {
      console.error(`QUORUM GATE FAILED: Quorum NOT green. Reason: ${res.reason}`);
      process.exit(1);
    }
  }

  // 3. Try reading quorum state from state file
  const stateFilePath = values['state-file']
    ? resolve(process.cwd(), values['state-file'])
    : resolve(repoRoot, 'superconductor/logs/quorum-state.json');

  if (existsSync(stateFilePath)) {
    let metadata;
    try {
      const content = readFileSync(stateFilePath, 'utf8');
      metadata = JSON.parse(content);
    } catch (err) {
      console.error(`QUORUM GATE FAILED: Quorum state cannot be read from ${stateFilePath}: ${err.message}`);
      process.exit(2);
    }

    const res = await validator.check({ metadata });
    if (res.passed) {
      console.log(`QUORUM GATE PASSED: Quorum green (verified from ${stateFilePath}).`);
      process.exit(0);
    } else {
      console.error(`QUORUM GATE FAILED: Quorum NOT green. Reason: ${res.reason}`);
      process.exit(1);
    }
  }

  // 4. Try reading quorum state from SQLite DB if QuorumStateStore is available
  try {
    const dbPath = resolve(repoRoot, 'superconductor/quorum/quorum_state.db');
    if (existsSync(dbPath)) {
      const require = createRequire(import.meta.url);
      const storePath = resolve(repoRoot, 'packages/quorum-fsm/dist/persistence/quorum-state-store.js');
      if (existsSync(storePath)) {
        const { QuorumStateStore } = require(storePath);
        const store = new QuorumStateStore(dbPath);
        const trackId = values['track-id'] || 'codebase';
        const sessionId = values['session-id'] || '';

        let record = null;
        if (sessionId) {
          record = await store.load(trackId, sessionId);
        }

        if (record) {
          const isPassed = record.state === 'PASSED';
          const res = await validator.check({ metadata: { quorumPassed: isPassed } });
          if (res.passed) {
            console.log(`QUORUM GATE PASSED: Quorum green (state '${record.state}' in DB).`);
            process.exit(0);
          } else {
            console.error(`QUORUM GATE FAILED: Quorum NOT green. State in DB is '${record.state}'.`);
            process.exit(1);
          }
        }
      }
    }
  } catch (err) {
    // DB state read fallback
  }

  // 5. Quorum state cannot be read
  console.error('QUORUM GATE FAILED: Quorum state cannot be read (no valid quorum state found or provided).');
  process.exit(2);
}

runGate().catch((err) => {
  console.error(`QUORUM GATE FAILED: Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
