import { describe, it, expect } from 'vitest';
import { TopographyMap } from '../../src/intelligence/topography-map';

describe('TopographyMap', () => {
    it('should serialize domain partitions, dependency graph, hotspots, test coverage gaps, and findings queue', () => {
        const map = new TopographyMap();
        map.addPartition({ id: 'domain-a', files: ['a.ts'], hotspotScore: 10, coverageGapPercent: 50 });
        map.setDependencyGraph({ nodes: ['a.ts', 'b.ts'], edges: [{ from: 'a.ts', to: 'b.ts' }] });
        map.setHotspots([{ file: 'a.ts', score: 10 }]);
        map.setCoverageGaps([{ file: 'b.ts', gapPercent: 30 }]);
        map.setFindingsQueue([{ id: 'finding-1', file: 'a.ts' }]);

        const serialized = map.toJSON();
        expect(serialized.partitions).toEqual([{ id: 'domain-a', files: ['a.ts'], hotspotScore: 10, coverageGapPercent: 50 }]);
        expect(serialized.dependencyGraph).toEqual({ nodes: ['a.ts', 'b.ts'], edges: [{ from: 'a.ts', to: 'b.ts' }] });
        expect(serialized.hotspots).toEqual([{ file: 'a.ts', score: 10 }]);
        expect(serialized.coverageGaps).toEqual([{ file: 'b.ts', gapPercent: 30 }]);
        expect(serialized.findingsQueue).toEqual([{ id: 'finding-1', file: 'a.ts' }]);
    });
});
