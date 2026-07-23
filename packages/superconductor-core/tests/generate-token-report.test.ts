import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { recordTokenUsage, generateTokenReport } from '../src/review/generate-token-report.js';

describe('generateTokenReport and recordTokenUsage', () => {
  let tmpDir: string;
  let reportPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-token-'));
    reportPath = path.join(tmpDir, 'token-usage.json');
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should return notice when report file does not exist', () => {
    const report = generateTokenReport(path.join(tmpDir, 'nonexistent.json'));
    expect(report).toContain('No token logs recorded for this run.');
  });

  it('should record token usage entries and generate formatted efficiency report', () => {
    recordTokenUsage(reportPath, {
      stage: 'Fast Pass',
      model: 'gemini-flash-1.5',
      input_tokens: 1000,
      output_tokens: 200,
      cost_usd: 0.005
    });

    recordTokenUsage(reportPath, {
      stage: 'Deep Pass',
      model: 'gemini-pro-1.5',
      input_tokens: 5000,
      output_tokens: 800,
      cost_usd: 0.02
    });

    const report = generateTokenReport(reportPath);

    expect(report).toContain('## Token Efficiency Report');
    expect(report).toContain('Fast Pass');
    expect(report).toContain('Deep Pass');
    expect(report).toContain('**6000**');
    expect(report).toContain('**1000**');
    expect(report).toContain('$0.0250');
    expect(report).toContain('Baseline Monolithic Estimate');
    expect(report).toContain('Actual Savings:');
  });

  it('should handle corrupt report file gracefully', () => {
    fs.writeFileSync(reportPath, 'invalid json content', 'utf-8');
    const report = generateTokenReport(reportPath);
    expect(report).toContain('Failed to parse token logs.');
  });
});
