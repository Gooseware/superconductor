import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { SwarmOrchestratorCLI } from '../../src/cli/orchestrate.js';
import { MockAgentSpawner } from '../../src/cli/mock-agent-spawner.js';
import { ReviewerResponseBroker } from '../../src/verification/reviewer-response-broker.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function makeResolvedBroker(): ReviewerResponseBroker {
    return {
        aggregate: vi.fn().mockResolvedValue([
            { reviewerId: 'security-reviewer', findings: { status: 'RESOLVED' }, timedOut: false },
            { reviewerId: 'correctness-reviewer', findings: { status: 'RESOLVED' }, timedOut: false },
            { reviewerId: 'adversarial-reviewer', findings: { status: 'RESOLVED' }, timedOut: false },
            { reviewerId: 'regression-reviewer', findings: { status: 'RESOLVED' }, timedOut: false },
        ]),
        isConsensusResolved: () => true,
    } as unknown as ReviewerResponseBroker;
}

describe('SwarmOrchestratorCLI - Remediation Fixes Verification', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrate-fixes-test-'));
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('1. Appends researchContext to implementor prompt when present', async () => {
        const mockSpawner = new MockAgentSpawner();
        const spawnSpy = vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-123', synthetic: false });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        cli.reviewerBroker = makeResolvedBroker();

        const trackId = 'research-ctx-track';
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', trackId);
        const researchDir = path.join(tmpDir, '.superconductor', 'research', trackId);
        fs.mkdirSync(trackDir, { recursive: true });
        fs.mkdirSync(researchDir, { recursive: true });

        fs.writeFileSync(path.join(tmpDir, 'topography.json'), JSON.stringify({
            partitions: [{ id: 'core', category: 'core' }]
        }), 'utf8');

        fs.writeFileSync(path.join(trackDir, 'plan.md'), '- [ ] Task: Implement core logic [TIER-3] [AGENT:agent-core] [DOMAIN:core]\n', 'utf8');

        // Write research brief
        fs.writeFileSync(path.join(researchDir, 'brief.json'), JSON.stringify({
            trackId,
            generatedAt: new Date().toISOString(),
            queriesExecuted: [],
            executiveSummary: 'Mandatory security check required',
            keyFindings: [{ category: 'SECURITY_CONSIDERATION', description: 'Avoid unsafe eval', domain: 'core' }],
            recommendedPatterns: [],
            antiPatterns: [],
            skillsAlreadyInstalled: [],
            artifactPointers: []
        }), 'utf8');

        await cli.executeTrack(tmpDir, trackId);

        // Find implementor spawn call
        const implementorCall = spawnSpy.mock.calls.find(call => call[0].role === 'agent-core');
        expect(implementorCall).toBeDefined();
        expect(implementorCall![0].prompt).toContain('Implement core logic');
        expect(implementorCall![0].prompt).toContain('<untrusted_research_context>');
        expect(implementorCall![0].prompt).toContain('Mandatory security check required');
    });


    it('3. Throws hard error on malformed brief.json', async () => {
        const mockSpawner = new MockAgentSpawner();
        vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'conv-456', synthetic: false });

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        cli.reviewerBroker = makeResolvedBroker();

        const trackId = 'malformed-brief-track';
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', trackId);
        const researchDir = path.join(tmpDir, '.superconductor', 'research', trackId);
        fs.mkdirSync(trackDir, { recursive: true });
        fs.mkdirSync(researchDir, { recursive: true });

        fs.writeFileSync(path.join(tmpDir, 'topography.json'), JSON.stringify({
            partitions: [{ id: 'core' }]
        }), 'utf8');

        fs.writeFileSync(path.join(trackDir, 'plan.md'), '- [ ] Task: Task with broken JSON brief [TIER-3] [AGENT:agent-b] [DOMAIN:core]\n', 'utf8');

        // Invalid JSON brief
        fs.writeFileSync(path.join(researchDir, 'brief.json'), '{ invalid JSON format ...', 'utf8');

        // Should throw fatal error
        await expect(cli.executeTrack(tmpDir, trackId)).rejects.toThrow(/\[orchestrate\] FATAL: Failed to read\/parse research brief/);
    });

    it('4. REG-1: Auto-resolves quorum review when capturedSpawner is absent and no conversation IDs', async () => {
        const cli = new SwarmOrchestratorCLI(null as any); // Null spawner passed
        const trackId = 'no-spawner-track';
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', trackId);
        fs.mkdirSync(trackDir, { recursive: true });

        fs.writeFileSync(path.join(tmpDir, 'topography.json'), JSON.stringify({
            partitions: [{ id: 'core' }]
        }), 'utf8');

        fs.writeFileSync(path.join(trackDir, 'plan.md'), '- [ ] Task: Simple task [TIER-3] [AGENT:agent-core] [DOMAIN:core]\n', 'utf8');

        const result = await cli.executeTrack(tmpDir, trackId);
        expect(result.workUnits).toHaveLength(1);
        expect(result.workUnits[0].state).toBe('DONE');
    });

    it('5. ADV-2 & ADV-4: RemediateFn unwraps payloads, reads file content from disk, and partitions by domain', async () => {
        // Create sample file on disk
        const sampleFilePath = 'src/sample.ts';
        const fullSamplePath = path.join(tmpDir, sampleFilePath);
        fs.mkdirSync(path.dirname(fullSamplePath), { recursive: true });
        fs.writeFileSync(fullSamplePath, 'line 1\nline 2\nline 3\nline 4\nline 5\n', 'utf8');

        const mockSpawner = new MockAgentSpawner();
        const spawnSpy = vi.spyOn(mockSpawner, 'spawn').mockResolvedValue({ conversationId: 'remediator-conv-1', synthetic: false });

        let quorumBrokerCalls = 0;
        const brokerWithFindings: ReviewerResponseBroker = {
            aggregate: vi.fn().mockImplementation(async () => {
                quorumBrokerCalls++;
                if (quorumBrokerCalls === 1) {
                    return [{
                        reviewerId: 'security-reviewer',
                        findings: {
                            status: 'FAILED',
                            findings: [{
                                finding_id: 'f-1',
                                reviewer_id: 'security-reviewer',
                                file: sampleFilePath,
                                line_range: 'L2-L4',
                                severity: 'high',
                                category: 'security',
                                description: 'Security flaw',
                                recommendation: 'Fix it',
                                is_security_critical: false,
                                domain: 'auth-domain'
                            }]
                        },
                        timedOut: false
                    }];
                }
                return [{ reviewerId: 'security-reviewer', findings: { status: 'RESOLVED' }, timedOut: false }];
            }),
            isConsensusResolved: (results) => results.every(r => r.findings && (r.findings as any).status === 'RESOLVED'),
        } as unknown as ReviewerResponseBroker;

        const cli = new SwarmOrchestratorCLI(mockSpawner);
        cli.reviewerBroker = brokerWithFindings;

        const trackId = 'remediate-test-track';
        const trackDir = path.join(tmpDir, '.superconductor', 'tracks', trackId);
        fs.mkdirSync(trackDir, { recursive: true });

        fs.writeFileSync(path.join(tmpDir, 'topography.json'), JSON.stringify({
            partitions: [{ id: 'core' }]
        }), 'utf8');

        fs.writeFileSync(path.join(trackDir, 'plan.md'), '- [ ] Task: Task needing remediation [TIER-3] [AGENT:agent-core] [DOMAIN:core]\n', 'utf8');

        await cli.executeTrack(tmpDir, trackId);

        // Verify remediation processor was spawned for domain 'auth-domain'
        const remediatorCall = spawnSpy.mock.calls.find(call => call[0].role === 'superconductor-remediation-processor');
        expect(remediatorCall).toBeDefined();
        expect(remediatorCall![0].prompt).toContain('auth-domain');
        // Verify ADV-4: contextLines populated from actual disk file
        expect(remediatorCall![0].prompt).toContain('line 2');
        expect(remediatorCall![0].prompt).toContain('line 3');
    });
});

