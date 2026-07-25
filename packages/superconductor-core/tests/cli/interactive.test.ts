import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InteractiveOrchestrator, InteractiveOrchestratorOptions } from '../../src/cli/interactive.js';
import { RepoContext } from '../../src/intelligence/snapshot-reader.js';
import { TrackEntryYaml } from '../../src/schema/track-manifest.js';

describe('InteractiveOrchestrator', () => {
  let mockSnapshotReader: { load: ReturnType<typeof vi.fn> };
  let mockPromptFn: ReturnType<typeof vi.fn>;
  let mockLogger: { log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const sampleTracks: TrackEntryYaml[] = [
    {
      trackId: 'track-b',
      name: 'Build Dashboard Component',
      status: 'planned',
      deps: ['track-a'],
      link: './tracks/track-b/',
      spec: './tracks/track-b/spec.md',
      plan: './tracks/track-b/plan.md',
    },
    {
      trackId: 'track-a',
      name: 'Core Design System',
      status: 'completed',
      deps: [],
      link: './tracks/track-a/',
      spec: './tracks/track-a/spec.md',
      plan: './tracks/track-a/plan.md',
    },
    {
      trackId: 'track-c',
      name: 'Analytics Engine',
      status: 'planned',
      deps: ['track-b'],
      link: './tracks/track-c/',
      spec: './tracks/track-c/spec.md',
      plan: './tracks/track-c/plan.md',
    },
  ];

  beforeEach(() => {
    mockSnapshotReader = {
      load: vi.fn().mockReturnValue({
        tracks: sampleTracks,
        driftState: 'LIVE',
        driftBanner: 'ℹ️ Intelligence: LIVE',
        hotspotMap: new Map(),
        testGapMap: new Map(),
        sastFindings: new Map(),
      } as RepoContext),
    };

    mockPromptFn = vi.fn().mockResolvedValue({
      selectedTrackIds: ['track-b', 'track-a'],
    });

    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
    };
  });

  it('loads tracks using IntelligenceSnapshotReader and presents a multiselect prompt', async () => {
    const options: InteractiveOrchestratorOptions = {
      projectRoot: '/test/project',
      outputDir: '/test/project/superconductor/.intelligence',
      snapshotReader: mockSnapshotReader as any,
      promptFn: mockPromptFn,
      logger: mockLogger,
    };

    const orchestrator = new InteractiveOrchestrator(options);
    const result = await orchestrator.run();

    expect(mockSnapshotReader.load).toHaveBeenCalledWith(
      '/test/project/superconductor/.intelligence',
      '/test/project'
    );
    expect(mockPromptFn).toHaveBeenCalledTimes(1);

    const promptArgs = mockPromptFn.mock.calls[0][0];
    expect(promptArgs.type).toBe('multiselect');
    expect(promptArgs.name).toBe('selectedTrackIds');
    expect(promptArgs.choices).toHaveLength(3);
    expect(promptArgs.choices[0]).toEqual(
      expect.objectContaining({
        title: 'Build Dashboard Component',
        value: 'track-b',
      })
    );
    expect(result.mode).toBe('interactive');
  });

  it('sorts chosen tracks topologically using DAGResolver', async () => {
    const options: InteractiveOrchestratorOptions = {
      snapshotReader: mockSnapshotReader as any,
      promptFn: mockPromptFn,
      logger: mockLogger,
    };

    // User picked track-b then track-a in prompt, but track-b depends on track-a
    const orchestrator = new InteractiveOrchestrator(options);
    const result = await orchestrator.run();

    expect(result.executionOrder).toBeDefined();
    expect(result.executionOrder.map((t) => t.trackId)).toEqual(['track-a', 'track-b']);
    expect(result.sortedTrackIds).toEqual(['track-a', 'track-b']);
  });

  it('handles missing or empty intelligence snapshot / tracks gracefully', async () => {
    mockSnapshotReader.load.mockReturnValue(null);

    const options: InteractiveOrchestratorOptions = {
      snapshotReader: mockSnapshotReader as any,
      promptFn: mockPromptFn,
      logger: mockLogger,
    };

    const orchestrator = new InteractiveOrchestrator(options);
    const result = await orchestrator.run();

    expect(result.selectedTracks).toEqual([]);
    expect(result.executionOrder).toEqual([]);
    expect(mockPromptFn).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('No tracks found in intelligence snapshot')
    );
  });

  it('handles user prompt cancellation gracefully', async () => {
    mockPromptFn.mockResolvedValue({});

    const options: InteractiveOrchestratorOptions = {
      snapshotReader: mockSnapshotReader as any,
      promptFn: mockPromptFn,
      logger: mockLogger,
    };

    const orchestrator = new InteractiveOrchestrator(options);
    const result = await orchestrator.run();

    expect(result.cancelled).toBe(true);
    expect(result.selectedTracks).toEqual([]);
    expect(result.executionOrder).toEqual([]);
  });

  it('logs execution order cleanly according to design-heuristics formatting', async () => {
    const options: InteractiveOrchestratorOptions = {
      snapshotReader: mockSnapshotReader as any,
      promptFn: mockPromptFn,
      logger: mockLogger,
    };

    const orchestrator = new InteractiveOrchestrator(options);
    await orchestrator.run();

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Final Execution Order')
    );
  });

  it('static run method instantiates and executes InteractiveOrchestrator', async () => {
    const result = await InteractiveOrchestrator.run([], {
      snapshotReader: mockSnapshotReader as any,
      promptFn: mockPromptFn,
      logger: mockLogger,
    });

    expect(result.sortedTrackIds).toEqual(['track-a', 'track-b']);
  });

  it('extracts --project-root and --output-dir from args before loading snapshot', async () => {
    const orchestrator = new InteractiveOrchestrator({
      snapshotReader: mockSnapshotReader as any,
      promptFn: mockPromptFn,
      logger: mockLogger,
    });

    await orchestrator.run(['--project-root', '/custom/proj', '--output-dir', '/custom/out']);

    expect(mockSnapshotReader.load).toHaveBeenCalledWith('/custom/out', '/custom/proj');
  });
});
