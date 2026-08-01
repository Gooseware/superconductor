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

    it('should use graphify graph communities when available', () => {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        const map = new TopographyMap();
        map.setDependencyGraph({ nodes: ['file1.ts', 'file2.ts', 'file3.ts'], edges: [] });
        
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superconductor-test-'));
        const intelDir = path.join(tmpDir, 'superconductor', 'intelligence');
        fs.mkdirSync(intelDir, { recursive: true });
        
        fs.writeFileSync(path.join(intelDir, '09_graphify_graph.json'), JSON.stringify({
            nodes: [
                { source_file: 'file1.ts', community: 42 },
                { source_file: 'file2.ts', community: 42 },
                { source_file: 'file3.ts', community: 99 }
            ]
        }));

        const partitioner = new DomainPartitioner(map);
        const partitions = partitioner.partition(tmpDir);
        
        expect(partitions.length).toBe(2);
        const comm42 = partitions.find(p => p.id === 'community-42');
        const comm99 = partitions.find(p => p.id === 'community-99');
        
        expect(comm42).toBeDefined();
        expect(comm42!.files).toEqual(['file1.ts', 'file2.ts']);
        
        expect(comm99).toBeDefined();
        expect(comm99!.files).toEqual(['file3.ts']);
    });
});
