import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  HeadlessReporter,
  type HeadlessReportData,
} from '../headless-reporter.js';

describe('HeadlessReporter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sc-headless-report-test-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const baseReportData: HeadlessReportData = {
    trackId: 'track_alpha_20261005',
    targetBranch: 'main',
    startTime: 1700000000000,
    endTime: 1700000065000, // 65 seconds
    status: 'SUCCESS',
    tasks: [
      {
        id: 'task-1',
        title: 'Initialize workspace skeleton',
        tier: 'TIER-1',
        agent: 'superconductor-setup',
        status: 'completed',
        durationMs: 15000,
      },
      {
        id: 'task-2',
        title: 'Implement core engine loop',
        tier: 'TIER-3',
        agent: 'superconductor-processor',
        status: 'completed',
        durationMs: 50000,
      },
    ],
    quorumVerdicts: [
      {
        role: 'correctness-reviewer',
        verdict: 'RESOLVED',
        findingsCount: 0,
        blockingCount: 0,
      },
      {
        role: 'security-reviewer',
        verdict: 'RESOLVED',
        findingsCount: 1,
        blockingCount: 0,
      },
    ],
    tokenMetrics: {
      promptTokens: 45000,
      completionTokens: 8500,
      totalCost: '$0.185',
      cacheHitRate: '78.5%',
    },
    actionItems: [
      'Track ready for merge into main branch',
      'Monitor post-deployment telemetry',
    ],
  };

  describe('formatMarkdown', () => {
    it('generates GFM markdown report with track ID, target branch, and duration', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown(baseReportData);

      expect(md).toContain('# Morning Briefing: track_alpha_20261005');
      expect(md).toContain('main');
      expect(md).toContain('track_alpha_20261005');
      expect(md).toMatch(/65(\.0)?s|1m 5s/);
    });

    it('renders correct status badges and emojis for all possible statuses', () => {
      const reporter = new HeadlessReporter();

      const statuses: Array<HeadlessReportData['status']> = [
        'SUCCESS',
        'NEEDS_ATTENTION',
        'CIRCUIT_BROKEN',
        'FAILED',
      ];

      for (const status of statuses) {
        const md = reporter.formatMarkdown({ ...baseReportData, status });
        expect(md).toContain(status);
        if (status === 'SUCCESS') {
          expect(md).toMatch(/🟢|SUCCESS/);
        } else if (status === 'NEEDS_ATTENTION') {
          expect(md).toMatch(/🟡|NEEDS_ATTENTION/);
        } else if (status === 'CIRCUIT_BROKEN') {
          expect(md).toMatch(/🔴|⚡|CIRCUIT_BROKEN/);
        } else if (status === 'FAILED') {
          expect(md).toMatch(/❌|FAILED/);
        }
      }
    });

    it('formats tasks table with IDs, titles, tiers, agents, statuses, and durations', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown(baseReportData);

      expect(md).toContain('| Task ID | Title | Tier | Agent | Status | Duration |');
      expect(md).toContain('task-1');
      expect(md).toContain('Initialize workspace skeleton');
      expect(md).toContain('TIER-1');
      expect(md).toContain('superconductor-setup');
      expect(md).toMatch(/completed/i);
      expect(md).toMatch(/15(\.0)?s|15000ms/);

      expect(md).toContain('task-2');
      expect(md).toContain('Implement core engine loop');
      expect(md).toContain('TIER-3');
      expect(md).toContain('superconductor-processor');
    });

    it('handles empty task list gracefully', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown({
        ...baseReportData,
        tasks: [],
      });

      expect(md).toMatch(/no tasks/i);
    });

    it('handles task with skipped or failed status and missing durationMs', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown({
        ...baseReportData,
        tasks: [
          {
            id: 'task-3',
            title: 'Skipped secondary integration',
            tier: 'TIER-2',
            agent: 'superconductor-processor',
            status: 'skipped',
          },
          {
            id: 'task-4',
            title: 'Failing subagent step',
            tier: 'TIER-2',
            agent: 'superconductor-processor',
            status: 'failed',
            durationMs: 4200,
          },
        ],
      });

      expect(md).toContain('task-3');
      expect(md).toMatch(/skipped/i);
      expect(md).toContain('task-4');
      expect(md).toMatch(/failed/i);
      expect(md).toMatch(/4\.2s|4200ms/);
    });

    it('formats quorum review verdicts table when verdicts are provided', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown(baseReportData);

      expect(md).toContain('Quorum Review Verdicts');
      expect(md).toContain('correctness-reviewer');
      expect(md).toContain('security-reviewer');
      expect(md).toContain('RESOLVED');
    });

    it('formats quorum verdicts with NEEDS_FIXES and blocking counts', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown({
        ...baseReportData,
        quorumVerdicts: [
          {
            role: 'adversarial-reviewer',
            verdict: 'NEEDS_FIXES',
            findingsCount: 3,
            blockingCount: 2,
          },
        ],
      });

      expect(md).toContain('adversarial-reviewer');
      expect(md).toContain('NEEDS_FIXES');
      expect(md).toContain('3');
      expect(md).toContain('2');
    });

    it('handles omitted or empty quorum verdicts gracefully', () => {
      const reporter = new HeadlessReporter();
      const mdOmitted = reporter.formatMarkdown({
        ...baseReportData,
        quorumVerdicts: undefined,
      });
      expect(typeof mdOmitted).toBe('string');

      const mdEmpty = reporter.formatMarkdown({
        ...baseReportData,
        quorumVerdicts: [],
      });
      expect(typeof mdEmpty).toBe('string');
    });

    it('formats token metrics and cost summary', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown(baseReportData);

      expect(md).toContain('Token & Cost Metrics');
      expect(md).toContain('45,000');
      expect(md).toContain('8,500');
      expect(md).toContain('53,500'); // total tokens
      expect(md).toContain('$0.185');
      expect(md).toContain('78.5%');
    });

    it('handles omitted token metrics gracefully', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown({
        ...baseReportData,
        tokenMetrics: undefined,
      });

      expect(typeof md).toBe('string');
      expect(md).not.toContain('Token & Cost Metrics');
    });

    it('renders custom action items list', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown(baseReportData);

      expect(md).toContain('Action Items');
      expect(md).toContain('Track ready for merge into main branch');
      expect(md).toContain('Monitor post-deployment telemetry');
    });

    it('generates fallback action items when actionItems is empty or undefined', () => {
      const reporter = new HeadlessReporter();
      const mdSuccess = reporter.formatMarkdown({
        ...baseReportData,
        actionItems: undefined,
        status: 'SUCCESS',
      });
      expect(mdSuccess).toContain('Action Items');

      const mdFailed = reporter.formatMarkdown({
        ...baseReportData,
        actionItems: [],
        status: 'FAILED',
      });
      expect(mdFailed).toContain('Action Items');
      expect(mdFailed).toMatch(/fail|investigate|inspect/i);
    });

    it('handles durations under 1000ms formatting as milliseconds', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown({
        ...baseReportData,
        startTime: 1000,
        endTime: 1450, // 450ms total
        tasks: [
          {
            id: 'task-quick',
            title: 'Quick sub-second task',
            tier: 'TIER-1',
            agent: 'superconductor-setup',
            status: 'completed',
            durationMs: 450,
          },
        ],
      });

      expect(md).toContain('450ms');
    });

    it('handles invalid or zero startTime and endTime gracefully with N/A', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown({
        ...baseReportData,
        startTime: 0,
        endTime: Number.NaN,
      });

      expect(md).toContain('N/A — N/A');
    });

    it('handles unknown or unexpected status gracefully with fallback styling', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown({
        ...baseReportData,
        status: 'CUSTOM_STATUS' as any,
      });

      expect(md).toContain('CUSTOM_STATUS');
      expect(md).toContain('⚪');
    });

    it('formats pre-bulleted action items properly without duplicating bullet markers', () => {
      const reporter = new HeadlessReporter();
      const md = reporter.formatMarkdown({
        ...baseReportData,
        actionItems: [
          '- Bullet item with dash',
          '* Bullet item with asterisk',
          'Regular unbulleted item',
        ],
      });

      expect(md).toContain('- Bullet item with dash');
      expect(md).toContain('* Bullet item with asterisk');
      expect(md).toContain('- Regular unbulleted item');
    });

    it('generates fallback action items for all non-success statuses', () => {
      const reporter = new HeadlessReporter();

      const mdNeedsAttention = reporter.formatMarkdown({
        ...baseReportData,
        actionItems: undefined,
        status: 'NEEDS_ATTENTION',
      });
      expect(mdNeedsAttention).toContain('Quorum reviewers flagged open findings');

      const mdCircuitBroken = reporter.formatMarkdown({
        ...baseReportData,
        actionItems: undefined,
        status: 'CIRCUIT_BROKEN',
      });
      expect(mdCircuitBroken).toContain('Circuit breaker triggered');
    });

    it('also supports static formatMarkdown call', () => {
      const md = HeadlessReporter.formatMarkdown(baseReportData);
      expect(md).toContain('track_alpha_20261005');
    });
  });

  describe('writeReport', () => {
    it('writes timestamped report and latest HEADLESS_REPORT.md to output directory', async () => {
      const reporter = new HeadlessReporter();
      const result = await reporter.writeReport(baseReportData, tempDir);

      expect(result).toBeDefined();
      expect(result.reportPath).toMatch(/HEADLESS_REPORT_.*\.md$/);
      expect(result.latestPath).toMatch(/HEADLESS_REPORT\.md$/);

      // Verify files exist on disk
      expect(fs.existsSync(result.reportPath)).toBe(true);
      expect(fs.existsSync(result.latestPath)).toBe(true);

      const contentTimestamped = await fs.promises.readFile(result.reportPath, 'utf-8');
      const contentLatest = await fs.promises.readFile(result.latestPath, 'utf-8');

      expect(contentTimestamped).toBe(contentLatest);
      expect(contentTimestamped).toContain('# Morning Briefing: track_alpha_20261005');
      expect(contentTimestamped).toContain('| Task ID | Title | Tier | Agent | Status | Duration |');
    });

    it('creates nested output directory recursively if it does not exist', async () => {
      const reporter = new HeadlessReporter();
      const nestedDir = path.join(tempDir, 'sub', 'reports', 'dir');

      const result = await reporter.writeReport(baseReportData, nestedDir);

      expect(fs.existsSync(result.reportPath)).toBe(true);
      expect(fs.existsSync(result.latestPath)).toBe(true);
    });

    it('defaults to process.cwd() when outputDir is omitted', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
      try {
        const reporter = new HeadlessReporter();
        const result = await reporter.writeReport(baseReportData);

        expect(result.reportPath.startsWith(tempDir)).toBe(true);
        expect(fs.existsSync(result.reportPath)).toBe(true);
        expect(fs.existsSync(result.latestPath)).toBe(true);
      } finally {
        cwdSpy.mockRestore();
      }
    });

    it('also supports static writeReport call', async () => {
      const result = await HeadlessReporter.writeReport(baseReportData, tempDir);

      expect(fs.existsSync(result.reportPath)).toBe(true);
      expect(fs.existsSync(result.latestPath)).toBe(true);
    });
  });
});
