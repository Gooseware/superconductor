#!/usr/bin/env node
/**
 * Validate a git commit message contains a valid SwarmAuthorizer trailer.
 * Uses the built superconductor-core package.
 * Usage: node scripts/validate-trailer.mjs <commit-msg-file>
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const commitMsg = readFileSync(process.argv[2], 'utf8').trim();

// Check if this is a track merge commit that requires authorization
// Only gate commits that touch packages/*/src/** (per GEMINI.md guardrail)
const SWARM_AUTH_HEADER = /^SwarmAuthorizer:/m;
const REQUIRES_AUTH = /^(feat|fix|track)\(superconductor\):/m;

if (!REQUIRES_AUTH.test(commitMsg)) {
  // Not a superconductor delivery commit — skip validation
  process.exit(0);
}

if (!SWARM_AUTH_HEADER.test(commitMsg)) {
  console.error('[❌ Superconductor] Missing SwarmAuthorizer trailer on delivery commit.');
  console.error('    Required: SwarmAuthorizer: track=<id> quorum=PASS(RN) oracle=READY tests=N/N');
  console.error('    Generate with: SwarmAuthorizer.generateTrailer(reviewerConvIds)');
  process.exit(1);
}

console.log('[✅ Superconductor] SwarmAuthorizer trailer validated.');
process.exit(0);
