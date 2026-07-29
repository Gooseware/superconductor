import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { SwarmOrchestratorCLI } from '../../src/cli/orchestrate.js';
import { MockAgentSpawner } from '../../src/cli/mock-agent-spawner.js';
import { WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import { ReviewerResponseBroker } from '../../src/verification/reviewer-response-broker.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Helpers
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

function writePlan(planPath: string, tasks: string[]) {
    const content = `# Plan\n${tasks.join('\n')}\n`;
    fs.writeFileSync(planPath, content, 'utf8');
}

function writeTopography(topoPath: string, partitions: Array<{ id: string; reviewers?: string[] }>) {
    fs.writeFileSync(topoPath, JSON.stringify({
        partitions: partitions.map(p => ({
            id: p.id,
            files: [],
            hotspotScore: 1,
            coverageGap: 0,
            reviewers: p.reviewers ?? []
        })),
        dependencyGraph: []
    }), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SwarmOrchestratorCLI with IAgentSpawner', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrate-test-'));
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should call IAgentSpawner.invokeSubagent for each work unit', async () => {
        // Arrange
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-mock-123', synthetic: false });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        // Phase 4: inject resolved broker to avoid file-watch blocking in tests.
        cli.reviewerBroker = makeResolvedBroker();

        const trackId = 'test-track';
        const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', safeTrackId);
        fs.mkdirSync(trackDir, { recursive: true });

        const topographyPath = path.join(tmpDir, 'topography.json');
        writeTopography(topographyPath, [
            { id: 'frontend' },
            { id: 'backend' }
        ]);

        const planPath = path.join(trackDir, 'plan.md');
        writePlan(planPath, [
            '- [ ] Task: Update the login page [TIER-3] [AGENT:agent-ui] [DOMAIN:frontend]',
            '- [ ] Task: Add login endpoint [TIER-3] [AGENT:agent-api] [DOMAIN:backend]'
        ]);

        // Act
        const result = await cli.executeTrack(tmpDir, trackId);

        // Assert: spawner was called for each work unit (implementor) AND for each of the
        // 4 required quorum reviewers per work unit.
        // 2 work units × (1 implementor + 4 quorum reviewers) = 10 total calls.
        const { REQUIRED_QUORUM_AGENTS } = await import('../../src/verification/quorum-enforcer.js');
        expect(mockSpawner.spawn).toHaveBeenCalledTimes(2 * (1 + REQUIRED_QUORUM_AGENTS.length));
        expect(mockSpawner.spawn).toHaveBeenCalledWith(expect.objectContaining({ role: 'agent-ui' }));
        expect(mockSpawner.spawn).toHaveBeenCalledWith(expect.objectContaining({ role: 'agent-api' }));
    });

    it('should persist implementor-result.json for each completed work unit', async () => {
        // Arrange
        let callCount = 0;
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async (config: import('../../src/cli/agent-spawner.js').AgentSpawnConfig) => {

                return { conversationId: `conv-${config.role}-${++callCount}`, synthetic: false };
            });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        // Phase 4: inject resolved broker to avoid file-watch blocking in tests.
        cli.reviewerBroker = makeResolvedBroker();

        const trackId = 'persist-track';
        const safeTrackId = trackId;
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', safeTrackId);
        fs.mkdirSync(trackDir, { recursive: true });

        const topographyPath = path.join(tmpDir, 'topography.json');
        writeTopography(topographyPath, [{ id: 'core' }]);

        const planPath = path.join(trackDir, 'plan.md');
        writePlan(planPath, [
            '- [ ] Task: Implement feature A [TIER-3] [AGENT:agent-a] [DOMAIN:core]'
        ]);

        // Act
        await cli.executeTrack(tmpDir, trackId);

        // Assert: implementor-result.json was written
        const resultPath = path.join(tmpDir, '.superconductor', 'quorum', 'wu-1', 'implementor-result.json');
        expect(fs.existsSync(resultPath)).toBe(true);

        const record = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        expect(record.wuId).toBe('wu-1');
        expect(record.role).toBe('agent-a');
        expect(record.conversationId).toMatch(/^conv-agent-a-/);
        expect(record.completedAt).toBeTruthy();
    });

    it('should update agents.json manifest with conversationId for each spawned agent', async () => {
        // Arrange
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn')
            .mockResolvedValueOnce({ conversationId: 'conv-first-agent', synthetic: false })
            .mockResolvedValueOnce({ conversationId: 'conv-second-agent', synthetic: false })
            .mockResolvedValue({ conversationId: 'conv-reviewer-ok', synthetic: false });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        // Phase 4: inject resolved broker to avoid file-watch blocking in tests.
        cli.reviewerBroker = makeResolvedBroker();

        const trackId = 'manifest-track';
        const safeTrackId = trackId;
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', safeTrackId);
        fs.mkdirSync(trackDir, { recursive: true });

        const topographyPath = path.join(tmpDir, 'topography.json');
        writeTopography(topographyPath, [
            { id: 'svc-a' },
            { id: 'svc-b' }
        ]);

        const planPath = path.join(trackDir, 'plan.md');
        writePlan(planPath, [
            '- [ ] Task: Build service A [TIER-3] [AGENT:agent-svc-a] [DOMAIN:svc-a]',
            '- [ ] Task: Build service B [TIER-3] [AGENT:agent-svc-b] [DOMAIN:svc-b]'
        ]);

        // Act
        await cli.executeTrack(tmpDir, trackId);

        // Assert: agents.json manifest contains both entries
        const manifestPath = path.join(tmpDir, '.superconductor', 'tracks', safeTrackId, 'agents.json');
        expect(fs.existsSync(manifestPath)).toBe(true);

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        expect(manifest).toHaveLength(2);

        const convIds = manifest.map((e: any) => e.conversationId);
        expect(convIds).toContain('conv-first-agent');
        expect(convIds).toContain('conv-second-agent');

        const wuIds = manifest.map((e: any) => e.wuId);
        expect(wuIds).toContain('wu-1');
        expect(wuIds).toContain('wu-2');
    });

    it('should emit subagent_spawned event with conversationId when spawner is provided', async () => {
        // Arrange
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-event-test', synthetic: false });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        // Phase 4: inject resolved broker to avoid file-watch blocking in tests.
        cli.reviewerBroker = makeResolvedBroker();
        const spawnedEvents: any[] = [];
        cli.on('subagent_spawned', (evt) => spawnedEvents.push(evt));

        const trackId = 'event-track';
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', trackId);
        fs.mkdirSync(trackDir, { recursive: true });

        const topographyPath = path.join(tmpDir, 'topography.json');
        writeTopography(topographyPath, [{ id: 'dom' }]);

        const planPath = path.join(trackDir, 'plan.md');
        writePlan(planPath, [
            '- [ ] Task: Test event [TIER-3] [AGENT:agent-ev] [DOMAIN:dom]'
        ]);

        // Act
        await cli.executeTrack(tmpDir, trackId);

        // Assert
        expect(spawnedEvents).toHaveLength(1);
        expect(spawnedEvents[0].conversationId).toBe('conv-event-test');
        expect(spawnedEvents[0].wuId).toBe('wu-1');
        expect(spawnedEvents[0].role).toBe('agent-ev');
    });


    it('should still parse and dispatch correctly (backward compat with existing test)', async () => {
        // Existing parseAndDispatch test migrated here for CLI sub-directory
        const topographyPath = path.join(tmpDir, 'topography.json');
        writeTopography(topographyPath, [
            { id: 'frontend' },
            { id: 'backend' }
        ]);

        const planPath = path.join(tmpDir, 'plan.md');
        writePlan(planPath, [
            '- [ ] Task: Update the login page [TIER-3] [AGENT:agent-ui] [DOMAIN:frontend]',
            '- [ ] Task: Add login endpoint [TIER-3] [AGENT:agent-api] [DOMAIN:backend]'
        ]);

        const cli = new SwarmOrchestratorCLI();
        const workUnits = await cli.parseAndDispatch(topographyPath, planPath);

        expect(workUnits).toHaveLength(2);
        expect(workUnits[0].domainScope).toContain('frontend');
        expect(workUnits[0].implementorId).toBe('agent-ui');
        expect(workUnits[0].state).toBe(WorkUnitState.PENDING);
        expect(cli.wasLLMUsed()).toBe(false);
    });

});
