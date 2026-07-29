import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { QuorumStore, AgentOutputRecord, AgentManifestEntry, PathTraversalError } from '../../src/cli/quorum-store.js';
import { ConsensusArtifact } from '@superconductor/core/src/track/work-unit.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('QuorumStore', () => {
    let tmpDir: string;
    let store: QuorumStore;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quorum-store-test-'));
        store = new QuorumStore(tmpDir);
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('writeResult / readResult', () => {
        it('should write an AgentOutputRecord to the expected path', async () => {
            const record: AgentOutputRecord = {
                wuId: 'wu-1',
                conversationId: 'conv-abc123',
                role: 'agent-ui',
                prompt: 'Implement the login page',
                result: { allGreen: true, payload: [] },
                completedAt: '2026-07-28T00:00:00.000Z'
            };

            await store.writeResult(record);

            const expectedPath = path.join(tmpDir, '.superconductor', 'quorum', 'wu-1', 'implementor-result.json');
            expect(fs.existsSync(expectedPath)).toBe(true);

            const written = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
            expect(written.wuId).toBe('wu-1');
            expect(written.conversationId).toBe('conv-abc123');
        });

        it('should read back a previously written AgentOutputRecord', async () => {
            const record: AgentOutputRecord = {
                wuId: 'wu-2',
                conversationId: 'conv-def456',
                role: 'agent-api',
                prompt: 'Add login endpoint',
                result: { status: 'ok' },
                completedAt: '2026-07-28T01:00:00.000Z'
            };

            await store.writeResult(record);
            const read = await store.readResult('wu-2');

            expect(read).not.toBeNull();
            expect(read!.wuId).toBe('wu-2');
            expect(read!.conversationId).toBe('conv-def456');
            expect(read!.role).toBe('agent-api');
        });

        it('should return null when reading a non-existent result', async () => {
            const result = await store.readResult('wu-does-not-exist');
            expect(result).toBeNull();
        });

        it('should create intermediate directories when writing', async () => {
            const record: AgentOutputRecord = {
                wuId: 'wu-nested',
                conversationId: 'conv-xyz',
                role: 'agent-x',
                prompt: 'Do something',
                completedAt: new Date().toISOString()
            };

            // Directories should not exist yet
            const dir = path.join(tmpDir, '.superconductor', 'quorum', 'wu-nested');
            expect(fs.existsSync(dir)).toBe(false);

            await store.writeResult(record);
            expect(fs.existsSync(dir)).toBe(true);
        });
    });

    describe('appendToAgentsManifest / readAgentsManifest', () => {
        it('should create agents.json and add the first entry', async () => {
            const entry: AgentManifestEntry = {
                conversationId: 'conv-111',
                wuId: 'wu-1',
                role: 'agent-ui',
                spawnedAt: '2026-07-28T00:00:00.000Z'
            };

            await store.appendToAgentsManifest('my-track', entry);

            const manifest = await store.readAgentsManifest('my-track');
            expect(manifest).toHaveLength(1);
            expect(manifest[0].conversationId).toBe('conv-111');
            expect(manifest[0].wuId).toBe('wu-1');
        });

        it('should append multiple entries to agents.json', async () => {
            const entries: AgentManifestEntry[] = [
                { conversationId: 'conv-aaa', wuId: 'wu-1', role: 'agent-ui', spawnedAt: new Date().toISOString() },
                { conversationId: 'conv-bbb', wuId: 'wu-2', role: 'agent-api', spawnedAt: new Date().toISOString() },
                { conversationId: 'conv-ccc', wuId: 'wu-3', role: 'agent-db', spawnedAt: new Date().toISOString() }
            ];

            for (const entry of entries) {
                await store.appendToAgentsManifest('track-multi', entry);
            }

            const manifest = await store.readAgentsManifest('track-multi');
            expect(manifest).toHaveLength(3);
            expect(manifest.map(e => e.conversationId)).toEqual(['conv-aaa', 'conv-bbb', 'conv-ccc']);
        });

        it('should return empty array when agents.json does not exist', async () => {
            const manifest = await store.readAgentsManifest('track-does-not-exist');
            expect(manifest).toEqual([]);
        });

        it('should write agents.json to the expected path', async () => {
            const entry: AgentManifestEntry = {
                conversationId: 'conv-path-check',
                wuId: 'wu-path',
                role: 'agent-check',
                spawnedAt: new Date().toISOString()
            };

            await store.appendToAgentsManifest('track-xyz', entry);

            const expectedPath = path.join(tmpDir, '.superconductor', 'tracks', 'track-xyz', 'agents.json');
            expect(fs.existsSync(expectedPath)).toBe(true);
        });
    });

    describe('getResultPath / getAgentsManifestPath', () => {
        it('should return correct result path', () => {
            const p = store.getResultPath('wu-42');
            expect(p).toBe(path.join(tmpDir, '.superconductor', 'quorum', 'wu-42', 'implementor-result.json'));
        });

        it('should return correct agents manifest path', () => {
            const p = store.getAgentsManifestPath('my-cool-track');
            expect(p).toBe(path.join(tmpDir, '.superconductor', 'tracks', 'my-cool-track', 'agents.json'));
        });
    });

    describe('path traversal protection (REV-4)', () => {
        // REV-1: sanitizeId() now runs first — it throws PathTraversalError with
        // 'Invalid id "...": only alphanumeric...' before validateId() is reached.
        // Tests use PathTraversalError for precision (both classes share 'Invalid id' prefix).
        it('should throw on wuId containing ".."', () => {
            expect(() => store.getResultPath('../evil')).toThrow(PathTraversalError);
        });

        it('should throw on wuId containing "/"', () => {
            expect(() => store.getResultPath('wu/evil')).toThrow(PathTraversalError);
        });

        it('should throw on wuId containing "\\"', () => {
            expect(() => store.getResultPath('wu\\evil')).toThrow(PathTraversalError);
        });

        it('should throw on trackId containing ".."', () => {
            expect(() => store.getAgentsManifestPath('../../etc/passwd')).toThrow(PathTraversalError);
        });

        it('should throw on trackId containing "/"', () => {
            expect(() => store.getAgentsManifestPath('track/evil')).toThrow(PathTraversalError);
        });

        it('should accept clean alphanumeric ids', () => {
            expect(() => store.getResultPath('wu-99')).not.toThrow();
            expect(() => store.getAgentsManifestPath('my-track_01')).not.toThrow();
        });
    });

    describe('concurrent appendToAgentsManifest (REV-5 mutex)', () => {
        it('should not lose entries when called concurrently', async () => {
            const trackId = 'concurrent-track';
            const N = 10;
            const entries: AgentManifestEntry[] = Array.from({ length: N }, (_, i) => ({
                conversationId: `conv-${i}`,
                wuId: `wu-${i}`,
                role: `agent-${i}`,
                spawnedAt: new Date().toISOString()
            }));

            // Fire all appends concurrently — without a mutex this would lose entries
            await Promise.all(entries.map(e => store.appendToAgentsManifest(trackId, e)));

            const manifest = await store.readAgentsManifest(trackId);
            expect(manifest).toHaveLength(N);

            const convIds = new Set(manifest.map(e => e.conversationId));
            for (let i = 0; i < N; i++) {
                expect(convIds.has(`conv-${i}`)).toBe(true);
            }
        });
    });

    describe('writeConsensus / readConsensus', () => {
        it('should write a ConsensusArtifact to the expected path', async () => {
            const artifact: ConsensusArtifact = { allGreen: true, payload: ['finding-1'] };
            await store.writeConsensus('wu-con-1', artifact);

            const expectedPath = path.join(tmpDir, '.superconductor', 'quorum', 'wu-con-1', 'consensus.json');
            expect(fs.existsSync(expectedPath)).toBe(true);

            const written = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
            expect(written.allGreen).toBe(true);
            expect(written.payload).toEqual(['finding-1']);
        });

        it('should round-trip a ConsensusArtifact via writeConsensus / readConsensus', async () => {
            const artifact: ConsensusArtifact = { allGreen: true, payload: [] };
            await store.writeConsensus('wu-con-2', artifact);

            const read = await store.readConsensus('wu-con-2');
            expect(read).not.toBeNull();
            expect(read!.allGreen).toBe(true);
            expect(read!.payload).toEqual([]);
        });

        it('should round-trip allGreen:false ConsensusArtifact', async () => {
            const artifact: ConsensusArtifact = { allGreen: false, payload: ['issue-a', 'issue-b'] };
            await store.writeConsensus('wu-con-3', artifact);

            const read = await store.readConsensus('wu-con-3');
            expect(read).not.toBeNull();
            expect(read!.allGreen).toBe(false);
            expect(read!.payload).toEqual(['issue-a', 'issue-b']);
        });

        it('should return null when consensus.json does not exist', async () => {
            const result = await store.readConsensus('wu-does-not-exist-consensus');
            expect(result).toBeNull();
        });

        it('should create intermediate directories when writing consensus', async () => {
            const dir = path.join(tmpDir, '.superconductor', 'quorum', 'wu-con-new');
            expect(fs.existsSync(dir)).toBe(false);

            await store.writeConsensus('wu-con-new', { allGreen: true });
            expect(fs.existsSync(dir)).toBe(true);
        });

        it('should throw on wuId containing ".." in writeConsensus', async () => {
            await expect(store.writeConsensus('../evil', { allGreen: true }))
                .rejects.toThrow(PathTraversalError);
        });

        it('should throw on wuId containing "/" in writeConsensus', async () => {
            await expect(store.writeConsensus('wu/evil', { allGreen: true }))
                .rejects.toThrow(PathTraversalError);
        });

        it('should throw on wuId containing ".." in readConsensus', async () => {
            await expect(store.readConsensus('../evil'))
                .rejects.toThrow(PathTraversalError);
        });

        it('should throw on wuId containing "/" in readConsensus', async () => {
            await expect(store.readConsensus('wu/evil'))
                .rejects.toThrow(PathTraversalError);
        });

        it('should expose getConsensusPath returning the expected path', () => {
            const p = store.getConsensusPath('wu-99');
            expect(p).toBe(path.join(tmpDir, '.superconductor', 'quorum', 'wu-99', 'consensus.json'));
        });
    });
});
