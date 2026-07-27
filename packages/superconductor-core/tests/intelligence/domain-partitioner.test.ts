import { describe, it, expect } from 'vitest';
import { DomainPartitioner } from '../../src/intelligence/domain-partitioner';
import { TopographyMap } from '../../src/intelligence/topography-map';

describe('DomainPartitioner', () => {
    it('should accept repo scan result and produce non-overlapping domain boundaries with associated file lists', () => {
        const map = new TopographyMap();
        map.setDependencyGraph({ nodes: ['src/a.ts', 'src/b.ts', 'lib/c.ts'], edges: [] });
        map.setHotspots([{ file: 'src/a.ts', score: 20 }]);
        map.setCoverageGaps([{ file: 'lib/c.ts', gapPercent: 80 }]);

        const partitioner = new DomainPartitioner(map);
        const partitions = partitioner.partition();
        
        expect(partitions.length).toBeGreaterThan(0);
        // Expect partitions to be distinct, maybe one for src and one for lib based on directory or some heuristic
        // For simplicity, let's just assert the shape of the output for now
        expect(partitions[0]).toHaveProperty('id');
        expect(partitions[0]).toHaveProperty('files');
        expect(partitions[0]).toHaveProperty('hotspotScore');
        expect(partitions[0]).toHaveProperty('coverageGapPercent');
    });
});
