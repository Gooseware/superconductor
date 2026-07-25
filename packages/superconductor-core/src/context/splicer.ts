import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SplicedTrackContent {
  trackId: string;
  metadata: any;
  specSummary: string;
  planSummary: string;
}

export class TrackSplicer {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  public spliceTracks(trackIds: string[]): string {
    const spliced: SplicedTrackContent[] = [];

    for (const trackId of trackIds) {
      if (!/^[a-zA-Z0-9_-]+$/.test(trackId)) {
        console.warn(`Warning: invalid trackId format: ${trackId}`);
        continue;
      }
      const trackDir = path.join(this.projectRoot, 'superconductor', 'tracks', trackId);
      
      let metadata = {};
      const metadataPath = path.join(trackDir, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        } catch (e) {
          console.warn(`Warning: failed to parse metadata.json for track ${trackId}`);
        }
      }

      let specSummary = '';
      const specPath = path.join(trackDir, 'spec.md');
      if (fs.existsSync(specPath)) {
        specSummary = this.compressMarkdown(fs.readFileSync(specPath, 'utf-8'));
      }

      let planSummary = '';
      const planPath = path.join(trackDir, 'plan.md');
      if (fs.existsSync(planPath)) {
        planSummary = this.compressMarkdown(fs.readFileSync(planPath, 'utf-8'));
      }

      spliced.push({
        trackId,
        metadata,
        specSummary,
        planSummary
      });
    }

    return JSON.stringify(spliced);
  }

  private compressMarkdown(markdown: string): string {
    let compressed = markdown
      .replace(/<!--[\s\S]*?-->/g, '') // remove HTML comments
      .replace(/\s+/g, ' ')
      .trim();
    if (compressed.length > 2000) {
      compressed = compressed.substring(0, 2000) + '...';
    }
    return compressed;
  }
}
