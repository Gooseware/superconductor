import * as fs from 'node:fs';
import * as path from 'node:path';
import { UxRuleEngine, UxReviewInput, UxReviewReport } from './ux-rule-engine.js';

export async function runUxCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  let inputPath: string | undefined;
  let mode: 'quorum' | 'processor' = 'quorum';
  let targetType: UxReviewInput['targetType'] | undefined;
  let jsonOutput = false;
  let showHeuristics = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') {
      inputPath = argv[++i];
    } else if (arg === '--mode' || arg === '-m') {
      const val = argv[++i];
      if (val === 'quorum' || val === 'processor') {
        mode = val;
      }
    } else if (arg === '--target' || arg === '-t') {
      targetType = argv[++i] as UxReviewInput['targetType'];
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--heuristics') {
      showHeuristics = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: ux-rule-engine-cli [options] [file]

Options:
  --input, -i <file|stdin>   File to review or "stdin" / "-"
  --mode, -m <mode>          Review mode: "quorum" (default) or "processor"
  --target, -t <type>        Target type: cli_output, skill_instruction, mcp_schema, code_comments
  --json                     Emit report as structured JSON
  --heuristics               Print processor mode generative heuristics
  --help, -h                 Show help
`);
      return 0;
    } else if (!arg.startsWith('-') && !inputPath) {
      inputPath = arg;
    }
  }

  if (showHeuristics) {
    const heuristics = UxRuleEngine.getHeuristics();
    if (jsonOutput) {
      console.log(JSON.stringify(heuristics, null, 2));
    } else {
      console.log('\n# Active UX Processor Heuristics\n');
      heuristics.forEach(h => {
        console.log(`- **[${h.id}]** (${h.ruleGroup}): ${h.heuristic}`);
      });
    }
    return 0;
  }

  let content = '';
  let filePath: string | undefined;

  if (inputPath && inputPath !== 'stdin' && inputPath !== '-') {
    filePath = path.resolve(process.cwd(), inputPath);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: Input file not found: ${filePath}`);
      return 1;
    }
    content = fs.readFileSync(filePath, 'utf-8');
  } else {
    // Read from standard input
    content = await new Promise<string>((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', chunk => { data += chunk; });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', err => reject(err));
    });
  }

  if (!targetType && filePath) {
    if (filePath.endsWith('.md')) {
      targetType = 'skill_instruction';
    } else if (filePath.endsWith('.json')) {
      targetType = 'mcp_schema';
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      targetType = 'code_comments';
    }
  }

  const reviewInput: UxReviewInput = {
    content,
    filePath,
    targetType,
    mode
  };

  const report: UxReviewReport = UxRuleEngine.evaluate(reviewInput);

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printFormattedReport(report, mode);
  }

  return report.verdict === 'PASS' ? 0 : 1;
}

function printFormattedReport(report: UxReviewReport, mode: string): void {
  console.log(`\n[superconductor:ux-reviewer] Mode: ${mode.toUpperCase()} | Rules Checked: ${report.summary.totalRulesChecked}`);
  console.log(`Verdict: ${report.verdict === 'PASS' ? '✔ PASS' : '✖ NEEDS_FIXES'}`);
  console.log(`Summary: ${report.summary.passedRules} passed, ${report.summary.failedRules} failed\n`);

  if (report.findings.length > 0) {
    console.log('## Findings:\n');
    report.findings.forEach(f => {
      const lineStr = f.line ? `:${f.line}` : '';
      console.log(`[${f.severity}] ${f.id} (${f.ruleGroup})${lineStr}`);
      console.log(`  Description: ${f.description}`);
      console.log(`  Remediation: ${f.remediation}\n`);
    });
  } else {
    console.log('✔ All UX rules satisfied with zero findings.\n');
  }
}

// Auto-run if executed directly as main script
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('ux-rule-engine-cli.js') ||
  process.argv[1].endsWith('ux-rule-engine-cli.ts')
);

if (isMainModule) {
  runUxCli().then(code => {
    process.exit(code);
  }).catch(err => {
    console.error('Fatal UX Rule Engine CLI error:', err);
    process.exit(1);
  });
}
