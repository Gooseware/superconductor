import { execSync, spawnSync } from 'child_process';
import { RunnerResult } from './types.js';
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

function mapTrivyVulnerability(v: any, target: string): SastFinding {
  return {
    tool: 'trivy',
    severity: v.Severity ?? 'unknown',
    ruleId: v.VulnerabilityID ?? '',
    file: target ?? '',
    line: 0,
    message: v.Title ?? v.Description ?? ''
  };
}

export function parseTrivyOutput(jsonStr: string): SastFinding[] {
  try {
    const data = JSON.parse(jsonStr);
    if (!data.Results) return [];
    const findings: SastFinding[] = [];
    for (const res of data.Results) {
      if (!res.Vulnerabilities) continue;
      for (const v of res.Vulnerabilities) {
        findings.push(mapTrivyVulnerability(v, res.Target));
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

function runSemgrepScan(projectRoot: string, capability: any, scopedFiles?: string[]): { findings: SastFinding[], success: boolean } {
  if (!capability || capability.status === 'unavailable' || capability.tool !== 'semgrep') {
    return { findings: [], success: true };
  }
  
  try {
    let out;
    if (scopedFiles && scopedFiles.length > 0) {
      const validFiles = scopedFiles
        .map(f => path.resolve(projectRoot, f))
        .filter(abs => abs.startsWith(path.resolve(projectRoot)) && fs.existsSync(abs));
        
      if (validFiles.length === 0) return { findings: [], success: true };
      
      const result = spawnSync('semgrep', ['scan', '--config=auto', '--json', ...validFiles], {
        cwd: projectRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024
      });
      out = result.stdout || '{}';
      if (result.status !== 0 && !result.stdout) throw new Error('semgrep failed');
    } else {
      out = execSync(
        `semgrep scan ${JSON.stringify(projectRoot)} --config=auto --json 2>/dev/null`,
        { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
      );
    }
    return { findings: parseSemgrepOutput(out), success: true };
  } catch (rawError: unknown) {
    const e = rawError as { stdout?: Buffer | string };
    if (e.stdout) {
      return { findings: parseSemgrepOutput(e.stdout.toString()), success: true };
    }
    return { findings: [], success: false };
  }
}

function runTrivyScan(projectRoot: string, scaCapability: any, scopedFiles?: string[]): { findings: SastFinding[], success: boolean } {
  if (!scaCapability || scaCapability.status === 'unavailable' || scaCapability.tool !== 'trivy') {
    return { findings: [], success: true };
  }
  
  try {
    if (scopedFiles && scopedFiles.length > 0) {
      const findings: SastFinding[] = [];
      let success = true;
      for (const file of scopedFiles) {
        const fullPath = path.join(projectRoot, file);
        if (!fs.existsSync(fullPath)) continue;
        try {
          const out = execSync(
            `trivy fs ${JSON.stringify(fullPath)} --scanners vuln --format json --quiet 2>/dev/null`,
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
          );
          findings.push(...parseTrivyOutput(out));
        } catch (rawError: unknown) {
          const e = rawError as { stdout?: Buffer };
          if (e.stdout) {
            findings.push(...parseTrivyOutput(e.stdout.toString()));
          } else {
            success = false;
          }
        }
      }
      return { findings, success };
    } else {
      const quotedRoot = JSON.stringify(projectRoot);
      const out = execSync(
        `trivy fs ${quotedRoot} --scanners vuln --format json --quiet 2>/dev/null`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
      return { findings: parseTrivyOutput(out), success: true };
    }
  } catch (rawError: unknown) {
    const e = rawError as { stdout?: Buffer };
    if (e.stdout) {
      return { findings: parseTrivyOutput(e.stdout.toString()), success: true };
    }
    return { findings: [], success: false };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function runSast(projectRoot: string, outputDir: string, capability: any, scaCapability: any, scopedFiles?: string[]): RunnerResult<SastFinding> {
  const outFile = path.join(outputDir, '05_sast.json');
  void getSuperconductorHome(); // preserved side-effect / future use

  const semgrepAvailable = capability && capability.status !== 'unavailable' && capability.tool === 'semgrep';
  const trivyAvailable = scaCapability && scaCapability.status !== 'unavailable' && scaCapability.tool === 'trivy';

  if (!semgrepAvailable && !trivyAvailable) {
    if (scopedFiles && scopedFiles.length > 0) return { status: 'degraded', entries: [] };
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded', entries: null };
  }

  const semgrepRes = runSemgrepScan(projectRoot, capability, scopedFiles);
  const trivyRes = runTrivyScan(projectRoot, scaCapability, scopedFiles);

  const findings: SastFinding[] = [
    ...semgrepRes.findings,
    ...trivyRes.findings
  ];

  const degraded = (!semgrepRes.success && semgrepAvailable) || (!trivyRes.success && trivyAvailable);
  
  if (scopedFiles && scopedFiles.length > 0) {
    return { status: degraded ? 'degraded' : 'ok', entries: findings };
  }

  fs.writeFileSync(outFile, JSON.stringify(findings, null, 2));
  return { status: degraded ? 'degraded' : 'ok', entries: null };
}
