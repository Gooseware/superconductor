import * as path from 'node:path';
import {
  runDeterministicPreflight,
  type PreflightResult,
  type DeterministicPreflightOptions,
} from '../packages/superconductor-core/src/review/deterministic-preflight.js';

export {
  runDeterministicPreflight,
  type PreflightResult,
  type DeterministicPreflightOptions,
};

function parseArgs(args: string[]): { targetDir: string; staged: boolean; showHelp: boolean } {
  let targetDir = process.cwd();
  let staged = false;
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--staged') {
      staged = true;
    } else if (arg === '--dir') {
      if (i + 1 < args.length) {
        targetDir = path.resolve(args[++i]);
      }
    } else if (arg.startsWith('--dir=')) {
      targetDir = path.resolve(arg.slice('--dir='.length));
    } else if (arg === '--help' || arg === '-h') {
      showHelp = true;
    } else if (!arg.startsWith('-') && i === 0) {
      targetDir = path.resolve(arg);
    }
  }

  return { targetDir, staged, showHelp };
}

export function executeCli(args: string[] = process.argv.slice(2)): number {
  const { targetDir, staged, showHelp } = parseArgs(args);

  if (showHelp) {
    console.log(`
Usage: npx tsx scripts/deterministic-preflight.ts [options]

Deterministic Preflight & Invariant Gate CLI

Options:
  --staged        Evaluate only staged git changes (default: all uncommitted changes)
  --dir <path>    Project root directory (default: current working directory)
  -h, --help      Show this help message
`);
    return 0;
  }

  console.log(`\n🔍 Running Deterministic Preflight...`);
  console.log(`   Target Directory: ${targetDir}`);
  console.log(`   Scope: ${staged ? 'Staged git changes (--staged)' : 'Working tree & uncommitted changes'}`);

  const result = runDeterministicPreflight(targetDir, { staged });

  if (result.status === 'passed') {
    console.log(`\n✅ Preflight Check PASSED`);
    if (result.tool_used) {
      console.log(`   Tool: ${result.tool_used}`);
    }
    if (result.diagnostics && result.diagnostics.trim()) {
      console.log(`\nDiagnostics:\n${result.diagnostics.trim()}`);
    }
    return 0;
  }

  if (result.status === 'skipped') {
    console.log(`\n⚠️ Preflight Check SKIPPED`);
    console.log(`   ${result.diagnostics}`);
    return 0;
  }

  console.error(`\n❌ Preflight Check FAILED`);
  if (result.tool_used) {
    console.error(`   Tool: ${result.tool_used}`);
  }
  if (result.short_circuit) {
    console.error(`   Circuit Breaker: Tripped (short-circuiting review)`);
  }

  if (result.violations && result.violations.length > 0) {
    console.error(`\n🚨 Invariant Rule Violations (${result.violations.length}):`);
    for (const v of result.violations) {
      const loc = v.line ? `:${v.line}` : '';
      console.error(`\n   • [${v.ruleId}] [${v.severity.toUpperCase()}] ${v.file}${loc}`);
      console.error(`     Message: ${v.message}`);
      if (v.snippet) {
        console.error(`     Snippet: ${v.snippet}`);
      }
    }
  } else if (result.diagnostics) {
    console.error(`\nDiagnostics:\n${result.diagnostics.trim()}`);
  }

  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = executeCli();
  process.exit(exitCode);
}
