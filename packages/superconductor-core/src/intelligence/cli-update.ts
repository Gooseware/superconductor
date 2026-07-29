#!/usr/bin/env node
/**
 * cli-update.ts — Incremental intelligence updater CLI
 * Called by the git post-commit hook with changed file paths as argv.
 * Outputs UpdateReport to stderr (never stdout — preserves git output).
 * NOTE: `update()` is declared async but the fallback to `runPipeline` is blocking.
 */
import { update } from './incremental-updater.js';
import { getSuperconductorHome } from './tool-registry.js';
import { execFileSync } from 'child_process';
import * as path from 'path';

async function main() {
  const changedFiles = process.argv.slice(2);
  if (changedFiles.length === 0) process.exit(0);

  // Resolve projectRoot via git — safe, no shell interpolation
  const projectRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const home = getSuperconductorHome();
  const outputDir = path.join(home, 'intelligence');

  // Validate paths against projectRoot boundary (ADV-2: use resolvedRoot + sep to prevent traversal)
  const resolvedRoot = path.resolve(projectRoot);
  const safeFiles = changedFiles.filter(f => {
    const abs = path.resolve(resolvedRoot, f);
    return abs.startsWith(resolvedRoot + path.sep) || abs === resolvedRoot;
  });

  if (safeFiles.length === 0) process.exit(0);

  const report = await update({ projectRoot, changedFiles: safeFiles, outputDir });
  process.stderr.write(`[superconductor:intelligence] ${JSON.stringify(report)}\n`);
}

main().catch(e => {
  process.stderr.write(`[superconductor:intelligence] ERROR: ${e.message}\n`);
  process.exit(0); // always exit 0 — never block the git commit
});
