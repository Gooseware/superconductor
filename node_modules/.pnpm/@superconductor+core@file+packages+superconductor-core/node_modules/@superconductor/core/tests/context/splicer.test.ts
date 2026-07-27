import * as fs from 'node:fs';
import * as path from 'node:path';
import { TrackSplicer } from '../../src/context/splicer.js';
import { vi, describe, beforeEach, it, expect } from 'vitest';

vi.mock('node:fs');

describe('TrackSplicer', () => {
  const projectRoot = '/mock/root';
  const splicer = new TrackSplicer(projectRoot);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('splices tracks and outputs valid JSON with compression and truncation', () => {
    const trackId = 'test_track';
    const trackDir = path.join(projectRoot, 'superconductor', 'tracks', trackId);

    (fs.existsSync as any).mockImplementation((p: string) => {
      if (p === path.join(trackDir, 'metadata.json')) return true;
      if (p === path.join(trackDir, 'spec.md')) return true;
      if (p === path.join(trackDir, 'plan.md')) return true;
      return false;
    });

    const hugeContent = 'word '.repeat(1000); // 5000 characters

    (fs.readFileSync as any).mockImplementation((p: string) => {
      if (p === path.join(trackDir, 'metadata.json')) return JSON.stringify({ key: 'val' });
      if (p === path.join(trackDir, 'spec.md')) return '# Spec\n\nContent\n\n' + hugeContent;
      if (p === path.join(trackDir, 'plan.md')) return '# Plan\n\n<!-- ignore -->\nContent';
      return '';
    });

    const resultStr = splicer.spliceTracks([trackId]);
    const parsed = JSON.parse(resultStr);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].trackId).toBe(trackId);
    expect(parsed[0].metadata).toEqual({ key: 'val' });
    
    // Assert token size bounds
    expect(parsed[0].specSummary.length).toBeLessThanOrEqual(2003); // 2000 + '...'
    expect(parsed[0].specSummary.endsWith('...')).toBe(true);
    
    // Assert correct compression of whitespace and comments
    expect(parsed[0].planSummary).toBe('# Plan\n\nContent');
  });

  it('rejects invalid trackIds (SEC-1)', () => {
    const trackId = '../escaped_track';
    const resultStr = splicer.spliceTracks([trackId]);
    const parsed = JSON.parse(resultStr);
    expect(parsed).toHaveLength(0);
  });
});
