import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { SwarmOrchestratorCLI } from '../../src/cli/orchestrate.js';
import { AgyAgentSpawner } from '../../src/cli/agy-agent-spawner.js';
import { MockAgentSpawner } from '../../src/cli/mock-agent-spawner.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ReviewerResponseBroker } from '../../src/verification/reviewer-response-broker.js';

describe('SwarmOrchestratorCLI - Spawner Wire-up', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrate-spawner-test-'));
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function setupWorkspace(workspace: string, trackId: string, tasks: string[]) {
        const trackDir = path.join(workspace, '.superconductor', 'tracks', trackId);
        fs.mkdirSync(trackDir, { recursive: true });
        
        fs.writeFileSync(path.join(workspace, 'topography.json'), JSON.stringify({
            partitions: [{ id: 'core' }]
        }), 'utf8');

        fs.writeFileSync(path.join(trackDir, 'plan.md'), `# Plan\n${tasks.join('\n')}\n`, 'utf8');
    }

    it('defaults to AgyAgentSpawner when constructed without a spawner', async () => {
        const cli = new SwarmOrchestratorCLI();
        cli.reviewerBroker = {
            aggregate: vi.fn().mockResolvedValue([
                { reviewerId: 'security-reviewer', findings: { status: 'RESOLVED' } },
                { reviewerId: 'correctness-reviewer', findings: { status: 'RESOLVED' } },
                { reviewerId: 'adversarial-reviewer', findings: { status: 'RESOLVED' } },
                { reviewerId: 'regression-reviewer', findings: { status: 'RESOLVED' } },
            ]),
            isConsensusResolved: () => true
        } as any;

        const trackId = 'spawner-default-track';
        setupWorkspace(tmpDir, trackId, [
            '- [ ] Task: Dummy task [TIER-3] [AGENT:agent-dummy] [DOMAIN:core]'
        ]);

        await cli.executeTrack(tmpDir, trackId);

        // Check if the spawner property was set correctly
        expect((cli as any).spawner).toBeInstanceOf(AgyAgentSpawner);
    });

    it('calls spawn() on the injected spawner (and not invokeSubagent)', async () => {
        const mockSpawner = new MockAgentSpawner();
        const spawnSpy = vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-mock-123', synthetic: false });
        
        // Assert invokeSubagent does not exist on MockAgentSpawner to prove it uses spawn
        expect((mockSpawner as any).invokeSubagent).toBeUndefined();

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        
        cli.reviewerBroker = {
            aggregate: vi.fn().mockResolvedValue([
                { reviewerId: 'security-reviewer', findings: { status: 'RESOLVED' } },
                { reviewerId: 'correctness-reviewer', findings: { status: 'RESOLVED' } },
                { reviewerId: 'adversarial-reviewer', findings: { status: 'RESOLVED' } },
                { reviewerId: 'regression-reviewer', findings: { status: 'RESOLVED' } },
            ]),
            isConsensusResolved: () => true
        } as any;

        const trackId = 'spawner-inject-track';
        setupWorkspace(tmpDir, trackId, [
            '- [ ] Task: Real task [TIER-3] [AGENT:agent-real] [DOMAIN:core]'
        ]);

        await cli.executeTrack(tmpDir, trackId);

        expect(spawnSpy).toHaveBeenCalled();
        expect(spawnSpy).toHaveBeenCalledWith(expect.objectContaining({ role: 'agent-real' }));
    });
});
