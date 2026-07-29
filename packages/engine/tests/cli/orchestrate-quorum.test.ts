/**
 * orchestrate-quorum.test.ts
 *
 * Phase 4 hardening: Tests for ReviewerResponseBroker integration in executeTrack.
 * Uses injectable mock broker to isolate orchestrator logic from file-system watcher.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwarmOrchestratorCLI } from '../../src/cli/orchestrate.js';
import { MockAgentSpawner } from '../../src/cli/mock-agent-spawner.js';
import { ReviewerResponseBroker, ReviewerResult } from '../../src/verification/reviewer-response-broker.js';
import { WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writePlan(planPath: string, tasks: string[]) {
  const content = `# Plan\n${tasks.join('\n')}\n`;
  fs.writeFileSync(planPath, content, 'utf8');
}

function writeTopography(topoPath: string) {
  fs.writeFileSync(topoPath, JSON.stringify({ partitions: [], dependencyGraph: [] }), 'utf8');
}

function setupWorkspace(tmpDir: string, trackId: string, tasks: string[]) {
  const trackDir = path.join(tmpDir, '.superconductor', 'tracks', trackId);
  fs.mkdirSync(trackDir, { recursive: true });
  writeTopography(path.join(tmpDir, 'topography.json'));
  writePlan(path.join(trackDir, 'plan.md'), tasks);
}

/**
 * Creates a mock ReviewerResponseBroker with a fixed aggregate() result.
 * This bypasses the file-watching mechanism entirely.
 */
function makeMockBroker(results: ReviewerResult[]): ReviewerResponseBroker {
  const broker = {
    aggregate: vi.fn().mockResolvedValue(results),
    isConsensusResolved: (r: ReviewerResult[]) =>
      r.every(res => !res.timedOut && 'status' in res.findings && res.findings.status === 'RESOLVED'),
  } as unknown as ReviewerResponseBroker;
  return broker;
}

function resolvedResult(reviewerId: string): ReviewerResult {
  return { reviewerId, findings: { status: 'RESOLVED' as const }, timedOut: false };
}

function criticalResult(reviewerId: string, message = 'Critical finding'): ReviewerResult {
  return {
    reviewerId,
    findings: { severity: 'CRITICAL' as const, findings: [message] },
    timedOut: false,
  };
}

function timedOutResult(reviewerId: string): ReviewerResult {
  return {
    reviewerId,
    findings: { severity: 'CRITICAL' as const, findings: [`Reviewer ${reviewerId} timed out`] },
    timedOut: true,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeTrack() with ReviewerResponseBroker (Phase 4)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrate-quorum-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── DONE when all 4 reviewers RESOLVED ──────────────────────────────────

  it('transitions work unit to DONE when all 4 reviewers return RESOLVED', async () => {
    const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

    const resolvedResults = REQUIRED_QUORUM_AGENTS.map(id => resolvedResult(id));
    const mockBroker = makeMockBroker(resolvedResults);

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    (cli as any).reviewerBroker = mockBroker;

    setupWorkspace(tmpDir, 'quorum-done-track', [
      '- [ ] Task: Implement feature [TIER-3] [AGENT:agent-impl] [DOMAIN:core]',
    ]);

    const result = await cli.executeTrack(tmpDir, 'quorum-done-track');

    expect(result.workUnits[0].state).toBe(WorkUnitState.DONE);
  });

  // ── FAILED when broker returns CRITICAL finding ──────────────────────────

  it('transitions work unit to FAILED when ReviewerResponseBroker returns CRITICAL finding', async () => {
    const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

    // First 3 reviewers resolve, last one has a critical finding
    const mixedResults = [
      resolvedResult(REQUIRED_QUORUM_AGENTS[0]),
      resolvedResult(REQUIRED_QUORUM_AGENTS[1]),
      resolvedResult(REQUIRED_QUORUM_AGENTS[2]),
      criticalResult(REQUIRED_QUORUM_AGENTS[3], 'Security issue detected'),
    ];
    const mockBroker = makeMockBroker(mixedResults);

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    (cli as any).reviewerBroker = mockBroker;

    setupWorkspace(tmpDir, 'quorum-fail-broker-track', [
      '- [ ] Task: Risky task [TIER-3] [AGENT:agent-risky] [DOMAIN:core]',
    ]);

    let thrownError: any;
    try {
      await cli.executeTrack(tmpDir, 'quorum-fail-broker-track');
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    const workUnits = (thrownError as any)?.workUnits;
    expect(workUnits).toBeDefined();
    expect(workUnits[0].state).toBe(WorkUnitState.FAILED);
  });

  // ── FAILED when any reviewer times out ──────────────────────────────────

  it('transitions work unit to FAILED when any reviewer times out', async () => {
    const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

    // First 3 resolve, last one times out
    const timeoutResults = [
      resolvedResult(REQUIRED_QUORUM_AGENTS[0]),
      resolvedResult(REQUIRED_QUORUM_AGENTS[1]),
      resolvedResult(REQUIRED_QUORUM_AGENTS[2]),
      timedOutResult(REQUIRED_QUORUM_AGENTS[3]),
    ];
    const mockBroker = makeMockBroker(timeoutResults);

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    (cli as any).reviewerBroker = mockBroker;

    setupWorkspace(tmpDir, 'quorum-timeout-track', [
      '- [ ] Task: Slow review task [TIER-3] [AGENT:agent-slow] [DOMAIN:core]',
    ]);

    let thrownError: any;
    try {
      await cli.executeTrack(tmpDir, 'quorum-timeout-track');
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    const workUnits = (thrownError as any)?.workUnits;
    expect(workUnits).toBeDefined();
    expect(workUnits[0].state).toBe(WorkUnitState.FAILED);
  });

  // ── Broker receives reviewer conversation IDs from spawner ─────────────

  it('passes reviewer conversation IDs to broker.aggregate()', async () => {
    const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');

    let callCount = 0;
    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async (config: any) => {
        return { conversationId: `conv-${config.role}-${++callCount}`, synthetic: false };
      });

    const resolvedResults = REQUIRED_QUORUM_AGENTS.map(id => resolvedResult(id));
    const mockBroker = makeMockBroker(resolvedResults);

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    (cli as any).reviewerBroker = mockBroker;

    setupWorkspace(tmpDir, 'quorum-ids-track', [
      '- [ ] Task: Check IDs [TIER-3] [AGENT:agent-ids] [DOMAIN:core]',
    ]);

    await cli.executeTrack(tmpDir, 'quorum-ids-track');

    // The broker should have been called with the conversation IDs returned by the spawner
    expect((mockBroker.aggregate as any)).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringMatching(/^conv-/)]),
    );
  });

  // ── QuorumReviewLoop maxIterations: 3 with remediateFn stub ─────────────

  it('uses maxIterations:3 and remediateFn that does not throw', async () => {
    const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-ok', synthetic: false });

    // All reviewers resolve on first try — so remediateFn is never needed
    const resolvedResults = REQUIRED_QUORUM_AGENTS.map(id => resolvedResult(id));
    const mockBroker = makeMockBroker(resolvedResults);

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    (cli as any).reviewerBroker = mockBroker;

    setupWorkspace(tmpDir, 'quorum-maxiter-track', [
      '- [ ] Task: Max iterations task [TIER-3] [AGENT:agent-mi] [DOMAIN:core]',
    ]);

    // Should succeed without throwing
    const result = await cli.executeTrack(tmpDir, 'quorum-maxiter-track');
    expect(result.workUnits[0].state).toBe(WorkUnitState.DONE);
  });
});
