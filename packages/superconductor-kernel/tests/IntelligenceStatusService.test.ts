import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { IntelligenceStatusService } from '../src/services/IntelligenceStatusService.js';

describe('IntelligenceStatusService', () => {
  let tempDir: string;
  let service: IntelligenceStatusService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-intel-status-test-'));
    service = new IntelligenceStatusService();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns NONE when no manifest file exists', async () => {
    const result = await service.getStatus(tempDir);
    expect(result.status).toBe('NONE');
    expect(result.age_days).toBe(0);
    expect(result.commits_behind).toBe(0);
    expect(result.snapshot_path).toBe(tempDir);
    expect(result.phases).toEqual({});
  });

  it('returns LIVE when age < 1 day and commits_behind < 10', async () => {
    const intelDir = path.join(tempDir, 'intelligence');
    fs.mkdirSync(intelDir, { recursive: true });

    const recentTimestamp = Date.now() - 3600 * 1000; // 1 hour ago
    fs.writeFileSync(
      path.join(intelDir, '00_manifest.json'),
      JSON.stringify({ timestamp: recentTimestamp })
    );
    fs.writeFileSync(path.join(intelDir, '01_fingerprint.json'), '{}');
    fs.writeFileSync(path.join(intelDir, '02_dependency_graph.json'), '{}');
    fs.writeFileSync(path.join(intelDir, '03_complexity.json'), '{}');
    fs.writeFileSync(path.join(intelDir, '04_coupling.json'), '{}');

    const result = await service.getStatus(tempDir);
    expect(result.status).toBe('LIVE');
    expect(result.age_days).toBeLessThan(1);
    expect(result.commits_behind).toBe(0);
    expect(result.phases).toEqual({
      '01_fingerprint': 'ok',
      '02_dependency_graph': 'ok',
      '03_complexity': 'ok',
      '04_coupling': 'ok',
    });
  });

  it('returns STALE when age >= 1 day', async () => {
    const intelDir = path.join(tempDir, 'intelligence');
    fs.mkdirSync(intelDir, { recursive: true });

    const oldTimestamp = Date.now() - 2 * 86400 * 1000; // 2 days ago
    fs.writeFileSync(
      path.join(intelDir, '00_manifest.json'),
      JSON.stringify({ timestamp: oldTimestamp })
    );
    fs.writeFileSync(path.join(intelDir, '01_fingerprint.json'), '{}');

    const result = await service.getStatus(tempDir);
    expect(result.status).toBe('STALE');
    expect(result.age_days).toBeGreaterThanOrEqual(1);
    expect(result.phases['01_fingerprint']).toBe('ok');
    expect(result.phases['02_dependency_graph']).toBe('degraded');
  });
});
