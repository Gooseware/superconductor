import { TopographyMap, DomainPartition, Hotspot, CoverageGap } from './topography-map.js';
import * as fs from 'fs';
import * as path from 'path';

export class DomainPartitioner {
    constructor(private map: TopographyMap) {}

    partition(projectRoot: string = process.cwd()): DomainPartition[] {
        const graph = this.map.getDependencyGraph();
        const hotspots = this.map.getHotspots();
        const coverageGaps = this.map.getCoverageGaps();

        const graphifyFile = path.join(projectRoot, 'superconductor', 'intelligence', '09_graphify_graph.json');
        const communitiesMap = new Map<string, string>();

        if (fs.existsSync(graphifyFile)) {
            let data: any;
            try {
                data = JSON.parse(fs.readFileSync(graphifyFile, 'utf8'));
            } catch (e: any) {
                throw new Error(
                    `[DomainPartitioner] Failed to parse 09_graphify_graph.json: ${e.message}. ` +
                    'Delete the file and re-run the intelligence pipeline to regenerate it.'
                );
            }
            if (data && Array.isArray(data.nodes)) {
                for (const node of data.nodes) {
                    if (node.source_file && node.community !== undefined) {
                        communitiesMap.set(node.source_file, `community-${node.community}`);
                    }
                }
            }
        }


        const partitionsMap = new Map<string, string[]>();
        
        for (const node of graph.nodes) {
            let partitionKey = communitiesMap.get(node);
            if (!partitionKey) {
                partitionKey = node.split('/')[0] || '.';
            }
            if (!partitionsMap.has(partitionKey)) {
                partitionsMap.set(partitionKey, []);
            }
            partitionsMap.get(partitionKey)!.push(node);
        }

        const partitions: DomainPartition[] = [];
        let idCounter = 1;

        for (const [key, files] of partitionsMap.entries()) {
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
                id: key.startsWith('community-') ? key : `domain-${idCounter++}`,
                files,
                hotspotScore: totalHotspotScore,
                coverageGapPercent: gapCount > 0 ? totalCoverageGap / gapCount : 0,
            });
        }

        this.map.setPartitions(partitions);
        return partitions;
    }
}
