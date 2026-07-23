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

export function runSast(projectRoot: string, outputDir: string, capability: any, scaCapability: any) {
  const outFile = path.join(outputDir, '05_sast.json');
  const home = getSuperconductorHome();
  let result: { findings: SastFinding[] } = { findings: [] };
  let degraded = true;

  if (capability && capability.status !== 'unavailable' && capability.tool === 'semgrep') {
    try {
      const quotedRoot = JSON.stringify(projectRoot);
      const out = execSync(`semgrep scan ${quotedRoot} --config=auto --json 2>/dev/null`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(out);
      if (data.results) {
        for (const res of data.results) {
          result.findings.push({
            tool: 'semgrep',
            severity: res.extra?.severity || 'warning',
            ruleId: res.check_id,
            file: res.path,
            line: res.start?.line || 0,
            message: res.extra?.message || ''
          });
        }
      }
      degraded = false;
    } catch (rawError: unknown) {
      const e = rawError as { stdout?: Buffer };
      try {
        if (e.stdout) {
          const data = JSON.parse(e.stdout.toString());
          if (data.results) {
            for (const res of data.results) {
              result.findings.push({
                tool: 'semgrep',
                severity: res.extra?.severity || 'warning',
                ruleId: res.check_id,
                file: res.path,
                line: res.start?.line || 0,
                message: res.extra?.message || ''
              });
            }
          }
          degraded = false;
        }
      } catch { }
    }
  }

  if (scaCapability && scaCapability.status !== 'unavailable' && scaCapability.tool === 'trivy') {
    try {
      const quotedRoot = JSON.stringify(projectRoot);
      const out = execSync(`trivy fs ${quotedRoot} --scanners vuln --format json --quiet 2>/dev/null`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(out);
      if (data.Results) {
        for (const res of data.Results) {
          if (res.Vulnerabilities) {
            for (const v of res.Vulnerabilities) {
              result.findings.push({
                tool: 'trivy',
                severity: v.Severity || 'unknown',
                ruleId: v.VulnerabilityID,
                file: res.Target,
                line: 0,
                message: v.Title || v.Description || ''
              });
            }
          }
        }
      }
      degraded = false;
    } catch (rawError: unknown) {
      const e = rawError as { stdout?: Buffer };
      try {
        if (e.stdout) {
          JSON.parse(e.stdout.toString());
          degraded = false;
        }
      } catch { }
    }
  }

  if (degraded && (!capability || capability.status === 'unavailable') && (!scaCapability || scaCapability.status === 'unavailable')) {
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }

  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  return { status: degraded ? 'degraded' : 'ok' };
}
