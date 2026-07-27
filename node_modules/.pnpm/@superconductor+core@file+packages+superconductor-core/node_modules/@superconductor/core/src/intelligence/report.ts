import * as fs from 'fs';
import * as path from 'path';

export function generateReport(outputDir: string) {
  const outFile = path.join(outputDir, 'repository-health-report.md');
  let md = '# Repository Health Report\\n\\n';
  
  // Executive Summary
  md += '## Executive Summary\\n\\nReport generated.\\n\\n';
  
  // Stack Fingerprint
  md += '## Stack Fingerprint\\n\\n';
  try {
    const fp = JSON.parse(fs.readFileSync(path.join(outputDir, '01_fingerprint.json'), 'utf8'));
    md += `Primary Language: ${fp.primaryLanguage}\\nTotal Lines: ${fp.totalLines}\\n\\n`;
  } catch (e) { md += 'No fingerprint data.\\n\\n'; }

  // Dependency Health
  md += '## Dependency Health\\n\\nSee 02_dependencies.json\\n\\n';

  // Complexity Hotspot Map
  md += '## Complexity Hotspot Map\\n\\n';
  let hotspots: any[] = [];
  try {
    hotspots = JSON.parse(fs.readFileSync(path.join(outputDir, '03_complexity.json'), 'utf8'));
    for (let i = 0; i < Math.min(10, hotspots.length); i++) {
      md += `- ${hotspots[i].file}: Score ${hotspots[i].hotspot_score.toFixed(2)}\\n`;
    }
  } catch (e) { md += 'No complexity data.\\n'; }
  md += '\\n';

  // Security Surface
  md += '## Security Surface (SAST)\\n\\n';
  try {
    const sast = JSON.parse(fs.readFileSync(path.join(outputDir, '05_sast.json'), 'utf8'));
    if (sast && sast.findings) {
      md += `${sast.findings.length} findings.\\n`;
    }
  } catch (e) { md += 'No SAST data.\\n'; }
  md += '\\n';

  // API Coverage Gaps
  md += '## API Coverage Gaps\\n\\nSee 06_api_surface_summary.md\\n\\n';

  // Test Coverage Gaps
  md += '## Test Coverage Gaps\\n\\n';
  try {
    const gaps = JSON.parse(fs.readFileSync(path.join(outputDir, '07_test_gaps.json'), 'utf8'));
    for (let i = 0; i < Math.min(10, gaps.length); i++) {
      md += `- ${gaps[i].file} (Risk: ${gaps[i].riskLevel}, Churn: ${gaps[i].gitChurnScore})\\n`;
    }
  } catch (e) { md += 'No test gaps data.\\n'; }
  md += '\\n';

  // Recommendations
  md += '## Recommendations\\n\\n';
  md += 'Top recommendations based on hotspot score and severity:\\n';
  // simple top 5 based on hotspots
  for (let i = 0; i < Math.min(5, hotspots.length); i++) {
    md += `${i+1}. Refactor ${hotspots[i].file} to reduce complexity.\\n`;
  }
  md += '\\n';

  fs.writeFileSync(outFile, md);
}
