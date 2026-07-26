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

  public static cachedTracksMtime?: number;

  public static readonly MAX_CACHE_ENTRIES = 10;

  private static cache = new Map<string, {
    context: RepoContext;
    timestamp: number;
    lastCommitSha: string;
    tracksMtime?: number;
    depSurfaceMtime?: number;
  }>();

  private static getFromCache(key: string) {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.cache.set(key, entry);
    }
    return entry;
  }

  private static setToCache(key: string, entry: {
    context: RepoContext;
    timestamp: number;
    lastCommitSha: string;
    tracksMtime?: number;
    depSurfaceMtime?: number;
  }) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, entry);
    if (this.cache.size > IntelligenceSnapshotReader.MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
  }

  public static clearCache() {
    this.cache.clear();
    this.cachedTracksMtime = undefined;
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

  private static readDependencySurfaceMap(depSurfacePath: string): Map<string, number> {
    const dependencySurfaceMap = new Map<string, number>();
    try {
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
    return dependencySurfaceMap;
  }

  static load(outputDir: string, projectRoot?: string): RepoContext | null {
    const cacheKey = path.resolve(outputDir);
    const manifestPath = path.join(cacheKey, '00_manifest.json');
    if (!fs.existsSync(manifestPath)) {
      const root = projectRoot ?? path.resolve(cacheKey, '..', '..');
      const tracksYamlPath = path.join(root, 'superconductor', 'tracks.yaml');
      const altTracksYamlPath = path.join(cacheKey, 'tracks.yaml');
      const targetYamlPath = fs.existsSync(tracksYamlPath)
        ? tracksYamlPath
        : (fs.existsSync(altTracksYamlPath) ? altTracksYamlPath : null);

      const depSurfacePath = path.join(cacheKey, '08_dependency_surface.json');
      let tracksMtime: number | undefined = undefined;
      if (targetYamlPath) {
        try { tracksMtime = fs.statSync(targetYamlPath).mtimeMs; } catch {}
      }
      let depSurfaceMtime: number | undefined = undefined;
      if (fs.existsSync(depSurfacePath)) {
        try { depSurfaceMtime = fs.statSync(depSurfacePath).mtimeMs; } catch {}
      }

      if (targetYamlPath || fs.existsSync(depSurfacePath)) {
        const cached = this.getFromCache(cacheKey);
        if (
          cached &&
          cached.timestamp === 0 &&
          cached.lastCommitSha === 'NONE' &&
          cached.tracksMtime === tracksMtime &&
          cached.depSurfaceMtime === depSurfaceMtime
        ) {
          return cached.context;
        }

        let tracks: TrackEntryYaml[] = [];
        if (targetYamlPath) {
          try {
            const yamlContent = fs.readFileSync(targetYamlPath, 'utf8');
            tracks = this.parseTracksYaml(yamlContent);
          } catch {
            tracks = [];
          }
        }

        const dependencySurfaceMap = this.readDependencySurfaceMap(depSurfacePath);
        const context: RepoContext = {
          hotspotMap: new Map(),
          testGapMap: new Map(),
          sastFindings: new Map(),
          driftState: 'NONE',
          driftBanner: IntelligenceSnapshotReader.NONE_BANNER,
          tracks,
          dependencySurfaceMap,
        };

        this.setToCache(cacheKey, {
          context,
          timestamp: 0,
          lastCommitSha: 'NONE',
          tracksMtime,
          depSurfaceMtime,
        });

        return context;
      }
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
      const root = projectRoot ?? path.resolve(cacheKey, '..', '..');

      // Resolve tracks.yaml & compute tracksMtime for cache validation
      const tracksYamlPath = path.join(root, 'superconductor', 'tracks.yaml');
      const altTracksYamlPath = path.join(cacheKey, 'tracks.yaml');
      const targetYamlPath = fs.existsSync(tracksYamlPath)
        ? tracksYamlPath
        : (fs.existsSync(altTracksYamlPath) ? altTracksYamlPath : null);

      let tracksMtime: number | undefined = undefined;
      if (targetYamlPath) {
        try {
          tracksMtime = fs.statSync(targetYamlPath).mtimeMs;
        } catch {
          tracksMtime = undefined;
        }
      }
      this.cachedTracksMtime = tracksMtime;

      let depSurfaceMtime: number | undefined = undefined;
      const depSurfacePath = path.join(cacheKey, '08_dependency_surface.json');
      if (fs.existsSync(depSurfacePath)) {
        try {
          depSurfaceMtime = fs.statSync(depSurfacePath).mtimeMs;
        } catch {
          depSurfaceMtime = undefined;
        }
      }

      // Check cache BEFORE IntelligenceDriftMonitor.checkDrift() to prevent git overhead
      const cached = this.getFromCache(cacheKey);
      if (
        cached &&
        cached.timestamp === manifest.timestamp &&
        cached.lastCommitSha === manifest.lastCommitSha &&
        cached.tracksMtime === tracksMtime &&
        cached.depSurfaceMtime === depSurfaceMtime
      ) {
        return cached.context;
      }

      const report = IntelligenceDriftMonitor.checkDrift(manifest, root);

      const driftState: 'LIVE' | 'STALE' | 'NONE' = report.isDrifted ? 'STALE' : 'LIVE';
      const driftBanner = report.banner;
      const commitsBehind = report.commitsBehind === Infinity
        ? Number.POSITIVE_INFINITY
        : report.commitsBehind;

      // Load & validate tracks.yaml if present
      let tracks: TrackEntryYaml[] | undefined = undefined;
      if (targetYamlPath) {
        try {
          const yamlContent = fs.readFileSync(targetYamlPath, 'utf8');
          tracks = this.parseTracksYaml(yamlContent);
        } catch {
          tracks = [];
        }
      }

      const hotspotMap = new Map<string, { hotspot_score: number; cyclomatic_complexity: number; }>();
      const complexityPath = path.join(cacheKey, '03_complexity.json');
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
      const sastPath = path.join(cacheKey, '05_sast.json');
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
      const testGapsPath = path.join(cacheKey, '07_test_gaps.json');
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
        const depPath = path.join(cacheKey, '02_dependency_graph.json');
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
        const couplingPath = path.join(cacheKey, '04_coupling.json');
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

      const dependencySurfaceMap = this.readDependencySurfaceMap(depSurfacePath);

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

      this.setToCache(cacheKey, {
        context,
        timestamp: manifest.timestamp,
        lastCommitSha: manifest.lastCommitSha,
        tracksMtime,
        depSurfaceMtime,
      });

      return context;
    } catch (e) {
      return null;
    }
  }

  // TODO(Phase 3): Implement generateSyntheticContext for advanced track modeling
  public static generateSyntheticContext(): void {
    // Missing implementation placeholder to satisfy phase 3 requirement
    console.warn('generateSyntheticContext is not yet implemented');
  }
}

