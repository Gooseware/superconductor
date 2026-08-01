import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { TrackStateManager } from '../../src/permissions/track-state';

vi.mock('fs', () => ({
  watch: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}));

describe('TrackStateManager', () => {
  let manager: TrackStateManager;
  let watchCallback: fs.WatchListener<string> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (fs.watch as any).mockImplementation((path: string, options: any, cb: any) => {
      watchCallback = typeof options === 'function' ? options : cb;
      return { close: vi.fn() };
    });
    (fs.existsSync as any).mockReturnValue(true);
    
    // Default mock implementation returning IDLE state (no `[~]`)
    (fs.readFileSync as any).mockImplementation((filePath: string) => {
      if (filePath.endsWith('session-flags.json')) {
        return JSON.stringify({ yolo: false, persistent: false });
      }
      return `
      - [ ] track/some_old_track
    `;
    });
    
    manager = new TrackStateManager('/fake/workspace');
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it('State machine correctly identifies IDLE when tracks.md has no [~] entries', () => {
    (fs.readFileSync as any).mockReturnValue(`
      - [ ] track/unstarted_track
      - [x] track/completed_track
    `);
    
    if (watchCallback) watchCallback('change', 'tracks.md');
    
    expect(manager.detectCurrentState()).toBe('IDLE');
    expect(manager.getActiveTrackId()).toBeNull();
  });

  it('State machine correctly identifies TRACKED when tracks.md has a [~] entry', () => {
    (fs.readFileSync as any).mockReturnValue(`
      - [x] track/completed_track
      - [~] track/active_track_123
    `);
    
    // We simulate a file change which should trigger read and cache update
    if (watchCallback) {
      watchCallback('change', 'tracks.md');
    }
    
    expect(manager.detectCurrentState()).toBe('TRACKED');
    expect(manager.getActiveTrackId()).toBe('track/active_track_123');
  });

  it('detects YOLO state if explicitly set', () => {
    manager.setYolo(true);
    expect(manager.detectCurrentState()).toBe('YOLO');
  });

  it('caches the tracks.md read for 200ms', () => {
    (fs.readFileSync as any).mockReturnValue(`
      - [~] track/cached_track
    `);
    
    if (watchCallback) watchCallback('change', 'tracks.md');
    
    expect(manager.getActiveTrackId()).toBe('track/cached_track');
    
    // Change file content but do NOT trigger watchCallback, so we rely on cache
    (fs.readFileSync as any).mockReturnValue(`
      - [ ] track/cached_track
    `);
    
    // Fast forward 100ms
    vi.advanceTimersByTime(100);
    // Should still return cached value
    expect(manager.getActiveTrackId()).toBe('track/cached_track');
    
    // Fast forward another 150ms (total 250ms)
    vi.advanceTimersByTime(150);
    // Now it should read again
    expect(manager.getActiveTrackId()).toBeNull();
  });
});
