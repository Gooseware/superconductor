import * as path from 'node:path';
import { IntelligenceSnapshotReader } from '../intelligence/snapshot-reader.js';
import { DAGResolver, DAGResolverOptions } from '../intelligence/dag-resolver.js';
import type { TrackEntryYaml } from '../schema/track-manifest.js';

export interface ParsedHeadlessArgs {
  trackIds: string[];
  projectRoot?: string;
  outputDir?: string;
}

export function parseHeadlessArgs(args: string[]): ParsedHeadlessArgs {
  const trackIds: string[] = [];
  let projectRoot: string | undefined;
  let outputDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--project-root') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        projectRoot = args[++i];
      }
      continue;
    }
    if (arg.startsWith('--project-root=')) {
      projectRoot = arg.slice('--project-root='.length);
      continue;
    }

    if (arg === '--output-dir') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        outputDir = args[++i];
      }
      continue;
    }
    if (arg.startsWith('--output-dir=')) {
      outputDir = arg.slice('--output-dir='.length);
      continue;
    }

    if (arg === '--tracks' || arg === '-t') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        const rawTracks = args[++i];
        const splitTracks = rawTracks.split(',').map(s => s.trim()).filter(Boolean);
        trackIds.push(...splitTracks);
      }
      continue;
    }
    if (arg.startsWith('--tracks=') || arg.startsWith('-t=')) {
      const eqIdx = arg.indexOf('=');
      const rawTracks = arg.slice(eqIdx + 1);
      const splitTracks = rawTracks.split(',').map(s => s.trim()).filter(Boolean);
      trackIds.push(...splitTracks);
      continue;
    }

    if (arg.startsWith('-')) {
      continue;
    }

    const splitTracks = arg.split(',').map(s => s.trim()).filter(Boolean);
    trackIds.push(...splitTracks);
  }

  const uniqueTrackIds = Array.from(new Set(trackIds));
  return { trackIds: uniqueTrackIds, projectRoot, outputDir };
}

export interface HeadlessOrchestratorOptions {
  projectRoot?: string;
  outputDir?: string;
  onMissingDependency?: 'error' | 'ignore';
  dagOptions?: DAGResolverOptions<TrackEntryYaml>;
}

export interface HeadlessOrchestrationResult {
  mode: 'headless';
  tracks: TrackEntryYaml[];
  executionOrder: TrackEntryYaml[];
  trackIds: string[];
}

export class HeadlessOrchestrator {
  private projectRoot?: string;
  private outputDir?: string;
  private options?: HeadlessOrchestratorOptions;

  constructor(options: HeadlessOrchestratorOptions = {}) {
    this.projectRoot = options.projectRoot;
    this.outputDir = options.outputDir;
    this.options = options;
  }

  public async run(args: string[] = process.argv.slice(2)): Promise<HeadlessOrchestrationResult> {
    const parsed = parseHeadlessArgs(args);

    if (parsed.trackIds.length === 0) {
      throw new Error('No tracks specified for headless execution');
    }

    const resolvedProjectRoot = parsed.projectRoot ?? this.projectRoot ?? process.cwd();
    const resolvedOutputDir = parsed.outputDir ?? this.outputDir ?? path.join(resolvedProjectRoot, 'superconductor');

    const snapshot = IntelligenceSnapshotReader.load(resolvedOutputDir, resolvedProjectRoot);
    const availableTracks = snapshot?.tracks ?? [];

    const requestedTracks: TrackEntryYaml[] = [];
    for (const trackId of parsed.trackIds) {
      const found = availableTracks.find(t => t.trackId === trackId || (t as any).id === trackId);
      if (!found) {
        throw new Error(`Track not found: ${trackId}`);
      }
      requestedTracks.push(found);
    }

    const dagOptions: DAGResolverOptions<TrackEntryYaml> = {
      onMissingDependency: this.options?.onMissingDependency ?? 'ignore',
      ...this.options?.dagOptions,
    };

    const executionOrder = DAGResolver.sort<TrackEntryYaml>(requestedTracks, dagOptions);

    return {
      mode: 'headless',
      tracks: requestedTracks,
      executionOrder,
      trackIds: executionOrder.map(t => t.trackId),
    };
  }

  public static async run(
    args: string[] = process.argv.slice(2),
    options: HeadlessOrchestratorOptions = {}
  ): Promise<HeadlessOrchestrationResult> {
    const orchestrator = new HeadlessOrchestrator(options);
    return orchestrator.run(args);
  }
}
