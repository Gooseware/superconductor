import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export interface PreflightResult {
  status: 'passed' | 'failed' | 'skipped';
  tool_used?: string;
  short_circuit: boolean;
  diagnostics: string;
}

export function runDeterministicPreflight(projectDir: string): PreflightResult {
  const techStackPath = path.join(projectDir, 'superconductor', 'tech-stack.md');
  let lang = '';

  if (fs.existsSync(techStackPath)) {
    const content = fs.readFileSync(techStackPath, 'utf-8').toLowerCase();
    if (content.includes('typescript') || content.includes('tsconfig')) lang = 'typescript';
    else if (content.includes('python') || content.includes('pyproject') || content.includes('requirements.txt')) lang = 'python';
    else if (content.includes('go.mod') || content.includes('golang') || content.includes(' go ')) lang = 'go';
    else if (content.includes('cargo.toml') || content.includes('rust')) lang = 'rust';
    else lang = 'unsupported';
  }

  // Fallback heuristic: check file markers in project root if no tech-stack.md was found
  if (!lang) {
    if (fs.existsSync(path.join(projectDir, 'tsconfig.json')) || fs.existsSync(path.join(projectDir, 'package.json'))) {
      lang = 'typescript';
    } else if (fs.existsSync(path.join(projectDir, 'go.mod'))) {
      lang = 'go';
    } else if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) {
      lang = 'rust';
    } else if (fs.existsSync(path.join(projectDir, 'pyproject.toml')) || fs.existsSync(path.join(projectDir, 'requirements.txt'))) {
      lang = 'python';
    } else {
      lang = 'skipped';
    }
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
    const output = execSync(command, {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000 // 30s timeout to prevent hanging execution
    });
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
