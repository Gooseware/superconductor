import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwarmOrchestratorCLI } from '../../src/cli/orchestrate.js';
import { MockAgentSpawner } from '../../src/cli/mock-agent-spawner.js';
import { WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import * as HeadlessModeGuardModule from '../../src/guard/headless-mode-guard.js';
import { NonInteractiveModeError } from '../../src/guard/execution-mode.js';
import { ReviewerResponseBroker } from '../../src/verification/reviewer-response-broker.js';
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
  fs.writeFileSync(topoPath, JSON.stringify({
    partitions: [{ id: 'core', files: [], hotspotScore: 1, coverageGap: 0, reviewers: [] }],
    dependencyGraph: []
  }), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function makeResolvedBroker(): ReviewerResponseBroker {
  return {
    aggregate: vi.fn().mockResolvedValue([
      { reviewerId: 'r1', findings: { status: 'RESOLVED' }, timedOut: false },
      { reviewerId: 'r2', findings: { status: 'RESOLVED' }, timedOut: false },
      { reviewerId: 'r3', findings: { status: 'RESOLVED' }, timedOut: false },
      { reviewerId: 'r4', findings: { status: 'RESOLVED' }, timedOut: false },
    ]),
    isConsensusResolved: () => true,
  } as unknown as ReviewerResponseBroker;
}

describe('executeTrack VERIFY routing', () => {
  let tmpDir: string;
  let originalCI: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrate-verify-'));
    originalCI = process.env.CI;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCI;
    }
    vi.restoreAllMocks();
  });

  function setupTrack(trackId: string, planLines: string[]) {
    const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const trackDir = path.join(tmpDir, '.superconductor', 'tracks', safeTrackId);
    fs.mkdirSync(trackDir, { recursive: true });
    writeTopography(path.join(tmpDir, 'topography.json'));
    writePlan(path.join(trackDir, 'plan.md'), planLines);
    return safeTrackId;
  }

  it('VERIFY unit with ExecutionMode.HEADLESS transitions to DONE without spawning any subagent', async () => {
    // Force headless via CI env
    process.env.CI = 'true';

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-never-called', synthetic: false });

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    setupTrack('verify-headless', [
      '- [ ] Task: Superconductor - User Manual Verification [AGENT:verify-agent] [DOMAIN:core]'
    ]);

    const result = await cli.executeTrack(tmpDir, 'verify-headless');

    // Spawner should NOT have been called for VERIFY units in HEADLESS mode
    expect(mockSpawner.spawn).not.toHaveBeenCalled();
    expect(result.workUnits).toHaveLength(1);
    expect(result.workUnits[0].state).toBe(WorkUnitState.DONE);
  });

  it('VERIFY unit with ExecutionMode.HEADLESS writes a VERIFIED_HEADLESS consensus to QuorumStore', async () => {
    process.env.CI = 'true';

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-never', synthetic: false });

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    setupTrack('verify-consensus', [
      '- [ ] Task: Superconductor - User Manual Verification [AGENT:verify-agent] [DOMAIN:core]'
    ]);

    await cli.executeTrack(tmpDir, 'verify-consensus');

    // Check the consensus file was written with VERIFIED_HEADLESS status
    const consensusPath = path.join(tmpDir, '.superconductor', 'quorum', 'wu-1', 'consensus.json');
    expect(fs.existsSync(consensusPath)).toBe(true);

    const consensus = JSON.parse(fs.readFileSync(consensusPath, 'utf8'));
    expect(consensus.status).toBe('VERIFIED_HEADLESS');
    expect(consensus.autoApproved).toBe(true);
    expect(typeof consensus.timestamp).toBe('number');
  });

  it('VERIFY unit with ExecutionMode.INTERACTIVE emits verification_required event (not auto-approved)', async () => {
    // No CI env = INTERACTIVE mode
    delete process.env.CI;

    const emittedEvents: any[] = [];
    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-reviewer', synthetic: false });

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    cli.on('verification_required', (evt) => emittedEvents.push(evt));

    setupTrack('verify-interactive', [
      '- [ ] Task: Superconductor - User Manual Verification [AGENT:verify-agent] [DOMAIN:core]'
    ]);

    // In INTERACTIVE mode, executeTrack emits the event and still completes
    // (it should not auto-approve — the event handler is responsible)
    // We don't throw here, the event is emitted
    await cli.executeTrack(tmpDir, 'verify-interactive');

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0].wuId).toBe('wu-1');
    // Should NOT be auto-approved
    expect(emittedEvents[0].autoApproved).toBe(false);
  });

  it('TASK unit is not affected by the VERIFY routing logic', async () => {
    process.env.CI = 'true';

    let spawnerCalls: string[] = [];
    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async (config: import('../../src/cli/agent-spawner.js').AgentSpawnConfig) => {

        spawnerCalls.push(config.role);
        return { conversationId: `conv-${config.role}`, synthetic: false };
      });

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    // Phase 4: inject resolved broker to avoid file-watch blocking in tests.
    cli.reviewerBroker = makeResolvedBroker();
    setupTrack('task-unit', [
      '- [ ] Task: Implement feature X [AGENT:agent-x] [DOMAIN:core]'
    ]);

    const result = await cli.executeTrack(tmpDir, 'task-unit');

    // TASK units in HEADLESS mode should go through the normal spawner path
    expect(spawnerCalls).toContain('agent-x');
    expect(result.workUnits[0].unitType).toBe('TASK');
    expect(result.workUnits[0].state).toBe(WorkUnitState.DONE);
  });

  // ── REV-2: INTERACTIVE mode must NOT fall through to subagent dispatch ──────

  it('REV-2: VERIFY unit in INTERACTIVE mode does NOT spawn any processor subagent', async () => {
    // No CI env = INTERACTIVE mode
    delete process.env.CI;

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-should-never-be-used', synthetic: false });

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    setupTrack('verify-interactive-no-spawn', [
      '- [ ] Task: Superconductor - User Manual Verification [AGENT:verify-agent] [DOMAIN:core]'
    ]);

    await cli.executeTrack(tmpDir, 'verify-interactive-no-spawn');

    // The spawner MUST NOT have been called — VERIFY in INTERACTIVE mode exits
    // the loop iteration after emitting verification_required (REV-2 fix).
    expect(mockSpawner.spawn).not.toHaveBeenCalled();
  });

  it('REV-2: VERIFY unit in INTERACTIVE mode does NOT write a VERIFIED_HEADLESS consensus', async () => {
    // No CI env = INTERACTIVE mode
    delete process.env.CI;

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-should-never-be-used', synthetic: false });

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    setupTrack('verify-interactive-no-consensus', [
      '- [ ] Task: Superconductor - User Manual Verification [AGENT:verify-agent] [DOMAIN:core]'
    ]);

    await cli.executeTrack(tmpDir, 'verify-interactive-no-consensus');

    // The VERIFIED_HEADLESS consensus file must NOT exist — only HEADLESS mode
    // writes it. INTERACTIVE mode must wait for user confirmation.
    const consensusPath = path.join(
      tmpDir, '.superconductor', 'quorum', 'wu-1', 'consensus.json'
    );
    expect(fs.existsSync(consensusPath)).toBe(false);
  });

  // ── ADV-1: HeadlessModeGuard is wired into VERIFY unit processing ──────────

  it('ADV-1: assertInteractiveAllowed is called during HEADLESS VERIFY — guard throws NonInteractiveModeError which is caught and auto-approval proceeds', async () => {
    process.env.CI = 'true';

    const assertSpy = vi.spyOn(HeadlessModeGuardModule.HeadlessModeGuard.prototype, 'assertInteractiveAllowed');

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-never', synthetic: false });

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    setupTrack('verify-guard-headless', [
      '- [ ] Task: Superconductor - User Manual Verification [AGENT:verify-agent] [DOMAIN:core]'
    ]);

    const result = await cli.executeTrack(tmpDir, 'verify-guard-headless');

    // Guard must have been called
    expect(assertSpy).toHaveBeenCalledWith('Manual Verification checkpoint', false);
    // Auto-approval proceeds — unit is DONE
    expect(result.workUnits[0].state).toBe(WorkUnitState.DONE);
  });

  it('ADV-1: assertInteractiveAllowed is called during INTERACTIVE VERIFY — guard passes through and verification_required is emitted', async () => {
    delete process.env.CI;

    const assertSpy = vi.spyOn(HeadlessModeGuardModule.HeadlessModeGuard.prototype, 'assertInteractiveAllowed');
    const emittedEvents: any[] = [];

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-reviewer', synthetic: false });

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    cli.on('verification_required', (evt) => emittedEvents.push(evt));

    setupTrack('verify-guard-interactive', [
      '- [ ] Task: Superconductor - User Manual Verification [AGENT:verify-agent] [DOMAIN:core]'
    ]);

    await cli.executeTrack(tmpDir, 'verify-guard-interactive');

    // Guard must have been called in INTERACTIVE mode too
    expect(assertSpy).toHaveBeenCalledWith('Manual Verification checkpoint', false);
    // Event still emitted
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0].autoApproved).toBe(false);
  });

  // ── ADV-3: QuorumStore.writeConsensus throws during HEADLESS VERIFY auto-approval ──

  it('ADV-3: QuorumStore.writeConsensus throwing during HEADLESS VERIFY — error is caught, emits orchestration_error, unit is FAILED, and executeTrack throws AggregateError', async () => {
    process.env.CI = 'true';

    const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-never', synthetic: false });

    const cli = new SwarmOrchestratorCLI(mockSpawner);
    setupTrack('verify-writeconsensus-fail', [
      '- [ ] Task: Superconductor - User Manual Verification [AGENT:verify-agent] [DOMAIN:core]'
    ]);

    // Inject a failing quorumStore mock
    const diskFullError = new Error('disk full');
    const failingQuorumStore = {
      writeConsensus: vi.fn().mockRejectedValue(diskFullError),
      readConsensus: vi.fn(),
      writeResult: vi.fn(),
      appendToAgentsManifest: vi.fn(),
    };
    (cli as any).quorumStore = failingQuorumStore;

    const orchestrationErrors: any[] = [];
    cli.on('orchestration_error', (evt) => orchestrationErrors.push(evt));

    // executeTrack must throw AggregateError — failure is bubbled up
    let thrownErr: any;
    try {
      await cli.executeTrack(tmpDir, 'verify-writeconsensus-fail');
    } catch (e) {
      thrownErr = e;
    }

    expect(thrownErr).toBeInstanceOf(AggregateError);

    // orchestration_error emitted with the disk full error
    expect(orchestrationErrors).toHaveLength(1);
    expect(orchestrationErrors[0].error.message).toBe('disk full');

    // Unit must NOT be transitioned to DONE — it should be FAILED
    expect(thrownErr.workUnits[0].state).toBe(WorkUnitState.FAILED);
  });
});
