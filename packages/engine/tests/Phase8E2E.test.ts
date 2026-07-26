import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SmartModelResolver } from '../src/routing/SmartModelResolver.js';
import { SuperconductorEventEmitter } from '../src/events/SuperconductorEventEmitter.js';
import { ComponentStagingWriter } from '../src/curator/ComponentStagingWriter.js';
import { SuperconductorSensor } from '/home/gooseware/repos/hippos/caduceus/packages/caduceus-plugin/src/SuperconductorSensor.ts';
import { AdaptiveRouter } from '/home/gooseware/repos/hippos/caduceus/packages/caduceus-plugin/src/AdaptiveRouter.ts';
import { StagingWatcher } from '/home/gooseware/repos/hippos/caduceus/packages/mcp-server/src/managers/StagingWatcher.ts';

describe('Phase 8: End-to-End Integration Verification', () => {
  const tmpWorkspace = path.join(process.cwd(), `.tmp-e2e-workspace-${Date.now()}`);
  const tmpStaging = path.join(os.tmpdir(), `e2e-staging-${Date.now()}`);
  const activeModelPath = path.join(os.homedir(), '.gemini', 'active_model.json');

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpWorkspace, 'superconductor'), { recursive: true });
    fs.writeFileSync(path.join(tmpWorkspace, 'superconductor', 'index.md'), '# Index');
    fs.writeFileSync(
      path.join(tmpWorkspace, 'superconductor', 'tracks.md'),
      '- [~] **Track: E2E Symbiosis**\n*Link: [./tracks/e2e_track/](./tracks/e2e_track/)*'
    );
    const trackDir = path.join(tmpWorkspace, 'superconductor', 'tracks', 'e2e_track');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(
      path.join(trackDir, 'plan.md'),
      '## Phase 1: E2E\n- [ ] Task: Complete full symbiosis loop [TIER-4] [AGENT:caduceus-oracle]'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
    fs.rmSync(tmpStaging, { recursive: true, force: true });
  });

  it('executes full cross-repo symbiosis workflow seamlessly', async () => {
    // 1. Superconductor engine resolves active model
    const resolver = new SmartModelResolver({ activeModelPath });
    const { selection } = await resolver.resolve('tier4');
    expect(selection.tier).toBe('tier4');

    // 2. Caduceus sensor detects workspace & active tier
    const sensor = new SuperconductorSensor();
    const scCtx = await sensor.detect(tmpWorkspace);
    expect(scCtx?.activeTier).toBe('tier4');

    // 3. AdaptiveRouter routes to caduceus-oracle based on active tier
    const router = new AdaptiveRouter();
    const role = router.route({ taskType: 'any' }, scCtx);
    expect(role).toBe('caduceus-oracle');

    // 4. Superconductor emits AgentTurnEvent (mock fetch success)
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const emitter = new SuperconductorEventEmitter({ caduceusApiUrl: 'http://localhost:1691' });
    const emitResult = await emitter.emit({
      id: 'e2e_evt_1',
      eventType: 'task_completed',
      sessionId: 'e2e_sess',
      trackId: 'e2e_track',
      phase: 'Phase 1',
      taskDescription: 'E2E test task',
      modelUsed: selection.model,
      taskType: 'feature',
      success: true,
      timestamp: new Date().toISOString()
    });
    expect(emitResult).toBe(true);

    // 5. Superconductor stages reusable component & Caduceus ingests
    const writer = new ComponentStagingWriter(tmpStaging);
    const writeOk = await writer.write({
      componentId: 'test-component',
      trackId: 'e2e_track',
      timestamp: new Date().toISOString(),
      metadata: { type: 'molecule', description: 'E2E Component', tags: ['e2e'], dependencies: [] },
      files: [{ path: 'E2EComponent.tsx', content: 'export const E2EComponent = () => null;' }]
    });
    expect(writeOk).toBe(true);

    await new Promise(r => setTimeout(r, 150));
    const watcher = new StagingWatcher(tmpStaging);
    const watchResult = await watcher.processStaging();
    expect(watchResult.processed).toBe(1);
  });
});
