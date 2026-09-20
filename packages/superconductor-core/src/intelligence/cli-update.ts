#!/usr/bin/env node
/**
 * cli-update.ts — Incremental intelligence updater CLI
 * Called by the git post-commit hook with changed file paths as argv.
 * Outputs UpdateReport to stderr (never stdout — preserves git output).
 * NOTE: `update()` is declared async but the fallback to `runPipeline` is blocking.
 */
import { update } from './incremental-updater.js';
import { runPipeline } from './pipeline.js';
import { resolveProjectRoot } from './utils/resolve-project-root.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

export interface RunCliUpdateOptions {
  argv?: string[];
  cwd?: string;
  projectRoot?: string;
  outputDir?: string;
}

export async function runCliUpdate(
  argsOrOptions?: string[] | RunCliUpdateOptions,
  optionsOverride?: RunCliUpdateOptions
): Promise<void> {
  let rawArgs: string[];
  let cwd: string | undefined;
  let customProjectRoot: string | undefined;
  let customOutputDir: string | undefined;

  if (Array.isArray(argsOrOptions)) {
    rawArgs = argsOrOptions;
    if (optionsOverride) {
      cwd = optionsOverride.cwd;
      customProjectRoot = optionsOverride.projectRoot;
      customOutputDir = optionsOverride.outputDir;
    }
  } else if (argsOrOptions && typeof argsOrOptions === 'object') {
    rawArgs = argsOrOptions.argv ?? process.argv.slice(2);
    cwd = argsOrOptions.cwd;
    customProjectRoot = argsOrOptions.projectRoot;
    customOutputDir = argsOrOptions.outputDir;
  } else {
    rawArgs = process.argv.slice(2);
    if (optionsOverride) {
      cwd = optionsOverride.cwd;
      customProjectRoot = optionsOverride.projectRoot;
      customOutputDir = optionsOverride.outputDir;
    }
  }

  // 1. Resolve projectRoot via resolveProjectRoot
  const projectRoot = customProjectRoot ?? resolveProjectRoot(cwd);

  // 2. Set outputDir = path.join(projectRoot, 'superconductor', 'intelligence')
  const outputDir = customOutputDir ?? path.join(projectRoot, 'superconductor', 'intelligence');

  // 4. Emit active directory surfacing lines before indexing
  process.stderr.write(`[superconductor:intelligence] Indexing Project: ${projectRoot}\n`);
  process.stderr.write(`[superconductor:intelligence] Output Directory: ${outputDir}\n`);

  // 5. Support --full flag explicitly
  const isFull = rawArgs.includes('--full');

  // Parse changed files
  const changedFiles: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--full') {
      continue;
    }
    if (arg === '--changed-files') {
      continue;
    }
    if (arg.startsWith('--changed-files=')) {
      const parts = arg.slice('--changed-files='.length).split(',').map(s => s.trim()).filter(Boolean);
      changedFiles.push(...parts);
      continue;
    }
    if (!arg.startsWith('--')) {
      changedFiles.push(arg);
    }
  }

  // 3. When changedFiles.length === 0 or --full is provided, run full intelligence scan
  if (isFull || changedFiles.length === 0) {
    await runPipeline([], projectRoot, outputDir);
    return;
  }

  // Validate paths against projectRoot boundary (ADV-2: use resolvedRoot + sep to prevent traversal)
  const resolvedRoot = path.resolve(projectRoot);
  const safeFiles = changedFiles.filter(f => {
    const abs = path.resolve(resolvedRoot, f);
    return abs.startsWith(resolvedRoot + path.sep) || abs === resolvedRoot;
  });

  if (safeFiles.length === 0) {
    return;
  }

  const report = await update({ projectRoot, changedFiles: safeFiles, outputDir });
  process.stderr.write(`[superconductor:intelligence] ${JSON.stringify(report)}\n`);
}

export const main = runCliUpdate;

function isDirectExecution(): boolean {
  if (typeof process === 'undefined' || !process.argv || !process.argv[1]) {
    return false;
  }
  try {
    const executedPath = fs.realpathSync(path.resolve(process.argv[1]));
    const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
    return executedPath === currentPath;
  } catch {
    const executedAbs = path.resolve(process.argv[1]);
    try {
      const currentAbs = fileURLToPath(import.meta.url);
      return executedAbs === currentAbs;
    } catch {
      return Boolean(
        process.argv[1] &&
        (import.meta.url === `file://${process.argv[1]}` ||
         import.meta.url === `file://${path.resolve(process.argv[1])}` ||
         import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
      );
    }
  }
}

if (isDirectExecution()) {
  runCliUpdate().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[superconductor:intelligence] ERROR: ${msg}\n`);
    process.exit(0); // always exit 0 — never block the git commit
  });
}
