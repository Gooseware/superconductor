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
    let dependencies: string[] = [];
    let benefitScore = 0;

    if (fs.existsSync(metadataPath)) {
      try {
        const content = fs.readFileSync(metadataPath, 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data.dependencies)) {
          dependencies = data.dependencies;
        }
        if (typeof data.benefitScore === 'number') {
          benefitScore = data.benefitScore;
        } else if (typeof data.benefit_score === 'number') {
          benefitScore = data.benefit_score;
        }
      } catch (err) {
        // ignore parse error
      }
    }
    
    // Optionally parse spec.md if we wanted to extract from markdown, but metadata.json is standard.

    return {
      trackId,
      dependencies,
      benefitScore
    };
  }
}
