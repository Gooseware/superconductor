import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { IntelligenceDriftMonitor } from './drift-monitor.js';
import { trackManifestSchema, TrackEntryYaml } from '../schema/track-manifest.js';

export interface RepoContext {
  hotspotMap: Map<string, { hotspot_score: number; cyclomatic_complexity: number; }>;
  testGapMap: Map<string, { risk: 'HIGH' | 'MEDIUM' | 'LOW'; gitChurnScore: number; }>;
  sastFindings: Map<string, Array<{ rule_id: string; severity: string; message: string; }>>;
  driftState: 'LIVE' | 'STALE' | 'NONE';
  driftBanner: string; // the formatted banner string
  snapshotAge?: number; // ms
  commitsBehind?: number;
  fanOutMap?: Map<string, number>;
  couplingMap?: Map<string, string[]>;
  dependencySurfaceMap?: Map<string, number>;
  tracks?: TrackEntryYaml[];
}

export class IntelligenceSnapshotReader {
  public static readonly NONE_BANNER = '❌  Intelligence: NONE (keyword heuristics active · run /superconductor:setup for surgical precision)';

  private static cache = new Map<string, {
    context: RepoContext;
    timestamp: number;
    lastCommitSha: string;
  }>();

  public static clearCache() {
    this.cache.clear();
  }

  public static parseTracksYaml(yamlContent: string): TrackEntryYaml[] {
    try {
      // Secure YAML parsing: JSON_SCHEMA disables code execution and custom tags
      const parsedRaw = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
      const validated = trackManifestSchema.safeParse(parsedRaw);
      return validated.success ? validated.data.tracks : [];
    } catch {
      return [];
    }
  }

