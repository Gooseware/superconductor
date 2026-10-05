import { describe, it, expect } from 'vitest';
import { BlastRadiusAnalyzer } from '../blast-radius-analyzer.js';

describe('BlastRadiusAnalyzer', () => {
  it('should initialize with default options', () => {
    const analyzer = new BlastRadiusAnalyzer();
    expect(analyzer).toBeDefined();
  });

  it('should detect direct impacts, downstream consumers, and upgrade candidates', async () => {
    const analyzer = new BlastRadiusAnalyzer();
    const report = await analyzer.analyze({
      changedFiles: ['src/core/auth.ts']
    });

    expect(report.summary.totalDirect).toBe(1);
    expect(report.summary.totalDownstream).toBe(1);
    expect(report.summary.totalUpgradeCandidates).toBe(1);

    expect(report.directImpactedFiles[0].file).toBe('src/core/auth.ts');
    expect(report.downstreamConsumers[0].file).toBe('src/api/routes.ts');
    expect(report.downstreamConsumers[0].riskLevel).toBe('high');
    expect(report.upgradeCandidates[0].file).toBe('src/legacy/old-auth.ts');
  });

  it('should correctly format markdown output', async () => {
    const analyzer = new BlastRadiusAnalyzer();
    const report = await analyzer.analyze({
      changedFiles: ['src/core/auth.ts']
    });

    const markdown = report.formatMarkdown();
    expect(markdown).toContain('## Impacted Downstream & Upgrade Opportunities');
    expect(markdown).toContain('### PROTECTED: Downstream Consumers');
    expect(markdown).toContain('### UPGRADES: Upgrade Candidates');
    expect(markdown).toContain('- **src/api/routes.ts**');
    expect(markdown).toContain('- **src/legacy/old-auth.ts**');
  });
});
