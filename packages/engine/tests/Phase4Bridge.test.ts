import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ComponentStagingWriter } from '../src/curator/ComponentStagingWriter.js';
import { StagingWatcher } from '/home/gooseware/repos/hippos/caduceus/packages/mcp-server/src/managers/StagingWatcher.ts';

describe('Phase 4: Component Staging Bridge', () => {
  const tmpStaging = path.join(os.tmpdir(), `staging-bridge-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpStaging, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpStaging, { recursive: true, force: true });
  });

  it('writes staged component atomically and ingests via watcher', async () => {
    const writer = new ComponentStagingWriter(tmpStaging);
    const success = await writer.write({
      componentId: 'comp_button_1',
      trackId: 'track_test',
      timestamp: new Date().toISOString(),
      metadata: {
        type: 'atom',
        description: 'Mock Button',
        tags: ['ui'],
        dependencies: []
      },
      files: [{ path: 'Button.tsx', content: 'export const Button = () => null;' }]
    });

    expect(success).toBe(true);

    const watcher = new StagingWatcher(tmpStaging);
    const result = await watcher.processStaging(async (manifest) => {
      expect(manifest.componentId).toBe('comp_button_1');
    });

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
  });
});
