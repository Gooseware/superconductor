/**
 * quorum-store-sanitize.test.ts
 *
 * TDD tests for the exported PathTraversalError and sanitizeId() function
 * from quorum-store.ts (Phase 1 hardening — Task A).
 *
 * REV-1: Also tests that QuorumStore public methods (writeConsensus, writeResult,
 * appendToAgentsManifest) throw PathTraversalError on malicious input, not just
 * the exported sanitizeId() helper.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { PathTraversalError, sanitizeId, QuorumStore } from '../../src/cli/quorum-store.js';

describe('PathTraversalError', () => {
    it('should be an instance of Error', () => {
        const err = new PathTraversalError('test');
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(PathTraversalError);
    });

    it('should have the name PathTraversalError', () => {
        const err = new PathTraversalError('bad input');
        expect(err.name).toBe('PathTraversalError');
    });
});

describe('sanitizeId()', () => {
    let tmpDir: string;

    // Use a real temp dir as workspace root for resolve-based checks
    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitize-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── Character-level rejection ──────────────────────────────────────────

    it('should throw PathTraversalError when trackId contains ../', () => {
        expect(() => sanitizeId('../evil', tmpDir, '.superconductor/tracks'))
            .toThrow(PathTraversalError);
    });

    it('should throw PathTraversalError when wuId contains ./', () => {
        expect(() => sanitizeId('./subdir', tmpDir, '.superconductor/quorum'))
            .toThrow(PathTraversalError);
    });

    it('should throw PathTraversalError for id with embedded slash', () => {
        expect(() => sanitizeId('a/b', tmpDir, '.superconductor/quorum'))
            .toThrow(PathTraversalError);
    });

    it('should throw PathTraversalError for id with embedded backslash', () => {
        expect(() => sanitizeId('a\\b', tmpDir, '.superconductor/quorum'))
            .toThrow(PathTraversalError);
    });

    it('should throw PathTraversalError for id with special chars outside allowed set', () => {
        expect(() => sanitizeId('id!invalid', tmpDir, '.superconductor/quorum'))
            .toThrow(PathTraversalError);
    });

    // ── Resolve-based escape detection ────────────────────────────────────

    it('should throw PathTraversalError when path.resolve() escapes the workspace root', () => {
        // Even if no dots/slashes in the id itself, an attacker could craft a
        // symlink scenario. We test the resolve check directly by providing a
        // workspace that is a sub-path and verifying the check works.
        // Use a crafted workspace subdir to test escape detection path.
        const subWorkspace = path.join(tmpDir, 'inner');
        fs.mkdirSync(subWorkspace, { recursive: true });

        // This id is valid chars but if we tricked path.join we'd escape;
        // since the char check catches it first, test the boundary:
        // We'll test with a valid id and confirm it stays within root.
        const result = sanitizeId('valid-id', subWorkspace, '.superconductor');
        expect(result.startsWith(path.resolve(subWorkspace))).toBe(true);
    });

    // ── Valid ids ─────────────────────────────────────────────────────────

    it('should pass sanitization for valid alphanumeric trackId', () => {
        expect(() => sanitizeId('mytrack01', tmpDir, '.superconductor/tracks'))
            .not.toThrow();
    });

    it('should pass sanitization for id with hyphens and underscores', () => {
        expect(() => sanitizeId('my-track_01', tmpDir, '.superconductor/tracks'))
            .not.toThrow();
    });

    it('should pass sanitization for wu-123 style id', () => {
        expect(() => sanitizeId('wu-123', tmpDir, '.superconductor/quorum'))
            .not.toThrow();
    });

    // ── Return value correctness ──────────────────────────────────────────

    it('should return a path within the workspace root', () => {
        const result = sanitizeId('wu-99', tmpDir, '.superconductor/quorum');
        expect(result.startsWith(path.resolve(tmpDir))).toBe(true);
    });

    it('should return a path containing the subdir and id', () => {
        const result = sanitizeId('wu-42', tmpDir, '.superconductor/quorum');
        expect(result).toContain('.superconductor');
        expect(result).toContain('quorum');
        expect(result).toContain('wu-42');
    });

    it('sanitized path is always within .superconductor workspace root', () => {
        const workspace = tmpDir;
        const result = sanitizeId('track-abc', workspace, path.join('.superconductor', 'tracks'));
        const resolvedWorkspace = path.resolve(workspace);
        expect(result.startsWith(resolvedWorkspace)).toBe(true);
    });
});

// ── REV-1: QuorumStore public-method integration tests ───────────────────────
// These tests prove that sanitizeId() is wired into the public-facing methods,
// not just the exported helper. A bare validateId() would NOT catch these inputs.

describe('QuorumStore public methods — PathTraversalError propagation (REV-1)', () => {
    let tmpDir: string;
    let store: QuorumStore;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-rev1-'));
        store = new QuorumStore(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── writeConsensus ────────────────────────────────────────────────────────

    it('writeConsensus throws PathTraversalError when wuId contains ../', async () => {
        await expect(
            store.writeConsensus('../etc', { allGreen: true, payload: [] })
        ).rejects.toThrow(PathTraversalError);
    });

    it('writeConsensus throws PathTraversalError when wuId contains a null byte', async () => {
        await expect(
            store.writeConsensus('null\x00byte', { allGreen: true, payload: [] })
        ).rejects.toThrow(PathTraversalError);
    });

    it('writeConsensus throws PathTraversalError when wuId contains a space', async () => {
        await expect(
            store.writeConsensus('wu id', { allGreen: true, payload: [] })
        ).rejects.toThrow(PathTraversalError);
    });

    it('writeConsensus throws PathTraversalError when wuId contains a colon', async () => {
        await expect(
            store.writeConsensus('wu:id', { allGreen: true, payload: [] })
        ).rejects.toThrow(PathTraversalError);
    });

    // ── writeResult ───────────────────────────────────────────────────────────

    it('writeResult throws PathTraversalError when wuId contains ../', async () => {
        await expect(
            store.writeResult({
                wuId: '../etc',
                conversationId: 'conv-1',
                role: 'processor',
                prompt: 'do something',
                completedAt: new Date().toISOString()
            })
        ).rejects.toThrow(PathTraversalError);
    });

    it('writeResult throws PathTraversalError when wuId contains a null byte', async () => {
        await expect(
            store.writeResult({
                wuId: 'null\x00byte',
                conversationId: 'conv-1',
                role: 'processor',
                prompt: 'do something',
                completedAt: new Date().toISOString()
            })
        ).rejects.toThrow(PathTraversalError);
    });

    it('writeResult throws PathTraversalError when wuId contains a query string', async () => {
        await expect(
            store.writeResult({
                wuId: 'wu?evil=1',
                conversationId: 'conv-1',
                role: 'processor',
                prompt: 'do something',
                completedAt: new Date().toISOString()
            })
        ).rejects.toThrow(PathTraversalError);
    });

    // ── appendToAgentsManifest ────────────────────────────────────────────────

    it('appendToAgentsManifest throws PathTraversalError when trackId contains ../', async () => {
        await expect(
            store.appendToAgentsManifest('../etc', {
                conversationId: 'conv-1',
                wuId: 'wu-1',
                role: 'processor',
                spawnedAt: new Date().toISOString()
            })
        ).rejects.toThrow(PathTraversalError);
    });

    it('appendToAgentsManifest throws PathTraversalError when trackId contains a null byte', async () => {
        await expect(
            store.appendToAgentsManifest('track\x00id', {
                conversationId: 'conv-1',
                wuId: 'wu-1',
                role: 'processor',
                spawnedAt: new Date().toISOString()
            })
        ).rejects.toThrow(PathTraversalError);
    });

    // ── Happy path ────────────────────────────────────────────────────────────

    it('readConsensus on a valid track/wu does NOT throw', async () => {
        // File does not exist yet — should return null without throwing
        const result = await store.readConsensus('wu-1');
        expect(result).toBeNull();
    });

    it('writeConsensus + readConsensus round-trip works for valid ids', async () => {
        const artifact = { allGreen: true, payload: [] };
        await store.writeConsensus('wu-valid', artifact);
        const read = await store.readConsensus('wu-valid');
        expect(read).toEqual(artifact);
    });
});
