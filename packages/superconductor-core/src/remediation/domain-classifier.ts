import * as fs from 'fs';
import * as path from 'path';

export interface Finding {
  file?: string;
  [key: string]: any;
}

export class DomainClassifier {
  private domainMap: Record<string, string>;

  constructor(customMapOrPath?: Record<string, string> | string) {
    // Load default map
    let defaultMap: Record<string, string> = {};
    try {
      const defaultMapPath = path.resolve(__dirname, 'domain-map.json');
      if (fs.existsSync(defaultMapPath)) {
        defaultMap = JSON.parse(fs.readFileSync(defaultMapPath, 'utf8'));
      } else {
        // Fallback for tests if compiled differently
        defaultMap = require('./domain-map.json');
      }
    } catch (e) {
      // Ignore
    }

    let customMap: Record<string, string> = {};
    if (typeof customMapOrPath === 'string') {
      try {
        if (fs.existsSync(customMapOrPath)) {
          customMap = JSON.parse(fs.readFileSync(customMapOrPath, 'utf8'));
        }
      } catch (e) {
        // Ignore
      }
    } else if (customMapOrPath) {
      customMap = customMapOrPath;
    }

    this.domainMap = { ...defaultMap, ...customMap };
  }

  classify(filePath: string): string {
    if (!filePath) return 'general-remediator';

    // Check custom and default map
    for (const [pattern, domain] of Object.entries(this.domainMap)) {
      if (pattern.startsWith('*') && pattern.endsWith('*')) {
        // e.g. *.spec.* -> check if it includes .spec.
        const core = pattern.slice(1, -1);
        if (filePath.includes(core)) {
          return domain;
        }
      } else if (filePath.includes(pattern)) {
        return domain;
      }
    }

    return 'general-remediator';
  }

  groupByDomain(findings: Finding[]): Record<string, Finding[]> {
    const grouped: Record<string, Finding[]> = {};

    for (const finding of findings) {
      const domain = this.classify(finding.file || '');
      if (!grouped[domain]) {
        grouped[domain] = [];
      }
      grouped[domain].push(finding);
    }

    return grouped;
  }
}
