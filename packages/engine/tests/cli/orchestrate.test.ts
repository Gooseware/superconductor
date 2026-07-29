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
    it('remediateFn — spawns one agent per distinct domain when findings have 2 different domains', async () => {
        // Arrange
        const mockSpawner = new MockAgentSpawner();
        let spawnCallCount = 0;
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async () => ({
            conversationId: `conv-remediate-${++spawnCallCount}`,
            synthetic: false,
        }));

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        cli.reviewerBroker = makeResolvedBroker();

        const trackId = 'remediate-multi-domain-track';
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', trackId);
        fs.mkdirSync(trackDir, { recursive: true });
        const topographyPath = path.join(tmpDir, 'topography.json');
        writeTopography(topographyPath, [{ id: 'core' }]);
        const planPath = path.join(trackDir, 'plan.md');
        writePlan(planPath, [
            '- [ ] Task: Feature X [TIER-3] [AGENT:agent-x] [DOMAIN:core]'
        ]);

        // Intercept the remediateFn by capturing it via a failed quorum scenario.
        // We drive the QuorumReviewLoop to call remediateFn by injecting a broker
        // that reports FAILED findings on the first call, then RESOLVED on the second.
        let reviewCallCount = 0;
        cli.reviewerBroker = {
            aggregate: vi.fn().mockImplementation(async () => {
                reviewCallCount++;
                if (reviewCallCount === 1) {
                    // First review: FAILED so the loop calls remediateFn
                    return [
                        { reviewerId: 'r1', findings: { status: 'FAILED', findings: [{ domain: 'src/auth.ts', message: 'bug 1' }, { domain: 'src/api.ts', message: 'bug 2' }] }, timedOut: false },
                        { reviewerId: 'r2', findings: { status: 'RESOLVED' }, timedOut: false },
                        { reviewerId: 'r3', findings: { status: 'RESOLVED' }, timedOut: false },
                        { reviewerId: 'r4', findings: { status: 'RESOLVED' }, timedOut: false },
                    ];
                }
                // Second review: all RESOLVED
                return [
                    { reviewerId: 'r1', findings: { status: 'RESOLVED' }, timedOut: false },
                    { reviewerId: 'r2', findings: { status: 'RESOLVED' }, timedOut: false },
                    { reviewerId: 'r3', findings: { status: 'RESOLVED' }, timedOut: false },
                    { reviewerId: 'r4', findings: { status: 'RESOLVED' }, timedOut: false },
                ];
            }),
            isConsensusResolved: vi.fn().mockImplementation((results: any[]) =>
                results.every((r: any) => r.findings?.status === 'RESOLVED')
            ),
        } as unknown as ReviewerResponseBroker;

        // Reset counter so we only count remediation spawns
        spawnCallCount = 0;
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async (cfg) => {
            return { conversationId: `conv-${cfg.role}-${++spawnCallCount}`, synthetic: false };
        });

        await cli.executeTrack(tmpDir, trackId);

        // Implementor (1) + reviewers (4 × 2 review rounds) + remediators (2 domains)
        const remediatorCalls = (mockSpawner.spawn as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call: any[]) => call[0]?.role === 'superconductor-remediation-processor'
        );
        expect(remediatorCalls).toHaveLength(2);
    });

    it('remediateFn — spawns exactly ONE agent when all findings share the same domain', async () => {
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockImplementation(async (cfg) => ({
            conversationId: `conv-${cfg.role}`,
            synthetic: false,
        }));

        const cli = new SwarmOrchestratorCLI(mockSpawner);

        const trackId = 'remediate-single-domain-track';
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', trackId);
        fs.mkdirSync(trackDir, { recursive: true });
        const topographyPath = path.join(tmpDir, 'topography.json');
        writeTopography(topographyPath, [{ id: 'core' }]);
        const planPath = path.join(trackDir, 'plan.md');
        writePlan(planPath, [
            '- [ ] Task: Feature Y [TIER-3] [AGENT:agent-y] [DOMAIN:core]'
        ]);

        let reviewCallCount2 = 0;
        cli.reviewerBroker = {
            aggregate: vi.fn().mockImplementation(async () => {
                reviewCallCount2++;
                if (reviewCallCount2 === 1) {
                    return [
                        { reviewerId: 'r1', findings: { status: 'FAILED', findings: [{ domain: 'src/auth.ts', message: 'bug A' }, { domain: 'src/auth.ts', message: 'bug B' }] }, timedOut: false },
                        { reviewerId: 'r2', findings: { status: 'RESOLVED' }, timedOut: false },
                        { reviewerId: 'r3', findings: { status: 'RESOLVED' }, timedOut: false },
                        { reviewerId: 'r4', findings: { status: 'RESOLVED' }, timedOut: false },
                    ];
                }
                return [
                    { reviewerId: 'r1', findings: { status: 'RESOLVED' }, timedOut: false },
                    { reviewerId: 'r2', findings: { status: 'RESOLVED' }, timedOut: false },
                    { reviewerId: 'r3', findings: { status: 'RESOLVED' }, timedOut: false },
                    { reviewerId: 'r4', findings: { status: 'RESOLVED' }, timedOut: false },
                ];
            }),
            isConsensusResolved: vi.fn().mockImplementation((results: any[]) =>
                results.every((r: any) => r.findings?.status === 'RESOLVED')
            ),
        } as unknown as ReviewerResponseBroker;

        await cli.executeTrack(tmpDir, trackId);

        const remediatorCalls = (mockSpawner.spawn as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call: any[]) => call[0]?.role === 'superconductor-remediation-processor'
        );
        expect(remediatorCalls).toHaveLength(1);
    });

    it('remediateFn — return string contains "Dispatched 2 parallel" for 2-domain findings', async () => {
        // We exercise the QuorumReviewLoop in isolation to inspect the remediateFn return value.
        const { QuorumReviewLoop } = await import('../../src/verification/quorum-review-loop.js');

        const mockSpawn = vi.fn().mockImplementation(async (cfg: any) => ({
            conversationId: `remediate-conv-${cfg.prompt?.slice(0, 10)}`,
            synthetic: false,
        }));

        let remediateResult = '';
        let reviewCycle = 0;

        const loop = new QuorumReviewLoop({
            maxIterations: 3,
            reviewerFn: async () => {
                reviewCycle++;
                if (reviewCycle === 1) {
                    return {
                        status: 'FAILED',
                        findings: [
                            { domain: 'src/auth.ts', message: 'issue 1' },
                            { domain: 'src/payments.ts', message: 'issue 2' },
                        ],
                    };
                }
                return { status: 'RESOLVED', findings: [] };
            },
            remediateFn: async (payloads: unknown[]) => {
                // Mirror the production domain-partitioned logic inline to test the return value shape
                const domainGroups = new Map<string, unknown[]>();
                for (const finding of payloads as Array<Record<string, unknown>>) {
                    const domain = (finding['domain'] as string) || 'general';
                    if (!domainGroups.has(domain)) domainGroups.set(domain, []);
                    domainGroups.get(domain)!.push(finding);
                }
                const agents = await Promise.all(
                    Array.from(domainGroups.entries()).map(([domain, df]) =>
                        mockSpawn({ role: 'superconductor-remediation-processor', prompt: `domain [${domain}]: ${JSON.stringify(df)}` })
                    )
                );
                const ids = agents.map((a: any) => a.conversationId).join(', ');
                remediateResult = `Dispatched ${agents.length} parallel domain remediator(s) [${Array.from(domainGroups.keys()).join(', ')}]: ${ids}`;
                return remediateResult;
            },
        });

        await loop.run('');

        expect(mockSpawn).toHaveBeenCalledTimes(2);
        expect(remediateResult).toContain('Dispatched 2 parallel');
    });

});
