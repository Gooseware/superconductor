#!/usr/bin/env node
import { PreflightASTChecker, PreflightCheckResult } from '../review/preflight-ast-checker.js';

export interface CliOptions {
  staged: boolean;
  head: string;
  projectDir: string;
  file?: string;
  help: boolean;
}

export function parsePreflightArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    staged: false,
    head: 'HEAD',
    projectDir: process.cwd(),
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--staged' || arg === '--cached') {
      options.staged = true;
    } else if (arg === '--head' && args[i + 1]) {
      options.head = args[++i];
    } else if ((arg === '--dir' || arg === '-d') && args[i + 1]) {
      options.projectDir = args[++i];
    } else if (arg === '--file' && args[i + 1]) {
      options.file = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

export function runPreflightCli(
  argv = process.argv.slice(2),
  checker = new PreflightASTChecker()
): { exitCode: number; result?: PreflightCheckResult } {
  const options = parsePreflightArgs(argv);

  if (options.help) {
    console.log(`
Usage: check:preflight [options]

Automated Quorum Preflight Gate: scans git diff or files for forbidden anti-patterns:
  - Test fixture auto-generation (writeFileSync/writeFile in tests)
  - Cloudflare Workers missing ctx.waitUntil
  - Relaxed timing assertions (increased toBeLessThan or timeout thresholds)
  - Swallowed exceptions (empty catch {} or catch (_) {})

Options:
  --staged, --cached   Scan staged changes
  --head <ref>         Diff against git ref (default: HEAD)
  --dir, -d <path>     Target project directory (default: cwd)
  --file <path>        Scan a single file directly
  --help, -h           Show this help message
`);
    return { exitCode: 0 };
  }

  let result: PreflightCheckResult;
  if (options.file) {
    result = checker.scanFile(options.file);
  } else {
    result = checker.scanGitDiff({
      projectDir: options.projectDir,
      staged: options.staged,
      head: options.head,
    });
  }

  if (result.valid) {
    console.log('✓ Quorum Preflight Gate: AST and diff checks passed. No forbidden patterns detected.');
    return { exitCode: 0, result };
  }

  console.error(`✗ Quorum Preflight Gate FAILED with ${result.violations.length} violation(s):\n`);
  for (const v of result.violations) {
    console.error(`  - ${v.file}:${v.line} [${v.rule}]`);
    console.error(`    ${v.message}\n`);
  }

  return { exitCode: 1, result };
}

// Execute when invoked directly from CLI
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('check-preflight.js') || process.argv[1].endsWith('check-preflight.ts'));

if (isDirectExecution) {
  const { exitCode } = runPreflightCli();
  process.exit(exitCode);
}
