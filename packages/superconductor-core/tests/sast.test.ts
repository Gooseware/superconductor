import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Mock child_process so execSync never touches the filesystem / real tools
// ---------------------------------------------------------------------------
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

// Mock tool-registry so getSuperconductorHome() doesn't fail in unit tests
vi.mock('../src/intelligence/tool-registry.js', () => ({
  getSuperconductorHome: vi.fn(() => '/fake/home')
}));

// Import AFTER mocks are registered
import { execSync } from 'child_process';
import {
  parseSemgrepOutput,
  parseTrivyOutput,
  runSast
} from '../src/intelligence/runners/sast.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const semgrepResult = (overrides: Record<string, unknown> = {}) => ({
  check_id: 'rule.id',
  path: 'src/foo.ts',
  start: { line: 42 },
  extra: {
    severity: 'ERROR',
    message: 'Something bad',
    ...((overrides.extra as object) ?? {})
  },
  ...overrides
});

const trivyVuln = (overrides: Record<string, unknown> = {}) => ({
  VulnerabilityID: 'CVE-2024-0001',
  Severity: 'HIGH',
  Title: 'Bad lib',
  Description: 'desc',
  ...overrides
});

// ---------------------------------------------------------------------------
// parseSemgrepOutput
// ---------------------------------------------------------------------------
describe('parseSemgrepOutput', () => {
  it('returns empty array for empty results array', () => {
    const json = JSON.stringify({ results: [] });
    expect(parseSemgrepOutput(json)).toEqual([]);
  });

  it('returns empty array when results key is missing', () => {
    const json = JSON.stringify({});
    expect(parseSemgrepOutput(json)).toEqual([]);
  });

  it('returns empty array for completely invalid JSON', () => {
    expect(parseSemgrepOutput('not-json')).toEqual([]);
  });

  it('maps ERROR severity to critical', () => {
    const json = JSON.stringify({ results: [semgrepResult()] });
    const findings = parseSemgrepOutput(json);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('maps WARNING severity to high', () => {
    const json = JSON.stringify({
      results: [semgrepResult({ extra: { severity: 'WARNING', message: 'warn' } })]
    });
    const findings = parseSemgrepOutput(json);
    expect(findings[0].severity).toBe('high');
  });

  it('maps INFO severity to medium', () => {
    const json = JSON.stringify({
      results: [semgrepResult({ extra: { severity: 'INFO', message: 'info' } })]
    });
    const findings = parseSemgrepOutput(json);
    expect(findings[0].severity).toBe('medium');
  });

  it('maps unknown severity to low', () => {
    const json = JSON.stringify({
      results: [semgrepResult({ extra: { severity: 'BOGUS', message: 'm' } })]
    });
    const findings = parseSemgrepOutput(json);
    expect(findings[0].severity).toBe('low');
  });

  it('defaults missing fields to empty string / 0', () => {
    const minimal = { check_id: undefined, path: undefined, start: undefined, extra: undefined };
    const json = JSON.stringify({ results: [minimal] });
    const findings = parseSemgrepOutput(json);
    expect(findings[0].ruleId).toBe('');
    expect(findings[0].file).toBe('');
    expect(findings[0].line).toBe(0);
    expect(findings[0].message).toBe('');
  });

  it('populates tool as semgrep', () => {
    const json = JSON.stringify({ results: [semgrepResult()] });
    expect(parseSemgrepOutput(json)[0].tool).toBe('semgrep');
  });
});

// ---------------------------------------------------------------------------
// parseTrivyOutput
// ---------------------------------------------------------------------------
describe('parseTrivyOutput', () => {
  it('returns empty array for empty Results array', () => {
    const json = JSON.stringify({ Results: [] });
    expect(parseTrivyOutput(json)).toEqual([]);
  });

  it('returns empty array when Results key is missing', () => {
    const json = JSON.stringify({});
    expect(parseTrivyOutput(json)).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseTrivyOutput('not-json')).toEqual([]);
  });

  it('handles Results entries with no Vulnerabilities array gracefully', () => {
    const json = JSON.stringify({
      Results: [{ Target: 'go.sum' }]
    });
    expect(parseTrivyOutput(json)).toEqual([]);
  });

  it('handles Results entries with empty Vulnerabilities array', () => {
    const json = JSON.stringify({
      Results: [{ Target: 'go.sum', Vulnerabilities: [] }]
    });
    expect(parseTrivyOutput(json)).toEqual([]);
  });

  it('maps multiple Results entries with vulnerabilities', () => {
    const json = JSON.stringify({
      Results: [
        { Target: 'go.sum', Vulnerabilities: [trivyVuln(), trivyVuln({ VulnerabilityID: 'CVE-2024-0002', Severity: 'CRITICAL' })] },
        { Target: 'package-lock.json', Vulnerabilities: [trivyVuln({ VulnerabilityID: 'CVE-2024-0003', Severity: 'LOW' })] }
      ]
    });
    const findings = parseTrivyOutput(json);
    expect(findings).toHaveLength(3);
    expect(findings[0].file).toBe('go.sum');
    expect(findings[1].file).toBe('go.sum');
    expect(findings[2].file).toBe('package-lock.json');
  });

  it('uses Title as message, falls back to Description', () => {
    const withTitle = JSON.stringify({ Results: [{ Target: 'f', Vulnerabilities: [trivyVuln()] }] });
    expect(parseTrivyOutput(withTitle)[0].message).toBe('Bad lib');

    const noTitle = JSON.stringify({ Results: [{ Target: 'f', Vulnerabilities: [trivyVuln({ Title: undefined })] }] });
    expect(parseTrivyOutput(noTitle)[0].message).toBe('desc');
  });

  it('defaults missing severity to unknown', () => {
    const json = JSON.stringify({
      Results: [{ Target: 'f', Vulnerabilities: [trivyVuln({ Severity: undefined })] }]
    });
    expect(parseTrivyOutput(json)[0].severity).toBe('unknown');
  });

  it('populates tool as trivy and line as 0', () => {
    const json = JSON.stringify({ Results: [{ Target: 'f', Vulnerabilities: [trivyVuln()] }] });
    const f = parseTrivyOutput(json)[0];
    expect(f.tool).toBe('trivy');
    expect(f.line).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runSast integration tests (mocked execSync)
// ---------------------------------------------------------------------------
describe('runSast', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-sast-test-'));
    vi.mocked(execSync).mockReset();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns {status: "degraded"} when both capabilities are null', () => {
    const result = runSast('/project', tmpDir, null, null);
    expect(result).toEqual({ status: 'degraded', entries: null });
  });

  it('returns {status: "degraded"} when both capabilities are undefined', () => {
    const result = runSast('/project', tmpDir, undefined, undefined);
    expect(result).toEqual({ status: 'degraded', entries: null });
  });

  it('returns {status: "degraded"} when both capabilities have status unavailable', () => {
    const cap = { status: 'unavailable', tool: 'semgrep' };
    const scaCap = { status: 'unavailable', tool: 'trivy' };
    const result = runSast('/project', tmpDir, cap, scaCap);
    expect(result).toEqual({ status: 'degraded', entries: null });
  });

  it('returns {status: "ok"} when semgrep capability is available and execSync succeeds', () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ results: [semgrepResult()] }));
    const cap = { status: 'available', tool: 'semgrep' };
    const result = runSast('/project', tmpDir, cap, null);
    expect(result).toEqual({ status: 'ok', entries: null });
    const outFile = path.join(tmpDir, '05_sast.json');
    expect(fs.existsSync(outFile)).toBe(true);
  });

  it('returns {status: "ok"} when trivy capability is available and execSync succeeds', () => {
    vi.mocked(execSync).mockReturnValue(
      JSON.stringify({ Results: [{ Target: 'go.sum', Vulnerabilities: [trivyVuln()] }] })
    );
    const scaCap = { status: 'available', tool: 'trivy' };
    const result = runSast('/project', tmpDir, null, scaCap);
    expect(result).toEqual({ status: 'ok', entries: null });
  });

  it('writes findings to 05_sast.json', () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ results: [semgrepResult()] }));
    const cap = { status: 'available', tool: 'semgrep' };
    runSast('/project', tmpDir, cap, null);
    const outFile = path.join(tmpDir, '05_sast.json');
    const written = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    expect(Array.isArray(written)).toBe(true);
    expect(written[0].tool).toBe('semgrep');
  });

  it('returns {status: "ok"} when clean scan yields zero findings with both tools enabled', () => {
    vi.mocked(execSync).mockReturnValueOnce(JSON.stringify({ results: [] }));
    vi.mocked(execSync).mockReturnValueOnce(JSON.stringify({ Results: [] }));
    const cap = { status: 'available', tool: 'semgrep' };
    const scaCap = { status: 'available', tool: 'trivy' };
    const result = runSast('/project', tmpDir, cap, scaCap);
    expect(result).toEqual({ status: 'ok', entries: null });
  });

  it('returns {status: "degraded"} when tool execution throws error (single-tool failure)', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('Command failed'); });
    const cap = { status: 'available', tool: 'semgrep' };
    const result = runSast('/project', tmpDir, cap, null);
    expect(result).toEqual({ status: 'degraded', entries: null });
  });
});
