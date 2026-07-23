import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function runFingerprint(projectRoot: string, outputDir: string, capability: any) {
  const outFile = path.join(outputDir, '01_fingerprint.json');
  if (!capability || capability.status === 'unavailable' || !capability.tool) {
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }

  try {
    let result: any = { languages: {}, totalLines: 0, totalFiles: 0, primaryLanguage: null };
    if (capability.tool === 'tokei') {
      const out = execSync(`tokei ${projectRoot} --output json`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(out);
      let maxLines = 0;
      for (const [lang, stats] of Object.entries(data)) {
        if (lang === 'Total') continue;
        const info = stats as any;
        result.languages[lang] = info.code || 0;
        result.totalLines += info.code || 0;
        result.totalFiles += info.reports?.length || 0;
        if ((info.code || 0) > maxLines) {
          maxLines = info.code || 0;
          result.primaryLanguage = lang;
        }
      }
    } else {
      // scc fallback handling if needed
      fs.writeFileSync(outFile, JSON.stringify(null));
      return { status: 'degraded' };
    }
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    return { status: 'ok' };
  } catch (e) {
    fs.writeFileSync(outFile, JSON.stringify(null));
    return { status: 'degraded' };
  }
}
