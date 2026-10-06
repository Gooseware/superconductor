import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectProjectLanguage, getDiagnosticCommand, runDeterministicPreflight } from '../src/review/deterministic-preflight.js';
import { execSync } from 'node:child_process';

describe('detectProjectLanguage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-preflight-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns "typescript" when tsconfig.json is present in project root', () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    expect(detectProjectLanguage(tmpDir)).toBe('typescript');
  });

  it('returns "typescript" when package.json is present in project root', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    expect(detectProjectLanguage(tmpDir)).toBe('typescript');
  });

  it('returns "python" when pyproject.toml is present in project root', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[tool.poetry]');
    expect(detectProjectLanguage(tmpDir)).toBe('python');
  });

  it('returns "python" when requirements.txt is present in project root', () => {
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'flask\n');
    expect(detectProjectLanguage(tmpDir)).toBe('python');
  });

  it('returns "go" when go.mod is present in project root', () => {
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com/app\n');
    expect(detectProjectLanguage(tmpDir)).toBe('go');
  });

  it('returns "rust" when Cargo.toml is present in project root', () => {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]');
    expect(detectProjectLanguage(tmpDir)).toBe('rust');
  });

  it('returns "unknown" when no config files are present', () => {
    expect(detectProjectLanguage(tmpDir)).toBe('unknown');
  });

  it('returns "typescript" when tech-stack.md mentions typescript', () => {
    const scDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(scDir, { recursive: true });
    fs.writeFileSync(path.join(scDir, 'tech-stack.md'), '# Stack\nLanguage: TypeScript\n');
    expect(detectProjectLanguage(tmpDir)).toBe('typescript');
  });

  it('returns "python" when tech-stack.md mentions python', () => {
    const scDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(scDir, { recursive: true });
    fs.writeFileSync(path.join(scDir, 'tech-stack.md'), '# Stack\nLanguage: Python\nDeps: pyproject.toml\n');
    expect(detectProjectLanguage(tmpDir)).toBe('python');
  });

  it('returns "go" when tech-stack.md mentions golang', () => {
    const scDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(scDir, { recursive: true });
    fs.writeFileSync(path.join(scDir, 'tech-stack.md'), '# Stack\nLanguage: Golang, uses go.mod\n');
    expect(detectProjectLanguage(tmpDir)).toBe('go');
  });

  it('returns "rust" when tech-stack.md mentions rust', () => {
    const scDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(scDir, { recursive: true });
    fs.writeFileSync(path.join(scDir, 'tech-stack.md'), '# Stack\nLanguage: Rust, uses cargo.toml\n');
    expect(detectProjectLanguage(tmpDir)).toBe('rust');
  });
});

describe('getDiagnosticCommand', () => {
  it('returns a command containing "tsc" for typescript', () => {
    const cmd = getDiagnosticCommand('typescript');
    expect(cmd).toBeDefined();
    expect(cmd).toContain('tsc');
  });

  it('returns a command containing "pyright" or "mypy" for python', () => {
    const cmd = getDiagnosticCommand('python');
    expect(cmd).toBeDefined();
    expect(cmd!.toLowerCase()).toMatch(/pyright|mypy/);
  });

  it('returns a command containing "go vet" for go', () => {
    const cmd = getDiagnosticCommand('go');
    expect(cmd).toBeDefined();
    expect(cmd).toContain('go vet');
  });

  it('returns a command containing "cargo check" for rust', () => {
    const cmd = getDiagnosticCommand('rust');
    expect(cmd).toBeDefined();
    expect(cmd).toContain('cargo check');
  });

  it('returns undefined for unknown language', () => {
    const cmd = getDiagnosticCommand('unknown');
    expect(cmd).toBeUndefined();
  });

  it('returns undefined for unsupported language', () => {
    const cmd = getDiagnosticCommand('unsupported');
    expect(cmd).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    const cmd = getDiagnosticCommand('');
    expect(cmd).toBeUndefined();
  });
});

