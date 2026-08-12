import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DomainScore {
  domain: string;
  files: string[];
  hotspot_score: number;
  fan_in: number;
  git_churn_90d: number;
  priority_score: number; // 0.4*hotspot + 0.35*fan_in + 0.25*churn
}

export async function scoreDomains(intelligenceDir: string): Promise<DomainScore[]> {
  if (!intelligenceDir || !fs.existsSync(intelligenceDir)) {
    return [];
  }

  const domainDataFile = path.join(intelligenceDir, 'domain_data.json');
  const domainScoresFile = path.join(intelligenceDir, 'domain_scores.json');
  const topographyFile = path.join(intelligenceDir, 'topography.json');

  let rawDomains: Array<{
    domain?: string;
    id?: string;
    files?: string[];
    hotspot_score?: number;
    hotspotScore?: number;
    fan_in?: number;
    fanIn?: number;
    git_churn_90d?: number;
    gitChurn90d?: number;
  }> = [];

  const targetFile = fs.existsSync(domainDataFile)
    ? domainDataFile
    : fs.existsSync(domainScoresFile)
    ? domainScoresFile
    : fs.existsSync(topographyFile)
    ? topographyFile
    : null;

  if (targetFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      if (Array.isArray(parsed)) {
        rawDomains = parsed;
      } else if (parsed && Array.isArray(parsed.partitions)) {
        rawDomains = parsed.partitions.map((p: any) => ({
          domain: p.id || p.domain,
          files: p.files || [],
          hotspot_score: p.hotspotScore ?? p.hotspot_score ?? 0,
          fan_in: p.fanIn ?? p.fan_in ?? 0,
          git_churn_90d: p.gitChurn90d ?? p.git_churn_90d ?? 0,
        }));
      }
    } catch {
      return [];
    }
  }

  const scores: DomainScore[] = rawDomains.map((d) => {
    const domainName = d.domain || d.id || 'unknown';
    const files = d.files || [];
    const hotspot_score = d.hotspot_score ?? d.hotspotScore ?? 0;
    const fan_in = d.fan_in ?? d.fanIn ?? 0;
    const git_churn_90d = d.git_churn_90d ?? d.gitChurn90d ?? 0;
    
    const priority_score = 0.4 * hotspot_score + 0.35 * fan_in + 0.25 * git_churn_90d;

    return {
      domain: domainName,
      files,
      hotspot_score,
      fan_in,
      git_churn_90d,
      priority_score,
    };
  });

  scores.sort((a, b) => b.priority_score - a.priority_score);

  return scores;
}
