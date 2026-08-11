import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  QuorumStateStore,
  QuorumStateRecord,
  StateIntegrityError,
  computeStateChecksum,
} from '../src/persistence/quorum-state-store.js';

describe('QuorumStateStore', () => {
  let tmpDir: string;
  let dbPath: string;
  let store: QuorumStateStore;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quorum-store-test-'));
    dbPath = path.join(tmpDir, 'quorum.db');
    store = new QuorumStateStore(dbPath);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should round-trip state record save and load', async () => {
    const record: QuorumStateRecord = {
      track_id: 'track-123',
      session_id: 'session-abc',
      state: 'REVIEWING',
      cycle_count: 1,
      last_diff_hash: 'hash123',
      reviewer_session_id: 'rev-token-456',
      timestamp: 1234567890,
      sha256_checksum: '',
    };

    record.sha256_checksum = computeStateChecksum(record);
    await store.save(record);

    const loaded = await store.load('track-123', 'session-abc');
    expect(loaded).not.toBeNull();
    expect(loaded?.track_id).toBe('track-123');
    expect(loaded?.session_id).toBe('session-abc');
    expect(loaded?.state).toBe('REVIEWING');
    expect(loaded?.cycle_count).toBe(1);
    expect(loaded?.last_diff_hash).toBe('hash123');
    expect(loaded?.reviewer_session_id).toBe('rev-token-456');
    expect(loaded?.sha256_checksum).toBe(record.sha256_checksum);
  });

  it('should return null when loading non-existent record', async () => {
    const loaded = await store.load('non-existent', 'session-xyz');
    expect(loaded).toBeNull();
  });

  it('should throw StateIntegrityError when checksum is tampered', async () => {
    const record: QuorumStateRecord = {
      track_id: 'track-tamper',
      session_id: 'session-tamper',
      state: 'INIT',
      cycle_count: 0,
      last_diff_hash: null,
      reviewer_session_id: null,
      timestamp: 1000,
      sha256_checksum: 'invalid-checksum',
    };

    // Save record with invalid checksum directly or bypass checksum calculation
    await store.saveRawRecord(record);

    await expect(store.load('track-tamper', 'session-tamper')).rejects.toThrow(StateIntegrityError);
  });
});
