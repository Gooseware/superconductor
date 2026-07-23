import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getSuperconductorHome } from '../tool-registry.js';

interface SastFinding {
  tool: string;
  severity: string;
  ruleId: string;
  file: string;
  line: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Severity mapping helpers
// ---------------------------------------------------------------------------

function mapSemgrepSeverity(raw: string | undefined): string {
  switch ((raw ?? '').toUpperCase()) {
    case 'ERROR':   return 'critical';
    case 'WARNING': return 'high';
    case 'INFO':    return 'medium';
    default:        return 'low';
  }
}

// ---------------------------------------------------------------------------
// Exported pure parsers (also used by tests)
// ---------------------------------------------------------------------------

export function parseSemgrepOutput(jsonStr: string): SastFinding[] {
  try {
    const data = JSON.parse(jsonStr);
    if (!data.results) return [];
    return data.results.map((res: any) => ({
      tool: 'semgrep',
      severity: mapSemgrepSeverity(res.extra?.severity),
      ruleId: res.check_id ?? '',
      file: res.path ?? '',
      line: res.start?.line ?? 0,
      message: res.extra?.message ?? ''
    }));
  } catch {
    return [];
  }
}

export function parseTrivyOutput(jsonStr: string): SastFinding[] {
  try {
    const data = JSON.parse(jsonStr);
    if (!data.Results) return [];
    const findings: SastFinding[] = [];
    for (const res of data.Results) {
      if (!res.Vulnerabilities) continue;
      for (const v of res.Vulnerabilities) {
        findings.push({
          tool: 'trivy',
          severity: v.Severity ?? 'unknown',
          ruleId: v.VulnerabilityID ?? '',
          file: res.Target ?? '',
          line: 0,
          message: v.Title ?? v.Description ?? ''
        });
      }
    }
    return findings;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Tool scan runners
// ---------------------------------------------------------------------------

function runSemgrepScan(projectRoot: string, capability: any): SastFinding[] {
  if (!capability || capability.status === 'unavailable' || capability.tool !== 'semgrep') {
    return [];
  }
  const quotedRoot = JSON.stringify(projectRoot);
  try {
    const out = execSync(
      `semgrep scan ${quotedRoot} --config=auto --json 2>/dev/null`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    return parseSemgrepOutput(out);
  } catch (rawError: unknown) {
    const e = rawError as { stdout?: Buffer };
    if (e.stdout) {
      return parseSemgrepOutput(e.stdout.toString());
    }
    return [];
  }
}

function runTrivyScan(projectRoot: string, scaCapability: any): SastFinding[] {
  if (!scaCapability || scaCapability.status === 'unavailable' || scaCapability.tool !== 'trivy') {
    return [];
  }
  const quotedRoot = JSON.stringify(projectRoot);
  try {
    const out = execSync(
      `trivy fs ${quotedRoot} --scanners vuln --format json --quiet 2>/dev/null`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    return parseTrivyOutput(out);
  } catch (rawError: unknown) {
    const e = rawError as { stdout?: Buffer };
    if (e.stdout) {
      return parseTrivyOutput(e.stdout.toString());
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function runSast(projectRoot: string, outputDir: string, capability: any, scaCapability: any) {
  const outFile = path.join(outputDir, '05_sast.json');
  void getSuperconductorHome(); // preserved side-effect / future use

  const semgrepAvailable = capability && capability.status !== 'unavailable' && capability.tool === 'semgrep';
  const trivyAvailable = scaCapability && scaCapability.status !== 'unavailable' && scaCapability.tool === 'trivy';

  if (!semgrepAvailable && !trivyAvailable) {
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }

  const findings: SastFinding[] = [
    ...runSemgrepScan(projectRoot, capability),
    ...runTrivyScan(projectRoot, scaCapability)
  ];

  fs.writeFileSync(outFile, JSON.stringify(findings, null, 2));

  const degraded = findings.length === 0 && semgrepAvailable && trivyAvailable;
  return { status: degraded ? 'degraded' : 'ok' };
}
