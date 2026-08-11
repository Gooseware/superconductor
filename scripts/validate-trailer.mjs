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
const REQUIRES_AUTH = /^(feat|fix|track|chore)\(superconductor\):/m;

if (!REQUIRES_AUTH.test(commitMsg)) {
  // Not a superconductor delivery commit — skip validation
  process.exit(0);
}

// Try importing SwarmAuthorizer from built dist package
let SwarmAuthorizer;
try {
  const require = createRequire(import.meta.url);
  const corePackage = require('../packages/superconductor-core/dist/index.js');
  SwarmAuthorizer = corePackage.SwarmAuthorizer;
} catch (e) {
  // Fall back if dist is not built
  console.warn('[Superconductor] Warning: using fallback regex validation (dist not built)');
}

let isValid = false;
if (SwarmAuthorizer && typeof SwarmAuthorizer.validateTrailer === 'function') {
  isValid = SwarmAuthorizer.validateTrailer(commitMsg);
} else {
  // Fallback regex logic matching SwarmAuthorizer.validateTrailer
  const regex = /Swarm-Authorized:\s*true\s*\|\s*reviewers:\s*([^\n\r]+)(?:\r?\n)*$/;
  const match = commitMsg.match(regex);
  if (match) {
    const ids = match[1].split(',').map(id => id.trim()).filter(id => id.length > 0);
    isValid = ids.length > 0;
  }
}

if (!isValid) {
  console.error('[❌ Superconductor] Missing SwarmAuthorizer trailer on delivery commit.');
  console.error('    Required: Swarm-Authorized: true | reviewers: <id1>,<id2>');
  console.error('    Generate with: SwarmAuthorizer.generateTrailer(reviewerConvIds)');
  process.exit(1);
}

console.log('[✅ Superconductor] SwarmAuthorizer trailer validated.');
process.exit(0);

