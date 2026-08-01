import * as fs from 'fs';
import * as path from 'path';
import { TopographyMap, DomainPartition, Hotspot, CoverageGap } from './topography-map.js';

export class DomainPartitioner {
    constructor(private map: TopographyMap, private intelligenceDir: string = path.join(process.cwd(), 'superconductor', 'intelligence')) {}

    partition(): DomainPartition[] {
        const graph = this.map.getDependencyGraph();
        const hotspots = this.map.getHotspots();
        const coverageGaps = this.map.getCoverageGaps();

        const groups = new Map<string, string[]>();
        let usedGraphify = false;

        const graphifyFile = path.join(this.intelligenceDir, '09_graphify_graph.json');
        if (fs.existsSync(graphifyFile)) {
            try {
                const stats = fs.statSync(graphifyFile);
                if (stats.size > 50 * 1024 * 1024) {
                    console.warn(`[DomainPartitioner] File too large (${stats.size} bytes). Skipping to prevent memory leak.`);
                } else {
                    const data = JSON.parse(fs.readFileSync(graphifyFile, 'utf8'));
                    if (data && data.nodes && Array.isArray(data.nodes)) {
                        for (const node of data.nodes) {
                            if (node.id && node.community !== undefined) {
                                const comm = String(node.community);
                                if (!groups.has(comm)) {
                                    groups.set(comm, []);
                                }
                                groups.get(comm)!.push(node.id);
                            }
                        }
                        if (groups.size > 0) {
                            usedGraphify = true;
                        }
                    }
                }
            } catch (e) {
                console.warn(`[DomainPartitioner] Failed to parse JSON, falling back to directory split: ${e}`);
                // fallback to directory split
            }
        }

        if (!usedGraphify) {
            groups.clear();
            for (const node of graph.nodes) {
                const dir = node.split('/')[0] || '.';
                if (!groups.has(dir)) {
                    groups.set(dir, []);
                }
                groups.get(dir)!.push(node);
            }
        }

        const partitions: DomainPartition[] = [];
        let idCounter = 1;

        for (const [key, files] of groups.entries()) {
            let totalHotspotScore = 0;
            let totalCoverageGap = 0;
            let gapCount = 0;

            for (const file of files) {
                const hotspot = hotspots.find((h: Hotspot) => h.file === file);
                if (hotspot) {
                    totalHotspotScore += hotspot.score;
                }

                const gap = coverageGaps.find((g: CoverageGap) => g.file === file);
                if (gap) {
                    totalCoverageGap += gap.gapPercent;
                    gapCount++;
                }
            }

            partitions.push({
                id: usedGraphify ? `leiden-community-${key}` : `domain-${idCounter++}`,
                files,
                hotspotScore: totalHotspotScore,
                coverageGapPercent: gapCount > 0 ? totalCoverageGap / gapCount : 0,
            });
        }

        this.map.setPartitions(partitions);
        return partitions;
    }
}
