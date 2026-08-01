import * as fs from 'node:fs';
import * as path from 'node:path';
import { TopographyMap, DomainPartitioner } from '../intelligence/index.js';
import { ReviewFinding } from './aggregate-findings.js';

export function serializeBaselineTopography(
    projectRoot: string,
    trackId: string,
    findings: ReviewFinding[]
) {
    const map = new TopographyMap();
    
    // Convert findings to Findings queue format
    map.setFindingsQueue(findings.map(f => ({
        id: f.finding_id || Math.random().toString(36).substring(7),
        file: f.file
    })));

    // Just setup some default empty state to serialize
    map.setDependencyGraph({ nodes: [], edges: [] });
    map.setHotspots([]);
    map.setCoverageGaps([]);

    // Run partitioner
    const partitioner = new DomainPartitioner(map);
    partitioner.partition(projectRoot);

    const outputDir = path.join(projectRoot, 'superconductor', 'tracks', trackId);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'topography.json');
    fs.writeFileSync(outputPath, JSON.stringify(map.toJSON(), null, 2), 'utf-8');
}
