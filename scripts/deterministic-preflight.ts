import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface PreflightResult {
  status: 'passed' | 'failed' | 'skipped';
  tool_used?: string;
  short_circuit: boolean;
  diagnostics: string;
}

export function runDeterministicPreflight(projectDir: string): PreflightResult {
  const techStackPath = path.join(projectDir, 'superconductor', 'tech-stack.md');
  let lang = 'typescript'; // default fallback

  if (fs.existsSync(techStackPath)) {
    const content = fs.readFileSync(techStackPath, 'utf-8').toLowerCase();
    if (content.includes('python')) lang = 'python';
    else if (content.includes('go')) lang = 'go';
    else if (content.includes('rust')) lang = 'rust';
  }

  let command = '';
  if (lang === 'typescript') command = 'npx tsc --noEmit';
  else if (lang === 'python') command = 'pyright';
  else if (lang === 'go') command = 'go vet ./...';
  else if (lang === 'rust') command = 'cargo check';

  if (!command) {
    return {
      status: 'skipped',
      short_circuit: false,
      diagnostics: `No diagnostic tool configured for language: ${lang}`
    };
  }

  try {
    const output = execSync(command, { cwd: projectDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return {
      status: 'passed',
      tool_used: command,
      short_circuit: false,
      diagnostics: output
    };
  } catch (err: any) {
    const stderr = err.stderr || err.stdout || err.message;
    return {
      status: 'failed',
      tool_used: command,
      short_circuit: true, // Non-zero exit with stderr triggers short-circuit
      diagnostics: stderr
    };
  }
}
