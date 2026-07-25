import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TrackPlanData {
  trackId: string;
  dependencies: string[];
  benefitScore: number;
}

export class ExecutionPlanner {
  public static plan(tracks: TrackPlanData[]): TrackPlanData[] {
    const result: TrackPlanData[] = [];
    const remaining = [...tracks];
    
    // Create a set of track IDs in the current execution batch to ignore external dependencies
    const validTrackIds = new Set(tracks.map(t => t.trackId));

    while (remaining.length > 0) {
      // Find all tracks whose dependencies are already in the result, or point to tracks not in the current batch
      const candidates = remaining.filter(t => {
        return t.dependencies.every(dep => {
          if (!validTrackIds.has(dep)) return true; // Ignore external dependency
          return result.some(r => r.trackId === dep);
        });
      });

      if (candidates.length === 0) {
        throw new Error('Cyclical dependencies detected among tracks.');
      }

      // Pick the candidate with the highest benefit score
      candidates.sort((a, b) => b.benefitScore - a.benefitScore);
      const chosen = candidates[0];

      result.push(chosen);
      remaining.splice(remaining.indexOf(chosen), 1);
    }

    return result;
  }

  public static async loadTrackData(projectRoot: string, trackId: string): Promise<TrackPlanData> {
    const metadataPath = path.join(projectRoot, 'superconductor', 'tracks', trackId, 'metadata.json');
    const yamlPath = path.join(projectRoot, 'superconductor', 'tracks.yaml');
    let dependencies: string[] = [];
    let benefitScore = 0;

    if (fs.existsSync(yamlPath)) {
      try {
        const content = fs.readFileSync(yamlPath, 'utf-8');
        // Require js-yaml inline to avoid circular or missing imports at module level if not fully configured
        const yaml = require('js-yaml');
        const doc = yaml.load(content) as any;
        if (doc && Array.isArray(doc.tracks)) {
          const track = doc.tracks.find((t: any) => t.id === trackId);
          if (track && Array.isArray(track.deps)) {
            dependencies = track.deps;
          }
        }
      } catch (err) {
        // ignore parse error
      }
    }

    if (fs.existsSync(metadataPath)) {
      try {
        const content = fs.readFileSync(metadataPath, 'utf-8');
        const data = JSON.parse(content);
        if (typeof data.benefitScore === 'number') {
          benefitScore = data.benefitScore;
        } else if (typeof data.benefit_score === 'number') {
          benefitScore = data.benefit_score;
        }
      } catch (err) {
        // ignore parse error
      }
    }
    
    return {
      trackId,
      dependencies,
      benefitScore
    };
  }
}
