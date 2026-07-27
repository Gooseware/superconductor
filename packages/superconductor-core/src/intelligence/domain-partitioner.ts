import { TopographyMap, DomainPartition, Hotspot, CoverageGap } from './topography-map.js';

export class DomainPartitioner {
    constructor(private map: TopographyMap) {}

    partition(): DomainPartition[] {
        const graph = this.map.getDependencyGraph();
        const hotspots = this.map.getHotspots();
        const coverageGaps = this.map.getCoverageGaps();

        const directories = new Map<string, string[]>();
        
        for (const node of graph.nodes) {
            const dir = node.split('/')[0] || '.';
            if (!directories.has(dir)) {
                directories.set(dir, []);
            }
            directories.get(dir)!.push(node);
        }

        const partitions: DomainPartition[] = [];
        let idCounter = 1;

        for (const [dir, files] of directories.entries()) {
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
                id: `domain-${idCounter++}`,
                files,
                hotspotScore: totalHotspotScore,
                coverageGapPercent: gapCount > 0 ? totalCoverageGap / gapCount : 0,
            });
        }

        this.map.setPartitions(partitions);
        return partitions;
    }
}
