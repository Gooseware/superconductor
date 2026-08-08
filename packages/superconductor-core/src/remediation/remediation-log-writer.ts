import * as fs from 'fs/promises';
import { RemediationStateObject } from './remediation-state';

export interface LogWriterOptions {
  target: string;
  timestamp?: string;
  includeStats?: boolean;
}

export class RemediationLogWriter {
  write(state: RemediationStateObject, options: LogWriterOptions): string {
    const timestamp = options.timestamp || new Date().toISOString();
    let log = `<Remediation Log — ${options.target} — ${timestamp}>\n`;

    const reverseDomainMap: Record<string, string> = {};
    if (state.domainAssignments) {
      for (const [domain, findingIds] of Object.entries(state.domainAssignments)) {
        for (const fId of findingIds) {
          reverseDomainMap[fId] = domain;
        }
      }
    }

    if (state.findingIndex) {
      for (const [fId, finding] of Object.entries(state.findingIndex)) {
        log += `## Finding: ${fId}\n`;
        const domain = reverseDomainMap[fId] || 'UNKNOWN';
        log += `- Domain: ${domain}\n`;
        log += `- Agent: ${domain}\n`;

        const attempts = (state.retryCount && state.retryCount[domain]) || 0;
        log += `- Attempts: ${attempts}\n`;

        const hasDeepResearch = state.deepResearchResults && state.deepResearchResults[fId] ? 'yes' : 'no';
        log += `- Deep Research Called: ${hasDeepResearch}\n`;

        let outcome = 'ESCALATED';
        let isResolved = false;
        if (state.fixedFindings && state.fixedFindings.includes(fId)) {
          outcome = 'RESOLVED';
          isResolved = true;
        } else if (state.failedFindings && state.failedFindings.includes(fId) && finding.severity === 'CRITICAL') {
          outcome = 'HUMAN_REQUIRED';
        }
        log += `- Outcome: ${outcome}\n`;

        let sha = 'N/A';
        if (isResolved) {
          if (state.fixCommitShas && state.fixCommitShas[fId]) {
            sha = state.fixCommitShas[fId];
          } else if (state.fixCommitSha) {
            sha = state.fixCommitSha;
          }
        }
        log += `- Fix SHA: ${sha}\n`;
      }
    }

    if (options.includeStats && state.tokenUsage) {
      log += `\n## Token Usage\n`;
      log += `| Domain | Tokens |\n`;
      log += `|--------|--------|\n`;
      for (const [domain, tokens] of Object.entries(state.tokenUsage)) {
        log += `| ${domain} | ${tokens} |\n`;
      }
    }

    log += `</Remediation Log — ${options.target} — ${timestamp}>\n`;
    return log;
  }

  async writeToFile(state: RemediationStateObject, outputPath: string, options: LogWriterOptions): Promise<void> {
    const content = this.write(state, options);
    await fs.writeFile(outputPath, content, 'utf8');
  }
}
