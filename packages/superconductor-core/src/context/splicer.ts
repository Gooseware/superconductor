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
      const trackDir = path.join(this.projectRoot, 'superconductor', 'tracks', trackId);
      
      let metadata = {};
      const metadataPath = path.join(trackDir, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        try {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        } catch (e) {
          // ignore
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
    return markdown
      .replace(/<!--[\s\S]*?-->/g, '') // remove HTML comments
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
