import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import {
  HeadlessWatchdog,
  type QuorumPersistedState,
  type HeadlessWatchdogOptions,
} from '../headless-watchdog.js';

describe('HeadlessWatchdog', () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-test-'));
    statePath = path.join(tempDir, '.superconductor', 'quorum', 'state.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Initialization and Default Options
  // ---------------------------------------------------------------------------
  describe('Options and Defaults', () => {
    it('initializes with default options', () => {
      const watchdog = new HeadlessWatchdog();
      expect(watchdog.maxCycles).toBe(3);
      expect(watchdog.waveTimeoutMs).toBe(300_000);
      expect(watchdog.projectRoot).toBe(process.cwd());
      expect(watchdog.statePath).toBe(
        path.join(process.cwd(), '.superconductor', 'quorum', 'state.json')
      );
    });

    it('accepts custom options overriding defaults', () => {
      const customOptions: HeadlessWatchdogOptions = {
        maxCycles: 5,
        waveTimeoutMs: 60_000,
        projectRoot: '/custom/root',
        statePath: '/custom/path/state.json',
      };
      const watchdog = new HeadlessWatchdog(customOptions);
      expect(watchdog.maxCycles).toBe(5);
      expect(watchdog.waveTimeoutMs).toBe(60_000);
      expect(watchdog.projectRoot).toBe('/custom/root');
      expect(watchdog.statePath).toBe('/custom/path/state.json');
    });

    it('resolves default statePath relative to custom projectRoot', () => {
      const watchdog = new HeadlessWatchdog({ projectRoot: tempDir });
      expect(watchdog.statePath).toBe(
        path.join(tempDir, '.superconductor', 'quorum', 'state.json')
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Diff-Hash Stability & Circuit Breaker (STAGNANT_DIFF)
  // ---------------------------------------------------------------------------
  describe('Diff-Hash Stability & recordDiff', () => {
    it('computes sha256 hash and records first diff as not stagnant', () => {
      const watchdog = new HeadlessWatchdog();
      const diff1 = 'diff --git a/foo.ts b/foo.ts\n+const x = 1;';
      const expectedHash = crypto.createHash('sha256').update(diff1).digest('hex');

      const result = watchdog.recordDiff(diff1);
      expect(result.diffHash).toBe(expectedHash);
      expect(result.isStagnant).toBe(false);
      expect(watchdog.lastDiffHash).toBe(expectedHash);
    });

    it('detects stagnant diff when identical diff is recorded in consecutive cycles', () => {
      const watchdog = new HeadlessWatchdog();
      const diff1 = 'diff --git a/foo.ts b/foo.ts\n+const x = 1;';

      const firstRecord = watchdog.recordDiff(diff1);
      expect(firstRecord.isStagnant).toBe(false);

      // Same diff recorded again in next cycle -> trips STAGNANT_DIFF
      const secondRecord = watchdog.recordDiff(diff1);
      expect(secondRecord.isStagnant).toBe(true);
      expect(secondRecord.diffHash).toBe(firstRecord.diffHash);
    });

    it('does not flag stagnant when subsequent diff is different', () => {
      const watchdog = new HeadlessWatchdog();
      const diff1 = 'diff --git a/foo.ts b/foo.ts\n+const x = 1;';
      const diff2 = 'diff --git a/foo.ts b/foo.ts\n+const x = 2;';

      const firstRecord = watchdog.recordDiff(diff1);
      expect(firstRecord.isStagnant).toBe(false);

      const secondRecord = watchdog.recordDiff(diff2);
      expect(secondRecord.isStagnant).toBe(false);
      expect(secondRecord.diffHash).not.toBe(firstRecord.diffHash);
    });

    it('allows clearing/resetting previous diff hash', () => {
      const watchdog = new HeadlessWatchdog();
      const diff1 = 'diff --git a/foo.ts b/foo.ts\n+const x = 1;';

      watchdog.recordDiff(diff1);
      watchdog.reset();
      expect(watchdog.lastDiffHash).toBeUndefined();

      // After reset, recording same diff is not stagnant
      const afterReset = watchdog.recordDiff(diff1);
      expect(afterReset.isStagnant).toBe(false);
    });

    it('allows setting lastDiffHash directly via setLastDiffHash', () => {
      const watchdog = new HeadlessWatchdog();
      watchdog.setLastDiffHash('pre-existing-hash');
      expect(watchdog.lastDiffHash).toBe('pre-existing-hash');

      watchdog.setLastDiffHash(undefined);
      expect(watchdog.lastDiffHash).toBeUndefined();
    });

    it('exposes computeDiffHash utility method', () => {
      const watchdog = new HeadlessWatchdog();
      const text = 'test content';
      const expected = crypto.createHash('sha256').update(text).digest('hex');
      expect(watchdog.computeDiffHash(text)).toBe(expected);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Wave Timeout Watchdog
  // ---------------------------------------------------------------------------
  describe('Wave Timeout Watchdog', () => {
    it('detects timeout when elapsed time exceeds waveTimeoutMs', () => {
      const watchdog = new HeadlessWatchdog({ waveTimeoutMs: 5000 });
      const startTime = 1000;

      // Elapsed: 4999ms -> not timed out
      expect(watchdog.isWaveTimedOut(startTime, 5999)).toBe(false);

      // Elapsed: 5000ms -> timed out
      expect(watchdog.isWaveTimedOut(startTime, 6000)).toBe(true);

      // Elapsed: 6000ms -> timed out
      expect(watchdog.isWaveTimedOut(startTime, 7000)).toBe(true);
    });

    it('defaults to Date.now() when current time is omitted', () => {
      const watchdog = new HeadlessWatchdog({ waveTimeoutMs: 100 });
      const recentStart = Date.now();
      expect(watchdog.isWaveTimedOut(recentStart)).toBe(false);

      const ancientStart = Date.now() - 500;
      expect(watchdog.isWaveTimedOut(ancientStart)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Cycle Limit Checking
  // ---------------------------------------------------------------------------
  describe('Cycle Limit Checking', () => {
    it('flags cycle limit when cycle count meets or exceeds maxCycles', () => {
      const watchdog = new HeadlessWatchdog({ maxCycles: 3 });
      expect(watchdog.isCycleLimitReached(0)).toBe(false);
      expect(watchdog.isCycleLimitReached(1)).toBe(false);
      expect(watchdog.isCycleLimitReached(2)).toBe(false);
      expect(watchdog.isCycleLimitReached(3)).toBe(true);
      expect(watchdog.isCycleLimitReached(4)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Checkpoint Persistence & State Loading
  // ---------------------------------------------------------------------------
  describe('Checkpoint Persistence and State Loading', () => {
    it('returns null when state file does not exist', async () => {
      const watchdog = new HeadlessWatchdog({ statePath });
      const state = await watchdog.loadState();
      expect(state).toBeNull();
    });

    it('persists and reloads QuorumPersistedState to disk', async () => {
      const watchdog = new HeadlessWatchdog({ statePath });

      const stateToPersist: QuorumPersistedState = {
        trackId: 'track-inv-01',
        phaseId: 'phase-5',
        cycle: 1,
        status: 'in_progress',
        lastDiffHash: 'hash-abc-123',
        timestamp: Date.now(),
        metadata: { subagentCount: 3 },
      };

      await watchdog.persistState(stateToPersist);
      expect(fs.existsSync(statePath)).toBe(true);

      const loaded = await watchdog.loadState();
      expect(loaded).toEqual(stateToPersist);
      expect(watchdog.lastDiffHash).toBe('hash-abc-123');
    });

    it('updates lastDiffHash when persisting state with lastDiffHash', async () => {
      const watchdog = new HeadlessWatchdog({ statePath });
      await watchdog.persistState({
        trackId: 'track-inv-01',
        cycle: 2,
        status: 'passed',
        lastDiffHash: 'persisted-hash-xyz',
        timestamp: Date.now(),
      });
      expect(watchdog.lastDiffHash).toBe('persisted-hash-xyz');
    });

    it('creates missing directories recursively on persistState', async () => {
      const nestedPath = path.join(tempDir, 'deeply', 'nested', 'state.json');
      const watchdog = new HeadlessWatchdog({ statePath: nestedPath });

      await watchdog.persistState({
        trackId: 'track-test',
        cycle: 1,
        status: 'in_progress',
        timestamp: 123456789,
      });

      expect(fs.existsSync(nestedPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(nestedPath, 'utf-8'));
      expect(content.trackId).toBe('track-test');
    });

    it('supports all QuorumPersistedState status variants', async () => {
      const watchdog = new HeadlessWatchdog({ statePath });
      const statuses: QuorumPersistedState['status'][] = [
        'in_progress',
        'passed',
        'failed',
        'circuit_broken',
      ];

      for (const st of statuses) {
        await watchdog.persistState({
          trackId: 'track-test',
          cycle: 1,
          status: st,
          timestamp: Date.now(),
        });
        const loaded = await watchdog.loadState();
        expect(loaded?.status).toBe(st);
      }
    });

    it('handles corrupted state JSON gracefully by returning null', async () => {
      const watchdog = new HeadlessWatchdog({ statePath });
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, 'INVALID_NOT_JSON!!!', 'utf-8');

      const loaded = await watchdog.loadState();
      expect(loaded).toBeNull();
    });
  });
});
