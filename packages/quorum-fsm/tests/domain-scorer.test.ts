import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { scoreDomains, DomainScore } from '../../../scripts/domain-scorer.js';
import { orchestrateCopdebaseReview, orchestrateCodebaseReview } from '../../../scripts/codebase-review-orchestrator.js';

describe('domain-scorer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-scorer-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty array when intelligenceDir is empty or has no domain data', async () => {
    const scores = await scoreDomains(tmpDir);
    expect(scores).toEqual([]);
  });

  it('should compute priority score = 0.4*Hotspot + 0.35*FanIn + 0.25*GitChurn and sort descending', async () => {
    const domainData = [
      {
        domain: 'domain-low',
        files: ['a.ts'],
        hotspot_score: 10,
        fan_in: 5,
        git_churn_90d: 2,
      },
      {
        domain: 'domain-high',
        files: ['b.ts', 'c.ts'],
        hotspot_score: 100,
        fan_in: 50,
        git_churn_90d: 20,
      },
    ];

    fs.writeFileSync(path.join(tmpDir, 'domain_data.json'), JSON.stringify(domainData));

    const scores = await scoreDomains(tmpDir);
    expect(scores).toHaveLength(2);

    // domain-high priority_score: 0.4*100 + 0.35*50 + 0.25*20 = 40 + 17.5 + 5 = 62.5
    expect(scores[0].domain).toBe('domain-high');
    expect(scores[0].priority_score).toBeCloseTo(62.5);

    // domain-low priority_score: 0.4*10 + 0.35*5 + 0.25*2 = 4 + 1.75 + 0.5 = 6.25
    expect(scores[1].domain).toBe('domain-low');
    expect(scores[1].priority_score).toBeCloseTo(6.25);
  });

  it('should handle boundary N=0 and zero values correctly', async () => {
    const domainData = [
      {
        domain: 'domain-zero',
        files: [],
        hotspot_score: 0,
        fan_in: 0,
        git_churn_90d: 0,
      },
    ];
    fs.writeFileSync(path.join(tmpDir, 'domain_data.json'), JSON.stringify(domainData));

    const scores = await scoreDomains(tmpDir);
    expect(scores).toHaveLength(1);
    expect(scores[0].priority_score).toBe(0);
  });

  it('should orchestrate sequential codebase review starting with highest priority domain', async () => {
    const mockDomains: DomainScore[] = [
      { domain: 'dom-top', files: ['top.ts'], hotspot_score: 100, fan_in: 50, git_churn_90d: 20, priority_score: 62.5 },
      { domain: 'dom-next', files: ['next.ts'], hotspot_score: 10, fan_in: 5, git_churn_90d: 2, priority_score: 6.25 },
    ];

    const scoreDomainsFn = vi.fn().mockResolvedValue(mockDomains);
    const runQuorumFn = vi.fn().mockResolvedValue(undefined);

    await orchestrateCodebaseReview({
      intelligenceDir: tmpDir,
      noSignoff: true,
      scoreDomainsFn,
      runQuorumFn,
    });

    expect(runQuorumFn).toHaveBeenNthCalledWith(1, ['--branch', 'dom-top', '--no-signoff']);
    expect(runQuorumFn).toHaveBeenNthCalledWith(2, ['--branch', 'dom-next', '--no-signoff']);

    // Check typo alias works identically
    expect(orchestrateCopdebaseReview).toBe(orchestrateCodebaseReview);
  });
});
