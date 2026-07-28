import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { SwarmOrchestratorCLI, IAgentSpawner } from '../../src/cli/orchestrate.js';
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
        const mockSpawner: IAgentSpawner = {
            invokeSubagent: vi.fn().mockResolvedValue('conv-mock-123')
        };

        const cli = new SwarmOrchestratorCLI(mockSpawner);

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
        expect(mockSpawner.invokeSubagent).toHaveBeenCalledTimes(2 * (1 + REQUIRED_QUORUM_AGENTS.length));
        expect(mockSpawner.invokeSubagent).toHaveBeenCalledWith('agent-ui', expect.any(String));
        expect(mockSpawner.invokeSubagent).toHaveBeenCalledWith('agent-api', expect.any(String));
    });

    it('should persist implementor-result.json for each completed work unit', async () => {
        // Arrange
        let callCount = 0;
        const mockSpawner: IAgentSpawner = {
            invokeSubagent: vi.fn().mockImplementation(async (role: string) => {
                return `conv-${role}-${++callCount}`;
            })
        };

        const cli = new SwarmOrchestratorCLI(mockSpawner);

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
        const mockSpawner: IAgentSpawner = {
            // Use mockResolvedValue (not Once) so all spawner calls return a valid string.
            // The first 2 calls are implementor invocations (tracked in agents.json);
            // subsequent calls are quorum reviewer invocations (not tracked in agents.json).
            invokeSubagent: vi.fn()
                .mockResolvedValueOnce('conv-first-agent')
                .mockResolvedValueOnce('conv-second-agent')
                .mockResolvedValue('conv-reviewer-ok')
        };

        const cli = new SwarmOrchestratorCLI(mockSpawner);

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
        const mockSpawner: IAgentSpawner = {
            invokeSubagent: vi.fn().mockResolvedValue('conv-event-test')
        };

        const cli = new SwarmOrchestratorCLI(mockSpawner);
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

    it('should fall back to ParallelDispatcher when no spawner is provided', async () => {
        // Arrange: no spawner
        const cli = new SwarmOrchestratorCLI();

        const trackId = 'fallback-track';
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', trackId);
        fs.mkdirSync(trackDir, { recursive: true });

        const topographyPath = path.join(tmpDir, 'topography.json');
        writeTopography(topographyPath, [{ id: 'fallback-domain' }]);

        const planPath = path.join(trackDir, 'plan.md');
        writePlan(planPath, [
            '- [ ] Task: Fallback task [TIER-3] [AGENT:agent-fallback] [DOMAIN:fallback-domain]'
        ]);

        // Act
        const result = await cli.executeTrack(tmpDir, trackId);

        // Assert: no crash, work unit completes
        expect(result.workUnits).toHaveLength(1);
        // When ParallelDispatcher is used, state should be DONE (auto-approved, no reviewers)
        expect(result.workUnits[0].state).toBe(WorkUnitState.DONE);
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
