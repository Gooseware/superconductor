import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { TrackStateManager } from '../src/services/TrackStateManager.js';

describe('TrackStateManager', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns TRACKED when SUPERCONDUCTOR_TRACK_ID is set', () => {
    process.env.SUPERCONDUCTOR_TRACK_ID = 't1';
    const sm = new TrackStateManager('/mock/root');
    assert.strictEqual(sm.getMode(), 'TRACKED');
  });

  it('returns YOLO when SUPERCONDUCTOR_YOLO is set', () => {
    delete process.env.SUPERCONDUCTOR_TRACK_ID;
    process.env.SUPERCONDUCTOR_YOLO = '1';
    const sm = new TrackStateManager('/mock/root');
    assert.strictEqual(sm.getMode(), 'YOLO');
  });

  it('returns IDLE otherwise', () => {
    delete process.env.SUPERCONDUCTOR_TRACK_ID;
    delete process.env.SUPERCONDUCTOR_YOLO;
    const sm = new TrackStateManager('/mock/root');
    assert.strictEqual(sm.getMode(), 'IDLE');
  });
});
