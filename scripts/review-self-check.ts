import * as fs from 'node:fs';

export function runSelfCheck(reportPath: string, args: string[] = []): { code: number; message?: string } {
  if (args.includes('--skip-self-check')) {
    return { code: 0, message: 'Bypass annotation: --skip-self-check flag detected' };
  }

  if (!fs.existsSync(reportPath)) {
    return { code: 1, message: `Report file not found: ${reportPath}` };
  }

  const content = fs.readFileSync(reportPath, 'utf8');

  // Detect ## Execution Evidence section
  const sectionMatch = content.match(/## Execution Evidence([\s\S]*?)(\n## |$)/);
  if (!sectionMatch) {
    return { code: 1, message: 'Missing certification block: "## Execution Evidence"' };
  }

  const sectionContent = sectionMatch[1];

  // Validate at least one [x] checked item
  if (!/- \[x\]/.test(sectionContent)) {
    return { code: 1, message: 'All checked items are missing or empty: no [x] found in Execution Evidence block' };
  }

  // Validate Terminal output: line is non-placeholder
  const terminalOutputMatch = sectionContent.match(/- Terminal output:\s*(.*)/);
  if (!terminalOutputMatch) {
    return { code: 2, message: 'Missing terminal output line' };
  }
  
  const terminalOutput = terminalOutputMatch[1].trim();
  if (terminalOutput.includes('[pasted inline above]') || terminalOutput === '') {
    return { code: 2, message: 'Terminal output line is a placeholder or empty' };
  }

  return { code: 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const skipFlagIndex = args.indexOf('--skip-self-check');
  const pathArgs = args.filter(a => a !== '--skip-self-check');
  const reportPath = pathArgs[0];

  if (!reportPath && !args.includes('--skip-self-check')) {
    console.error('Usage: npx tsx scripts/review-self-check.ts <report-path> [--skip-self-check]');
    process.exit(1);
  }

  const result = runSelfCheck(reportPath, args);
  if (result.code !== 0) {
    if (result.message) {
      console.error(result.message);
    }
    process.exit(result.code);
  } else if (result.message) {
    console.log(result.message);
  }
  process.exit(0);
}