  static load(outputDir: string, projectRoot?: string): RepoContext | null {
    const manifestPath = path.join(outputDir, '00_manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return null; // NONE state
    }

    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Normalize manifest fields: support both legacy (last_commit / incremental_runs)
      // and canonical (lastCommitSha / incrementalRuns) field names.
      const manifest = {
        lastCommitSha: raw.lastCommitSha ?? raw.last_commit,
        timestamp: typeof raw.timestamp === 'number'
          ? raw.timestamp
          : new Date(raw.timestamp).getTime(),
        incrementalRuns: raw.incrementalRuns ?? raw.incremental_runs ?? 0,
      };

      // Derive projectRoot: fall back to the directory two levels above outputDir when
      // not supplied (best-effort; caller should always pass it explicitly).
      const root = projectRoot ?? path.resolve(outputDir, '..', '..');

      const report = IntelligenceDriftMonitor.checkDrift(manifest, root);

      const driftState: 'LIVE' | 'STALE' | 'NONE' = report.isDrifted ? 'STALE' : 'LIVE';
      const driftBanner = report.banner;
      const commitsBehind = report.commitsBehind === Infinity
        ? Number.POSITIVE_INFINITY
        : report.commitsBehind;

      // Load & validate tracks.yaml if present
      let tracks: TrackEntryYaml[] | undefined = undefined;
      const tracksYamlPath = path.join(root, 'superconductor', 'tracks.yaml');
      const altTracksYamlPath = path.join(outputDir, 'tracks.yaml');
      const targetYamlPath = fs.existsSync(tracksYamlPath)
        ? tracksYamlPath
        : (fs.existsSync(altTracksYamlPath) ? altTracksYamlPath : null);

      if (targetYamlPath) {
        try {
          const yamlContent = fs.readFileSync(targetYamlPath, 'utf8');
          tracks = this.parseTracksYaml(yamlContent);
        } catch {
          tracks = [];
        }
      }

      const cached = this.cache.get(outputDir);
      if (
        cached &&
        cached.timestamp === manifest.timestamp &&
        cached.lastCommitSha === manifest.lastCommitSha
      ) {
        return {
          ...cached.context,
          driftState,
          driftBanner,
          snapshotAge: report.snapshotAgeMs,
          commitsBehind,
          tracks: tracks ?? cached.context.tracks
        };
      }

      const hotspotMap = new Map<string, { hotspot_score: number; cyclomatic_complexity: number; }>();
      const complexityPath = path.join(outputDir, '03_complexity.json');
      if (fs.existsSync(complexityPath)) {
        const complexityData = JSON.parse(fs.readFileSync(complexityPath, 'utf8'));
        if (Array.isArray(complexityData)) {
          for (const item of complexityData) {
            if (item.file) {
              hotspotMap.set(item.file, {
                hotspot_score: item.hotspot_score || 0,
                cyclomatic_complexity: item.cyclomatic_complexity || 0
              });
            }
          }
        }
      }

      const sastFindings = new Map<string, Array<{ rule_id: string; severity: string; message: string; }>>();
      const sastPath = path.join(outputDir, '05_sast.json');
      if (fs.existsSync(sastPath)) {
        const sastData = JSON.parse(fs.readFileSync(sastPath, 'utf8'));
        if (Array.isArray(sastData)) {
          for (const item of sastData) {
            if (item.file && item.findings && Array.isArray(item.findings)) {
              sastFindings.set(item.file, item.findings);
            }
          }
        }
      }

      const testGapMap = new Map<string, { risk: 'HIGH' | 'MEDIUM' | 'LOW'; gitChurnScore: number; }>();
      const testGapsPath = path.join(outputDir, '07_test_gaps.json');
      if (fs.existsSync(testGapsPath)) {
        const testGapsData = JSON.parse(fs.readFileSync(testGapsPath, 'utf8'));
        if (Array.isArray(testGapsData)) {
          for (const item of testGapsData) {
            if (item.file) {
              testGapMap.set(item.file, {
                risk: item.risk || 'LOW',
                gitChurnScore: item.gitChurnScore || 0
              });
            }
          }
        }
      }

      const fanOutMap = new Map<string, number>();
      try {
        const depPath = path.join(outputDir, '02_dependency_graph.json');
        if (fs.existsSync(depPath)) {
          const depData = JSON.parse(fs.readFileSync(depPath, 'utf-8'));
          if (depData.edges && Array.isArray(depData.edges)) {
            for (const edge of depData.edges) {
              if (edge && edge.from) {
                fanOutMap.set(edge.from, (fanOutMap.get(edge.from) ?? 0) + 1);
              }
            }
          }
        }
      } catch { /* degrade gracefully */ }

      const couplingMap = new Map<string, string[]>();
      try {
        const couplingPath = path.join(outputDir, '04_coupling.json');
        if (fs.existsSync(couplingPath)) {
          const couplingData = JSON.parse(fs.readFileSync(couplingPath, 'utf-8'));
          if (Array.isArray(couplingData)) {
            for (const entry of couplingData) {
              if (entry.file && Array.isArray(entry.dependents)) {
                couplingMap.set(entry.file, entry.dependents);
              }
            }
          }
        }
      } catch { /* degrade gracefully */ }

      const dependencySurfaceMap = new Map<string, number>();
      try {
        const depSurfacePath = path.join(outputDir, '08_dependency_surface.json');
        if (fs.existsSync(depSurfacePath)) {
          const depSurfaceData = JSON.parse(fs.readFileSync(depSurfacePath, 'utf-8'));
          if (depSurfaceData.heatmap && typeof depSurfaceData.heatmap === 'object') {
            for (const [key, value] of Object.entries(depSurfaceData.heatmap)) {
              if (typeof value === 'number') {
                dependencySurfaceMap.set(key, value);
              }
            }
          }
        }
      } catch { /* degrade gracefully */ }

      const context: RepoContext = {
        hotspotMap,
        testGapMap,
        sastFindings,
        driftState,
        driftBanner,
        snapshotAge: report.snapshotAgeMs,
        commitsBehind,
        fanOutMap,
        couplingMap,
        dependencySurfaceMap,
        tracks
      };

      this.cache.set(outputDir, {
        context,
        timestamp: manifest.timestamp,
        lastCommitSha: manifest.lastCommitSha
      });

      return context;
    } catch (e) {
      return null;
    }
  }
}
