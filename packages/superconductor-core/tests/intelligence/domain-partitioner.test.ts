import { describe, it, expect, vi, afterEach } from 'vitest';
import { DomainPartitioner } from '../../src/intelligence/domain-partitioner';
import { TopographyMap } from '../../src/intelligence/topography-map';
import * as fs from 'fs';
import * as path from 'path';

describe('DomainPartitioner', () => {
    const testIntelligenceDir = path.join(__dirname, 'test-intelligence');

    afterEach(() => {
        if (fs.existsSync(testIntelligenceDir)) {
            fs.rmSync(testIntelligenceDir, { recursive: true, force: true });
        }
    });

    it('should fallback to directory split when graphify graph is missing', () => {
        const map = new TopographyMap();
        map.setDependencyGraph({ nodes: ['src/a.ts', 'src/b.ts', 'lib/c.ts'], edges: [] });
        map.setHotspots([{ file: 'src/a.ts', score: 20 }]);
        map.setCoverageGaps([{ file: 'lib/c.ts', gapPercent: 80 }]);

        const partitioner = new DomainPartitioner(map, testIntelligenceDir);
        const partitions = partitioner.partition();
        
        expect(partitions.length).toBe(2);
        const srcPartition = partitions.find(p => p.files.includes('src/a.ts'));
        const libPartition = partitions.find(p => p.files.includes('lib/c.ts'));
        
        expect(srcPartition).toBeDefined();
        expect(srcPartition!.id).toContain('domain-');
        expect(srcPartition!.hotspotScore).toBe(20);
        
        expect(libPartition).toBeDefined();
        expect(libPartition!.id).toContain('domain-');
        expect(libPartition!.coverageGapPercent).toBe(80);
    });

    it('should parse 09_graphify_graph.json and group by Leiden community', () => {
        const map = new TopographyMap();
        map.setDependencyGraph({ nodes: ['src/a.ts', 'src/b.ts', 'lib/c.ts'], edges: [] });
        map.setHotspots([]);
        map.setCoverageGaps([]);

        fs.mkdirSync(testIntelligenceDir, { recursive: true });
        const graphifyData = {
            nodes: [
                { id: 'src/a.ts', community: 1 },
                { id: 'src/b.ts', community: 2 },
                { id: 'lib/c.ts', community: 1 }
            ]
        };
        fs.writeFileSync(
            path.join(testIntelligenceDir, '09_graphify_graph.json'),
            JSON.stringify(graphifyData)
        );

        const partitioner = new DomainPartitioner(map, testIntelligenceDir);
        const partitions = partitioner.partition();
        
        expect(partitions.length).toBe(2); // communities 1 and 2
        
        const comm1 = partitions.find(p => p.id === 'leiden-community-1');
        const comm2 = partitions.find(p => p.id === 'leiden-community-2');

        expect(comm1).toBeDefined();
        expect(comm1!.files).toEqual(['src/a.ts', 'lib/c.ts']);
        
        expect(comm2).toBeDefined();
        expect(comm2!.files).toEqual(['src/b.ts']);
    });
});
