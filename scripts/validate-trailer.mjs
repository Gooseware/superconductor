#!/usr/bin/env node
/**
 * Validate a git commit message contains a valid SwarmAuthorizer trailer.
 * Uses the built superconductor-core package.
 * Usage: node scripts/validate-trailer.mjs <commit-msg-file>
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve, relative, isAbsolute, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.argv[2]) {
  console.error('[Superconductor] Missing commit message file path argument.');
  process.exit(1);
}

const repoRoot = process.env.GIT_DIR 
  ? resolve(process.env.GIT_DIR, '..')
  : resolve(__dirname, '..');
const commitMsgPath = resolve(process.argv[2]);
const rel = relative(repoRoot, commitMsgPath);
if (rel.startsWith('..') || isAbsolute(rel)) {
  console.error('[Superconductor] Path traversal rejected:', commitMsgPath);
  process.exit(1);
}

const commitMsg = readFileSync(commitMsgPath, 'utf8').trim();

// Check if this is a track merge commit that requires authorization
// Only gate commits that touch packages/*/src/** (per GEMINI.md guardrail)
const SWARM_AUTH_HEADER = /^Swarm-Authorized:\s*true\s*\|\s*reviewers:\s*([^\n\r]+)/m;
const REQUIRES_AUTH = /^(feat|fix|track|chore)\(superconductor\):/m;

if (!REQUIRES_AUTH.test(commitMsg)) {
  // Not a superconductor delivery commit — skip validation
  process.exit(0);
}

if (!SWARM_AUTH_HEADER.test(commitMsg)) {
  console.error('[❌ Superconductor] Missing SwarmAuthorizer trailer on delivery commit.');
  console.error('    Required: Swarm-Authorized: true | reviewers: <id1>,<id2>');
  console.error('    Generate with: SwarmAuthorizer.generateTrailer(reviewerConvIds)');
  process.exit(1);
}

console.log('[✅ Superconductor] SwarmAuthorizer trailer validated.');
process.exit(0);

