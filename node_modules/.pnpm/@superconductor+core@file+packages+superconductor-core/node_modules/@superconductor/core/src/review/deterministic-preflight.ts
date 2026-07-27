import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export interface PreflightResult {
  status: 'passed' | 'failed' | 'skipped';
  tool_used?: string;
  short_circuit: boolean;
  diagnostics: string;
}

/**
 * Detects the primary programming language of a project.
 * First checks superconductor/tech-stack.md for explicit mentions,
 * then falls back to the presence of well-known root config files.
 * Returns 'typescript' | 'python' | 'go' | 'rust' | 'unknown'.
 */
function detectFromTechStack(content: string): string | null {
  if (content.includes('typescript') || content.includes('tsconfig')) return 'typescript';
  if (content.includes('python') || content.includes('pyproject') || content.includes('requirements.txt')) return 'python';
  if (content.includes('go.mod') || content.includes('golang') || content.includes(' go ')) return 'go';
  if (content.includes('cargo.toml') || content.includes('rust')) return 'rust';
  return null;
}

function detectFromFiles(projectDir: string): string {
  if (fs.existsSync(path.join(projectDir, 'tsconfig.json')) || fs.existsSync(path.join(projectDir, 'package.json'))) return 'typescript';
  if (fs.existsSync(path.join(projectDir, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) return 'rust';
  if (fs.existsSync(path.join(projectDir, 'pyproject.toml')) || fs.existsSync(path.join(projectDir, 'requirements.txt'))) return 'python';
  return 'unknown';
}

export function detectProjectLanguage(projectDir: string): string {
  const techStackPath = path.join(projectDir, 'superconductor', 'tech-stack.md');
  if (fs.existsSync(techStackPath)) {
    const content = fs.readFileSync(techStackPath, 'utf-8').toLowerCase();
    return detectFromTechStack(content) || 'unknown';
  }
  return detectFromFiles(projectDir);
}

/**
 * Returns the CLI diagnostic command for a detected language,
 * or undefined when no tool is configured for that language.
 */
export function getDiagnosticCommand(lang: string): string | undefined {
  const commands: Record<string, string> = {
    typescript: 'npx tsc --noEmit',
    python: 'pyright .',
    go: 'go vet ./...',
    rust: 'cargo check',
  };
  return commands[lang];
}

/**
 * Runs the given diagnostic command inside projectDir and maps the
 * outcome to a PreflightResult. A non-zero exit short-circuits the review.
 */
function executeDiagnosticCommand(command: string, projectDir: string): PreflightResult {
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

export function runDeterministicPreflight(projectDir: string): PreflightResult {
  const lang = detectProjectLanguage(projectDir);
  const command = getDiagnosticCommand(lang);
  if (!command) {
    return { status: 'skipped', short_circuit: false, diagnostics: `No diagnostic tool configured for language: ${lang}` };
  }
  return executeDiagnosticCommand(command, projectDir);
}