describe('runDeterministicPreflight with Invariant Rules', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-det-preflight-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('fails fast when options.files has invariant rule violation (TestFixtureTamperRule)', () => {
    const result = runDeterministicPreflight(tmpDir, {
      files: [
        {
          path: 'tests/fixture.test.ts',
          content: `import fs from 'fs';\nfs.writeFileSync('fixture.json', '{}');`,
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.short_circuit).toBe(true);
    expect(result.tool_used).toBe('invariant-rules-engine');
    expect(result.diagnostics).toContain('INVARIANT-FIXTURE-TAMPER');
    expect(result.diagnostics).toContain('Test fixture tampering detected');
  });

  it('fails fast when options.files has defensive nulling diff violation', () => {
    const result = runDeterministicPreflight(tmpDir, {
      files: [
        {
          path: 'src/config.ts',
          content: '',
          diff: '@@ -1,3 +1,3 @@\n-const val = raw;\n+const val = raw ?? 0;',
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.short_circuit).toBe(true);
    expect(result.tool_used).toBe('invariant-rules-engine');
    expect(result.diagnostics).toContain('INVARIANT-DEFENSIVE-NULLING');
  });

  it('fails fast when options.files has silent degradation violation', () => {
    const result = runDeterministicPreflight(tmpDir, {
      files: [
        {
          path: 'src/handler.ts',
          content: 'try { doSomething(); } catch (e) {}',
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.short_circuit).toBe(true);
    expect(result.tool_used).toBe('invariant-rules-engine');
    expect(result.diagnostics).toContain('INVARIANT-SILENT-DEGRADATION');
  });

  it('fails fast when options.files has Cloudflare lifecycle violation', () => {
    const result = runDeterministicPreflight(tmpDir, {
      files: [
        {
          path: 'src/worker.ts',
          content: 'export default { async fetch(req, env) { return new Response("ok"); } };',
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.short_circuit).toBe(true);
    expect(result.tool_used).toBe('invariant-rules-engine');
    expect(result.diagnostics).toContain('INVARIANT-CLOUDFLARE-LIFECYCLE');
  });

  it('continues to language diagnostics when options.files is clean', () => {
    const result = runDeterministicPreflight(tmpDir, {
      files: [
        {
          path: 'src/clean.ts',
          content: 'export function add(a: number, b: number) { return a + b; }',
        },
      ],
    });

    expect(result.status).toBe('skipped');
    expect(result.short_circuit).toBe(false);
    expect(result.diagnostics).toContain('No diagnostic tool configured');
  });

  it('scans git changes when options is not provided', () => {
    execSync('git init', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });

    const filePath = path.join(tmpDir, 'service.ts');
    execSync(`node -e 'fs.writeFileSync(process.argv[1], "try { run(); } catch (err) {}")' "${filePath}"`);

    const result = runDeterministicPreflight(tmpDir);
    expect(result.status).toBe('failed');
    expect(result.short_circuit).toBe(true);
    expect(result.tool_used).toBe('invariant-rules-engine');
    expect(result.diagnostics).toContain('INVARIANT-SILENT-DEGRADATION');
  });

  it('filters staged changes when options.staged is true', () => {
    execSync('git init', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
    execSync('git config user.name "Test"', { cwd: tmpDir });

    // Untracked/unstaged violation file
    const filePath = path.join(tmpDir, 'service.ts');
    execSync(`node -e 'fs.writeFileSync(process.argv[1], "try { run(); } catch (err) {}")' "${filePath}"`);

    // With staged: true, unstaged/untracked files are ignored
    const cleanResult = runDeterministicPreflight(tmpDir, { staged: true });
    expect(cleanResult.status).toBe('skipped');

    // Stage the file
    execSync('git add service.ts', { cwd: tmpDir });

    // Now staged violation is caught
    const stagedResult = runDeterministicPreflight(tmpDir, { staged: true });
    expect(stagedResult.status).toBe('failed');
    expect(stagedResult.short_circuit).toBe(true);
    expect(stagedResult.diagnostics).toContain('INVARIANT-SILENT-DEGRADATION');
  });
});

