export interface DomainPartition {
    id: string;
    files: string[];
    hotspotScore: number;
    coverageGapPercent: number;
    reviewers?: string[];
}

export interface DependencyGraph {
    nodes: string[];
    edges: { from: string; to: string }[];
}

export interface Hotspot {
    file: string;
    score: number;
}

export interface CoverageGap {
    file: string;
    gapPercent: number;
}

export interface Finding {
    id: string;
    file: string;
}

export class TopographyMap {
    private partitions: DomainPartition[] = [];
    private dependencyGraph: DependencyGraph = { nodes: [], edges: [] };
    private hotspots: Hotspot[] = [];
    private coverageGaps: CoverageGap[] = [];
    private findingsQueue: Finding[] = [];

    addPartition(partition: DomainPartition) {
        this.partitions.push(partition);
    }

    setPartitions(partitions: DomainPartition[]) {
        this.partitions = partitions;
    }

    getPartitions(): DomainPartition[] {
        return this.partitions;
    }

    setDependencyGraph(graph: DependencyGraph) {
        this.dependencyGraph = graph;
    }
    
    getDependencyGraph(): DependencyGraph {
        return this.dependencyGraph;
    }

    setHotspots(hotspots: Hotspot[]) {
        this.hotspots = hotspots;
    }
    
    getHotspots(): Hotspot[] {
        return this.hotspots;
    }

    setCoverageGaps(gaps: CoverageGap[]) {
        this.coverageGaps = gaps;
    }
    
    getCoverageGaps(): CoverageGap[] {
        return this.coverageGaps;
    }

    setFindingsQueue(queue: Finding[]) {
        this.findingsQueue = queue;
    }
    
    getFindingsQueue(): Finding[] {
        return this.findingsQueue;
    }

    toJSON() {
        return {
            partitions: this.partitions,
            dependencyGraph: this.dependencyGraph,
            hotspots: this.hotspots,
            coverageGaps: this.coverageGaps,
            findingsQueue: this.findingsQueue,
        };
    }
}
