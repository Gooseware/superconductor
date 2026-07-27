import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectProjectLanguage, getDiagnosticCommand } from '../src/review/deterministic-preflight.js';

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
