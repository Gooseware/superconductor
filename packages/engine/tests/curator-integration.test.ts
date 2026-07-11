import fs from 'fs/promises';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TelemetryIngester } from '../src/curator/telemetry-ingester.js';
import { SkillSynthesizer } from '../src/curator/skill-synthesizer.js';
import { EventStore } from '../src/state/event-store.js';

describe('Curator Integration', () => {
  let eventStore: EventStore;
  let telemetryIngester: TelemetryIngester;
  let skillSynthesizer: SkillSynthesizer;
  const testSkillsDir = path.join(process.cwd(), '.tmp-skills-test');

  beforeEach(async () => {
    eventStore = new EventStore({ dbPath: ':memory:' });
    telemetryIngester = new TelemetryIngester(':memory:');
    skillSynthesizer = new SkillSynthesizer(eventStore, testSkillsDir);
    await fs.mkdir(testSkillsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testSkillsDir, { recursive: true, force: true });
  });

  it('should execute end-to-end flow: ingest -> compute metrics -> trigger synthesis -> verify output', async () => {
    // 1. Ingest dummy status payloads
    telemetryIngester.ingestStatusPayload({
      timestamp: new Date().toISOString(),
      tokensUsed: 1000,
      contextSize: 5000,
      state: 'ERROR',
      escalationTriggered: true,
      taskId: 'task-1',
      trackId: 'track-1',
      diffStatus: 'failed'
    });

    telemetryIngester.ingestStatusPayload({
      timestamp: new Date().toISOString(),
      tokensUsed: 2000,
      contextSize: 6000,
      state: 'SUCCESS',
      escalationTriggered: false,
      taskId: 'task-2',
      trackId: 'track-1',
      diffStatus: 'success'
    });

    // 2. Query metrics to ensure telemetry works
    const metrics = telemetryIngester.queryMetrics({ trackId: 'track-1' });
    expect(metrics.length).toBe(2);
    expect(metrics[0].state).toBe('ERROR');

    // 3. Trigger synthesis
    const skills = await skillSynthesizer.runAnalysis();
    expect(skills.length).toBeGreaterThan(0);

    // 4. Verify output files
    const files = await fs.readdir(testSkillsDir);
    expect(files.length).toBeGreaterThan(0);
    const content = await fs.readFile(path.join(testSkillsDir, files[0]), 'utf8');
    expect(content).toContain('---');
    expect(content).toContain('name:');
  });
});
