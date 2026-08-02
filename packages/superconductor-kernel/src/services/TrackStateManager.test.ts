import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TrackStateManager } from './TrackStateManager.js';
import fs from 'fs';
import path from 'path';

describe('TrackStateManager', () => {
  const testPath = path.join(process.cwd(), 'test-track-state.json');

  beforeEach(() => {
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testPath)) {
      fs.unlinkSync(testPath);
    }
  });

  it('should initialize with TRACKED mode by default', () => {
    const manager = new TrackStateManager(testPath);
    expect(manager.getMode()).toBe('TRACKED');
  });

  it('should save mode to disk and reload it', () => {
    const manager1 = new TrackStateManager(testPath);
    manager1.setMode('YOLO');
    expect(manager1.getMode()).toBe('YOLO');

    // Create a new instance, should load from disk
    const manager2 = new TrackStateManager(testPath);
    expect(manager2.getMode()).toBe('YOLO');
  });

  it('should fallback to default if file is corrupted', () => {
    fs.writeFileSync(testPath, 'corrupted json');
    const manager = new TrackStateManager(testPath);
    expect(manager.getMode()).toBe('TRACKED');
  });
});
