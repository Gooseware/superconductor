import * as path from 'node:path';
import prompts from 'prompts';
import { IntelligenceSnapshotReader, RepoContext } from '../intelligence/snapshot-reader.js';
import { DAGResolver } from '../intelligence/dag-resolver.js';
import { TrackEntryYaml } from '../schema/track-manifest.js';

export interface InteractiveOrchestratorOptions {
  outputDir?: string;
  projectRoot?: string;
  promptFn?: (options: any) => Promise<any>;
  snapshotReader?: typeof IntelligenceSnapshotReader;
  dagResolver?: typeof DAGResolver;
  logger?: {
    log: (msg: string) => void;
    error: (msg: string) => void;
  };
}

export interface InteractiveResult {
  mode: 'interactive';
  selectedTracks: TrackEntryYaml[];
  executionOrder: TrackEntryYaml[];
  sortedTrackIds: string[];
  cancelled?: boolean;
}

export class InteractiveOrchestrator {
  private outputDir: string;
  private projectRoot: string;
  private promptFn: (options: any) => Promise<any>;
  private snapshotReader: typeof IntelligenceSnapshotReader;
  private dagResolver: typeof DAGResolver;
  private logger: { log: (msg: string) => void; error: (msg: string) => void };
  private options: InteractiveOrchestratorOptions;

  constructor(options: InteractiveOrchestratorOptions = {}) {
    this.options = options;
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.outputDir = options.outputDir ?? path.join(this.projectRoot, 'superconductor', '.intelligence');
    this.promptFn = options.promptFn ?? prompts;
    this.snapshotReader = options.snapshotReader ?? IntelligenceSnapshotReader;
    this.dagResolver = options.dagResolver ?? DAGResolver;
    this.logger = options.logger ?? console;
  }

  public async run(args: string[] = []): Promise<InteractiveResult> {
    let parsedProjectRoot: string | undefined;
    let parsedOutputDir: string | undefined;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--project-root') {
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          parsedProjectRoot = args[++i];
        }
      } else if (arg.startsWith('--project-root=')) {
        parsedProjectRoot = arg.slice('--project-root='.length);
      } else if (arg === '--output-dir') {
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          parsedOutputDir = args[++i];
        }
      } else if (arg.startsWith('--output-dir=')) {
        parsedOutputDir = arg.slice('--output-dir='.length);
      }
    }

    const projectRoot = parsedProjectRoot ?? this.projectRoot;
    const outputDir = parsedOutputDir ?? (parsedProjectRoot && !this.options.outputDir ? path.join(parsedProjectRoot, 'superconductor', '.intelligence') : this.outputDir);

    const context: RepoContext | null = this.snapshotReader.load(outputDir, projectRoot);

    if (!context || !context.tracks || context.tracks.length === 0) {
      this.logger.log('⚠️  No tracks found in intelligence snapshot or tracks.yaml.');
      return {
        mode: 'interactive',
        selectedTracks: [],
        executionOrder: [],
        sortedTrackIds: [],
      };
    }

    const choices = context.tracks.map((track) => {
      const depsStr = track.deps && track.deps.length > 0 ? ` (deps: ${track.deps.join(', ')})` : '';
      return {
        title: track.name || track.trackId,
        description: `[id: ${track.trackId}] status: ${track.status}${depsStr}`,
        value: track.trackId,
        selected: track.status === 'planned' || track.status === 'in_progress',
      };
    });

    this.logger.log('\n⚡ Superconductor Interactive Orchestrator');
    if (context.driftBanner) {
      this.logger.log(`  ${context.driftBanner}`);
    }

    const response = await this.promptFn({
      type: 'multiselect',
      name: 'selectedTrackIds',
      message: 'Select tracks to execute:',
      choices,
      instructions: false,
    });

    const selectedIds: string[] = response?.selectedTrackIds || [];

    if (!response || !Array.isArray(response.selectedTrackIds) || selectedIds.length === 0) {
      this.logger.log('🛑 No tracks selected or prompt cancelled.');
      return {
        mode: 'interactive',
        cancelled: true,
        selectedTracks: [],
        executionOrder: [],
        sortedTrackIds: [],
      };
    }

    const selectedTracks = context.tracks.filter((t) => selectedIds.includes(t.trackId));

    const executionOrder = this.dagResolver.sort<TrackEntryYaml>(selectedTracks, {
      getId: (t) => t.trackId,
      getDeps: (t) => t.deps,
      onMissingDependency: 'ignore',
    });

    const sortedTrackIds = executionOrder.map((t) => t.trackId);

    this.logger.log(`\n📋 Final Execution Order (${executionOrder.length} tracks):`);
    executionOrder.forEach((t, i) => {
      const depsStr = t.deps && t.deps.length > 0 ? ` (deps: ${t.deps.join(', ')})` : '';
      this.logger.log(`  ${i + 1}. ${t.name || t.trackId} [id: ${t.trackId}]${depsStr}`);
    });

    return {
      mode: 'interactive',
      selectedTracks,
      executionOrder,
      sortedTrackIds,
    };
  }

  public static async run(
    args: string[] = [],
    options: InteractiveOrchestratorOptions = {}
  ): Promise<InteractiveResult> {
    const orchestrator = new InteractiveOrchestrator(options);
    return orchestrator.run(args);
  }
}
