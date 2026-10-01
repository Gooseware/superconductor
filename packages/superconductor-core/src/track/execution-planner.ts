import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

export interface TrackPlanData {
  trackId: string;
  dependencies: string[];
  benefitScore: number;
}

export class ExecutionPlanner {
  public static planWaves(tracks: TrackPlanData[]): TrackPlanData[][] {
    const waves: TrackPlanData[][] = [];
    let remaining = [...tracks];
    const completed = new Set<string>();

    // Create a set of track IDs in the current execution batch to ignore external dependencies
    const validTrackIds = new Set(tracks.map(t => t.trackId));

    while (remaining.length > 0) {
      // Find all tracks whose dependencies are satisfied (either completed in earlier waves or external)
      const waveCandidates = remaining.filter(t => {
        return t.dependencies.every(dep => {
          if (!validTrackIds.has(dep)) return true; // Ignore external dependency
          return completed.has(dep);
        });
      });

      if (waveCandidates.length === 0) {
        throw new Error('Cyclical dependencies detected among tracks.');
      }

      // Sort tracks within the wave by benefitScore descending
      waveCandidates.sort((a, b) => b.benefitScore - a.benefitScore);

      waves.push(waveCandidates);

      // Mark all tracks in the wave as completed for subsequent waves
      const candidateIds = new Set(waveCandidates.map(t => t.trackId));
      for (const id of candidateIds) {
        completed.add(id);
      }
      remaining = remaining.filter(t => !candidateIds.has(t.trackId));
    }

    return waves;
  }

  public static plan(tracks: TrackPlanData[]): TrackPlanData[] {
    return ExecutionPlanner.planWaves(tracks).flat();
  }

  public static async loadTrackData(projectRoot: string, trackId: string): Promise<TrackPlanData> {
    if (!trackId || !/^[a-zA-Z0-9_\-]+$/.test(trackId)) {
      throw new Error('Invalid track ID: path traversal characters prohibited');
    }

    const tracksDir = path.resolve(projectRoot, 'superconductor', 'tracks');
    const resolvedPath = path.resolve(tracksDir, trackId, 'metadata.json');
    if (!resolvedPath.startsWith(tracksDir + path.sep)) {
      throw new Error('Track metadata path escapes tracks directory');
    }

    const yamlPath = path.join(projectRoot, 'superconductor', 'tracks.yaml');
    let dependencies: string[] = [];
    let benefitScore = 0;

    if (fs.existsSync(yamlPath)) {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      const doc = yaml.load(content) as any;
      const tracksArray = Array.isArray(doc) ? doc : (doc?.tracks ? doc.tracks : []);
      if (Array.isArray(tracksArray)) {
        const track = tracksArray.find((t: any) => t.id === trackId);
        if (track && Array.isArray(track.deps)) {
          dependencies = track.deps;
        }
      }
    }

    if (fs.existsSync(resolvedPath)) {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const data = JSON.parse(content);
      if (typeof data.benefitScore === 'number') {
        benefitScore = data.benefitScore;
      } else if (typeof data.benefit_score === 'number') {
        benefitScore = data.benefit_score;
      }
      if (dependencies.length === 0) {
        if (Array.isArray(data.dependencies)) {
          dependencies = data.dependencies;
        } else if (Array.isArray(data.deps)) {
          dependencies = data.deps;
        }
      }
    }
    
    return {
      trackId,
      dependencies,
      benefitScore
    };
  }
}
