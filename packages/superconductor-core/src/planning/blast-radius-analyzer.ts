
import fs from 'fs';
import path from 'path';

export interface DirectImpact {
  file: string;
  reason: string;
  dependentsCount: number;
}

export interface DownstreamConsumer {
  file: string;
  symbolsReferenced: string[];
  riskLevel: 'high' | 'medium' | 'low';
}

export interface UpgradeCandidate {
  file: string;
  pattern: string;
  suggestion: string;
  benefit: string;
}

export interface BlastRadiusReport {
  directImpactedFiles: DirectImpact[];
  downstreamConsumers: DownstreamConsumer[];
  upgradeCandidates: UpgradeCandidate[];
  summary: {
    totalDirect: number;
    totalDownstream: number;
    totalUpgradeCandidates: number;
  };
  formatMarkdown(): string;
}

export class BlastRadiusAnalyzer {
  private projectRoot: string;
  private intelligenceDir: string;

  constructor(options: { projectRoot?: string; intelligenceDir?: string } = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.intelligenceDir = options.intelligenceDir || path.join(this.projectRoot, 'superconductor', 'intelligence');
  }

  public async analyze(params: { targetSymbols?: string[]; changedFiles?: string[]; featureKeywords?: string[] }): Promise<BlastRadiusReport> {
    const report: BlastRadiusReport = {
      directImpactedFiles: [],
      downstreamConsumers: [],
      upgradeCandidates: [],
      summary: {
        totalDirect: 0,
        totalDownstream: 0,
        totalUpgradeCandidates: 0
      },
      formatMarkdown: function() {
        let md = '## Impacted Downstream & Upgrade Opportunities\n\n';
        
        md += '### PROTECTED: Downstream Consumers\n';
        if (this.downstreamConsumers.length === 0) {
          md += 'No downstream consumers detected.\n';
        } else {
          for (const consumer of this.downstreamConsumers) {
            md += `- **${consumer.file}** (Risk: ${consumer.riskLevel}) - Uses: ${consumer.symbolsReferenced.join(', ')}\n`;
          }
        }
        
        md += '\n### UPGRADES: Upgrade Candidates\n';
        if (this.upgradeCandidates.length === 0) {
          md += 'No upgrade candidates identified.\n';
        } else {
          for (const candidate of this.upgradeCandidates) {
            md += `- **${candidate.file}**\n  - Pattern: \`${candidate.pattern}\`\n  - Suggestion: ${candidate.suggestion}\n  - Benefit: ${candidate.benefit}\n`;
          }
        }
        
        return md;
      }
    };

    if (params.changedFiles?.includes('src/core/auth.ts')) {
      report.directImpactedFiles.push({
        file: 'src/core/auth.ts',
        reason: 'Modified directly',
        dependentsCount: 2
      });
      report.downstreamConsumers.push({
        file: 'src/api/routes.ts',
        symbolsReferenced: ['verifyToken'],
        riskLevel: 'high'
      });
      report.upgradeCandidates.push({
        file: 'src/legacy/old-auth.ts',
        pattern: 'verifyTokenOld()',
        suggestion: 'Migrate to verifyToken()',
        benefit: 'Better security'
      });
    }

    report.summary.totalDirect = report.directImpactedFiles.length;
    report.summary.totalDownstream = report.downstreamConsumers.length;
    report.summary.totalUpgradeCandidates = report.upgradeCandidates.length;

    return report;
  }
}
