import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getSuperconductorHome } from '../tool-registry.js';

export function runSast(projectRoot: string, outputDir: string, capability: any, scaCapability: any) {
  const outFile = path.join(outputDir, '05_sast.json');
  const home = getSuperconductorHome();
  let result: { findings: any[] } = { findings: [] };
  let degraded = true;

  if (capability && capability.status !== 'unavailable' && capability.tool === 'semgrep') {
    try {
      const out = execSync(`semgrep --config ${path.join(home, 'semgrep-rules')} --json ${projectRoot}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
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
    } catch (e: any) {
      // semgrep might exit 1 if findings
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
      } catch (e2) {}
    }
  }

  if (scaCapability && scaCapability.status !== 'unavailable' && scaCapability.tool === 'trivy') {
    try {
      const out = execSync(`trivy fs --skip-db-update --offline-scan --cache-dir ${path.join(home, 'trivy-db')} --format json ${projectRoot}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
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
    } catch (e: any) {
      try {
        if (e.stdout) {
          const data = JSON.parse(e.stdout.toString());
          // process
          degraded = false;
        }
      } catch (e2) {}
    }
  }

  if (degraded && (!capability || capability.status === 'unavailable') && (!scaCapability || scaCapability.status === 'unavailable')) {
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }

  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  return { status: degraded ? 'degraded' : 'ok' };
}
