import * as fs from 'node:fs';
import * as path from 'node:path';

export interface HeadlessReportData {
  trackId: string;
  targetBranch: string;
  startTime: number;
  endTime: number;
  status: 'SUCCESS' | 'NEEDS_ATTENTION' | 'CIRCUIT_BROKEN' | 'FAILED';
  tasks: Array<{
    id: string;
    title: string;
    tier: string;
    agent: string;
    status: 'completed' | 'failed' | 'skipped';
    durationMs?: number;
  }>;
  quorumVerdicts?: Array<{
    role: string;
    verdict: 'RESOLVED' | 'NEEDS_FIXES';
    findingsCount: number;
    blockingCount: number;
  }>;
  tokenMetrics?: {
    promptTokens: number;
    completionTokens: number;
    totalCost: string;
    cacheHitRate?: string;
  };
  actionItems?: string[];
}

const STATUS_METADATA: Record<
  HeadlessReportData['status'],
  { emoji: string; color: string; label: string }
> = {
  SUCCESS: { emoji: '🟢', color: 'brightgreen', label: 'SUCCESS' },
  NEEDS_ATTENTION: { emoji: '🟡', color: 'yellow', label: 'NEEDS_ATTENTION' },
  CIRCUIT_BROKEN: { emoji: '🔴', color: 'red', label: 'CIRCUIT_BROKEN' },
  FAILED: { emoji: '❌', color: 'critical', label: 'FAILED' },
};

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const mins = Math.floor(durationMs / 60000);
  const secs = Math.round((durationMs % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTimestampForFile(timestampMs: number): string {
  const d = !isNaN(timestampMs) && timestampMs > 0 ? new Date(timestampMs) : new Date();
  return d.toISOString().replace(/[:.]/g, '-');
}

export class HeadlessReporter {
  /**
   * Generates clean, GitHub-flavored markdown report with status badge, tables, metrics, and actionable items.
   */
  formatMarkdown(data: HeadlessReportData): string {
    const meta = STATUS_METADATA[data.status] ?? {
      emoji: '⚪',
      color: 'lightgrey',
      label: data.status,
    };
    const shieldsBadge = `![Status: ${meta.label}](https://img.shields.io/badge/Status-${encodeURIComponent(meta.label)}-${meta.color})`;

    const startIso =
      !isNaN(data.startTime) && data.startTime > 0
        ? new Date(data.startTime).toISOString()
        : 'N/A';
    const endIso =
      !isNaN(data.endTime) && data.endTime > 0
        ? new Date(data.endTime).toISOString()
        : 'N/A';
    const durationMs = Math.max(0, (data.endTime || 0) - (data.startTime || 0));
    const durationStr = formatDuration(durationMs);

    const sections: string[] = [];

    // Header & Meta
    sections.push(`# Morning Briefing: ${data.trackId}\n`);
    sections.push(`${shieldsBadge}\n`);
    sections.push(
      `> **Status:** ${meta.emoji} **${data.status}**  \n` +
      `> **Target Branch:** \`${data.targetBranch}\`  \n` +
      `> **Execution Window:** ${startIso} — ${endIso} (${durationStr})\n`
    );

    // Tasks table
    sections.push('## Executed Tasks\n');
    const tasks = data.tasks || [];
    if (tasks.length === 0) {
      sections.push('*No tasks were executed.*\n');
    } else {
      sections.push('| Task ID | Title | Tier | Agent | Status | Duration |');
      sections.push('|---|---|---|---|---|---|');
      for (const t of tasks) {
        const statusBadge =
          t.status === 'completed'
            ? '✅ completed'
            : t.status === 'failed'
            ? '❌ failed'
            : '⏭️ skipped';
        const durationFormatted =
          t.durationMs !== undefined ? formatDuration(t.durationMs) : '—';
        sections.push(
          `| ${t.id} | ${t.title} | ${t.tier} | ${t.agent} | ${statusBadge} | ${durationFormatted} |`
        );
      }
      sections.push('');
    }

    // Quorum verdicts
    if (data.quorumVerdicts !== undefined) {
      sections.push('## Quorum Review Verdicts\n');
      if (data.quorumVerdicts.length === 0) {
        sections.push('*No quorum review verdicts recorded.*\n');
      } else {
        sections.push('| Reviewer Role | Verdict | Findings | Blocking Issues |');
        sections.push('|---|---|---|---|');
        for (const qv of data.quorumVerdicts) {
          const verdictBadge =
            qv.verdict === 'RESOLVED' ? '✅ RESOLVED' : '❌ NEEDS_FIXES';
          sections.push(
            `| ${qv.role} | ${verdictBadge} | ${qv.findingsCount} | ${qv.blockingCount} |`
          );
        }
        sections.push('');
      }
    }

    // Token metrics
    if (data.tokenMetrics) {
      sections.push('## Token & Cost Metrics\n');
      const tm = data.tokenMetrics;
      const totalTokens = (tm.promptTokens || 0) + (tm.completionTokens || 0);

      sections.push('| Metric | Value |');
      sections.push('|---|---|');
      sections.push(`| Prompt Tokens | ${tm.promptTokens.toLocaleString()} |`);
      sections.push(`| Completion Tokens | ${tm.completionTokens.toLocaleString()} |`);
      sections.push(`| Total Tokens | ${totalTokens.toLocaleString()} |`);
      sections.push(`| Total Cost | ${tm.totalCost} |`);
      if (tm.cacheHitRate !== undefined) {
        sections.push(`| Cache Hit Rate | ${tm.cacheHitRate} |`);
      }
      sections.push('');
    }

    // Action items
    sections.push('## Action Items\n');
    if (data.actionItems && data.actionItems.length > 0) {
      for (const item of data.actionItems) {
        const cleanItem = item.trim();
        if (cleanItem.startsWith('- ') || cleanItem.startsWith('* ')) {
          sections.push(cleanItem);
        } else {
          sections.push(`- ${cleanItem}`);
        }
      }
      sections.push('');
    } else {
      switch (data.status) {
        case 'SUCCESS':
          sections.push(`- [x] All tasks completed successfully. Ready for merge into \`${data.targetBranch}\`.\n`);
          break;
        case 'NEEDS_ATTENTION':
          sections.push('- [ ] Quorum reviewers flagged open findings. Inspect and address before merging.\n');
          break;
        case 'CIRCUIT_BROKEN':
          sections.push('- [ ] Circuit breaker triggered. Inspect watchdog logs and stagnant diffs before retrying.\n');
          break;
        case 'FAILED':
        default:
          sections.push('- [ ] Execution failed. Inspect task error logs and investigate failures.\n');
          break;
      }
    }

    return sections.join('\n');
  }

  /**
   * Writes `HEADLESS_REPORT_<timestamp>.md` and symlink/copy `HEADLESS_REPORT.md` to disk.
   */
  async writeReport(
    data: HeadlessReportData,
    outputDir?: string
  ): Promise<{ reportPath: string; latestPath: string }> {
    const targetDir = outputDir ? path.resolve(outputDir) : process.cwd();
    await fs.promises.mkdir(targetDir, { recursive: true });

    const timestamp = formatTimestampForFile(data.endTime || Date.now());
    const reportPath = path.join(targetDir, `HEADLESS_REPORT_${timestamp}.md`);
    const latestPath = path.join(targetDir, 'HEADLESS_REPORT.md');

    const markdown = this.formatMarkdown(data);

    await fs.promises.writeFile(reportPath, markdown, 'utf-8');
    await fs.promises.copyFile(reportPath, latestPath);

    return { reportPath, latestPath };
  }

  static formatMarkdown(data: HeadlessReportData): string {
    return new HeadlessReporter().formatMarkdown(data);
  }

  static async writeReport(
    data: HeadlessReportData,
    outputDir?: string
  ): Promise<{ reportPath: string; latestPath: string }> {
    return new HeadlessReporter().writeReport(data, outputDir);
  }
}
