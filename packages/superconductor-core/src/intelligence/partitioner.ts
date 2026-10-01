import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectRoot } from './utils/resolve-project-root.js';

export interface ScanHotspot {
  file: string;
  score: number;
  cyclomaticComplexity?: number;
  churn?: number;
}

export interface ScanPartition {
  id: string;
  name: string;
  domain: string;
  files: string[];
  complexityScore: number;
  hotspots: ScanHotspot[];
  suggestedAgentRole: string;
}

export interface PartitionOptions {
  outputDir?: string;
  projectRoot?: string;
  targetAgents?: number;
  maxFilesPerPartition?: number;
}

export interface ScanManifest {
  version: string;
  generatedAt: string;
  projectRoot: string;
  totalFiles: number;
  partitions: ScanPartition[];
  summary: {
    partitionCount: number;
    totalHotspots: number;
    averageFilesPerPartition: number;
  };
}

export type CandidateType =
  | 'NON_DRY_DUPLICATION'
  | 'COMPONENT_REINVENTION'
  | 'SHALLOW_MODULE'
  | 'LEAKY_SEAM'
  | 'HIGH_COUPLING_CLUSTER';

export interface ProposedTrack {
  trackId: string;
  title: string;
  description: string;
  filesAffected: string[];
}

export interface ArchitectureCandidate {
  id: string;
  type: CandidateType;
  title: string;
  description: string;
  files: string[];
  recommendationStrength: 'Strong' | 'Worth exploring' | 'Speculative';
  benefits: {
    locality: string;
    leverage: string;
    testability: string;
  };
  beforeAfter: {
    beforeDiagram: string;
    afterDiagram: string;
    beforeDescription: string;
    afterDescription: string;
  };
  proposedTrack: ProposedTrack;
}

export interface ArchitectureCandidatesReport {
  version: string;
  generatedAt: string;
  projectRoot: string;
  candidates: ArchitectureCandidate[];
  topRecommendationId?: string;
  metrics: {
    totalCandidates: number;
    nonDryCount: number;
    shallowModuleCount: number;
    leakySeamCount: number;
    highCouplingCount: number;
  };
}

interface FileComplexityData {
  cyclomatic: number;
  nloc: number;
  churn: number;
  hotspotScore: number;
}

export class ArchitectureScanPartitioner {
  /**
   * Static convenience method to partition the codebase for a swarm scan.
   */
  public static async partitionForSwarmScan(options?: PartitionOptions): Promise<ScanPartition[]> {
    return new ArchitectureScanPartitioner().partitionForSwarmScan(options);
  }

  public static formatScanManifest(partitions: ScanPartition[], projectRoot?: string): ScanManifest {
    return new ArchitectureScanPartitioner().formatScanManifest(partitions, projectRoot);
  }

  public static async detectCandidates(
    partitions?: ScanPartition[],
    options?: PartitionOptions
  ): Promise<ArchitectureCandidate[]> {
    return new ArchitectureScanPartitioner().detectCandidates(partitions, options);
  }

  public static aggregateFindings(
    subagentFindings: (ArchitectureCandidate[] | ArchitectureCandidatesReport)[],
    projectRoot?: string
  ): ArchitectureCandidatesReport {
    return new ArchitectureScanPartitioner().aggregateFindings(subagentFindings, projectRoot);
  }

  /**
   * Partitions the codebase into balanced, non-overlapping clusters for multi-agent architecture scanning.
   *
   * @param options Configuration options including outputDir, projectRoot, targetAgents, and maxFilesPerPartition.
   * @returns Array of ScanPartition objects.
   */
  public async partitionForSwarmScan(options?: PartitionOptions): Promise<ScanPartition[]> {
    const resolvedProjectRoot = resolveProjectRoot(options?.projectRoot ?? options?.outputDir);
    const outputDir = options?.outputDir ? path.resolve(options.outputDir) : undefined;

    // 1. Locate and parse intelligence artifacts
    const surfaceMap = this.loadDependencySurface(outputDir, resolvedProjectRoot);
    const { couplingGraph, churnMap } = this.loadCoupling(outputDir, resolvedProjectRoot);
    const complexityMap = this.loadComplexity(outputDir, resolvedProjectRoot);

    // 2. Collect all unique codebase files
    const allFilesSet = new Set<string>();

    for (const f of surfaceMap.keys()) allFilesSet.add(f);
    for (const f of complexityMap.keys()) allFilesSet.add(f);
    for (const f of churnMap.keys()) allFilesSet.add(f);
    for (const [from, neighbors] of couplingGraph.entries()) {
      allFilesSet.add(from);
      for (const to of neighbors.keys()) allFilesSet.add(to);
    }

    const filteredFiles = Array.from(allFilesSet)
      .map(f => this.normalizePath(f, resolvedProjectRoot))
      .filter(f => f.length > 0 && !this.isIgnoredFile(f));

    const allFiles = Array.from(new Set(filteredFiles)).sort();

    if (allFiles.length === 0) {
      return [];
    }

    // 3. Compute file complexity weights and extract hotspots
    const fileWeights = new Map<string, number>();
    const fileHotspots = new Map<string, ScanHotspot>();

    for (const file of allFiles) {
      const comp = complexityMap.get(file);
      const cyclomatic = comp?.cyclomatic ?? 0;
      const churn = comp?.churn ?? churnMap.get(file) ?? 0;
      const hotspotScore = comp?.hotspotScore ?? 0;
      const surface = surfaceMap.get(file) ?? 0;

      let weight: number;
      if (hotspotScore > 0) {
        weight = hotspotScore + Math.round(surface * 0.5);
      } else {
        weight = 1 + Math.round(cyclomatic * 0.5 + Math.min(churn, 100) * 0.2 + surface * 0.5);
      }
      weight = Math.max(1, weight);
      fileWeights.set(file, weight);

      const isHotspot = hotspotScore > 0 || cyclomatic >= 10 || (churn >= 10 && cyclomatic >= 4);
      if (isHotspot) {
        const score = hotspotScore > 0 ? hotspotScore : Math.round(cyclomatic + churn * 0.5);
        fileHotspots.set(file, {
          file,
          score,
          cyclomaticComplexity: cyclomatic > 0 ? cyclomatic : undefined,
          churn: churn > 0 ? churn : undefined,
        });
      }
    }

    // 4. Determine target agent count K
    const defaultAgents = this.determineDefaultAgentCount(allFiles.length);
    const targetAgents = Math.max(1, options?.targetAgents ?? defaultAgents);
    const maxFilesPerPartition = options?.maxFilesPerPartition ?? Infinity;

    // K cannot exceed total number of files
    const K = Math.min(targetAgents, allFiles.length);

    // 5. Cluster files by coupling and directory affinity
    const clusters = this.clusterFiles(allFiles, fileWeights, couplingGraph, K, maxFilesPerPartition);

    // 6. Balance workload across partitions
    const balancedClusters = this.balanceWorkload(clusters, fileWeights, couplingGraph, maxFilesPerPartition);

    // 7. Enforce strict invariant: zero overlap, all files partitioned
    this.assertPartitionInvariant(allFiles, balancedClusters);

    // 8. Build ScanPartition objects
    const partitions: ScanPartition[] = balancedClusters.map((clusterFiles, index) => {
      const id = `partition-${index + 1}`;
      const sortedFiles = Array.from(clusterFiles).sort();
      const complexityScore = sortedFiles.reduce((sum, f) => sum + (fileWeights.get(f) ?? 1), 0);

      const hotspotsInPartition: ScanHotspot[] = [];
      for (const f of sortedFiles) {
        const h = fileHotspots.get(f);
        if (h) {
          hotspotsInPartition.push(h);
        }
      }
      hotspotsInPartition.sort((a, b) => b.score - a.score);

      // If no explicit hotspots qualified, designate the most complex file as reference hotspot
      if (hotspotsInPartition.length === 0 && sortedFiles.length > 0) {
        let maxComp = -1;
        let topFile = sortedFiles[0];
        for (const f of sortedFiles) {
          const compVal = fileWeights.get(f) ?? 1;
          if (compVal > maxComp) {
            maxComp = compVal;
            topFile = f;
          }
        }
        hotspotsInPartition.push({
          file: topFile,
          score: maxComp,
          cyclomaticComplexity: complexityMap.get(topFile)?.cyclomatic,
          churn: churnMap.get(topFile),
        });
      }

      const { domain, name } = this.determineDomainAndName(sortedFiles);
      const suggestedAgentRole = `Architecture Specialist - ${name}`;

      return {
        id,
        name,
        domain,
        files: sortedFiles,
        complexityScore,
        hotspots: hotspotsInPartition,
        suggestedAgentRole,
      };
    });

    return partitions;
  }

  // =========================================================================
  // ARTIFACT LOADERS
  // =========================================================================

  private loadDependencySurface(outputDir?: string, projectRoot?: string): Map<string, number> {
    const surfaceMap = new Map<string, number>();
    const filePath = this.findArtifactFile('08_dependency_surface.json', outputDir, projectRoot);
    if (!filePath) return surfaceMap;

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (raw && typeof raw === 'object') {
        const heatmap = (raw.heatmap && typeof raw.heatmap === 'object') ? raw.heatmap : raw;
        if (Array.isArray(heatmap)) {
          for (const item of heatmap) {
            if (item && item.file && typeof item.surface === 'number') {
              surfaceMap.set(this.normalizePath(item.file, projectRoot), item.surface);
            }
          }
        } else {
          for (const [key, val] of Object.entries(heatmap)) {
            if (typeof val === 'number') {
              surfaceMap.set(this.normalizePath(key, projectRoot), val);
            }
          }
        }
      }
    } catch {
      // Degrade gracefully if malformed
    }
    return surfaceMap;
  }

  private loadCoupling(outputDir?: string, projectRoot?: string): {
    couplingGraph: Map<string, Map<string, number>>;
    churnMap: Map<string, number>;
  } {
    const couplingGraph = new Map<string, Map<string, number>>();
    const churnMap = new Map<string, number>();

    const addEdge = (a: string, b: string, weight: number = 1) => {
      const normA = this.normalizePath(a, projectRoot);
      const normB = this.normalizePath(b, projectRoot);
      if (!normA || !normB || normA === normB) return;

      if (!couplingGraph.has(normA)) couplingGraph.set(normA, new Map());
      if (!couplingGraph.has(normB)) couplingGraph.set(normB, new Map());

      const currentA = couplingGraph.get(normA)!.get(normB) ?? 0;
      couplingGraph.get(normA)!.set(normB, currentA + weight);

      const currentB = couplingGraph.get(normB)!.get(normA) ?? 0;
      couplingGraph.get(normB)!.set(normA, currentB + weight);
    };

    // 1. Check 04_coupling.json
    const jsonPath = this.findArtifactFile('04_coupling.json', outputDir, projectRoot);
    if (jsonPath) {
      try {
        const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw.coupling) ? raw.coupling : (Array.isArray(raw.edges) ? raw.edges : []));

        for (const item of list) {
          if (!item) continue;
          if (item.file) {
            const norm = this.normalizePath(item.file, projectRoot);
            if (typeof item.churnCount === 'number') {
              churnMap.set(norm, item.churnCount);
            } else if (typeof item.churn === 'number') {
              churnMap.set(norm, item.churn);
            }

            if (Array.isArray(item.dependents)) {
              for (const dep of item.dependents) addEdge(norm, dep, 1);
            }
            if (Array.isArray(item.coupledWith)) {
              for (const dep of item.coupledWith) addEdge(norm, dep, 1);
            }
            if (typeof item.coupled === 'string') {
              addEdge(norm, item.coupled, Number(item.degree) || 1);
            }
          } else if (item.entity && item.coupled) {
            addEdge(item.entity, item.coupled, Number(item.degree) || 1);
          } else if (item.from && item.to) {
            addEdge(item.from, item.to, Number(item.weight) || 1);
          } else if (item.source && item.target) {
            addEdge(item.source, item.target, Number(item.weight) || 1);
          }
        }
      } catch {
        // Degrade gracefully
      }
    }

    // 2. Check 04_coupling.csv if available
    const csvPath = this.findArtifactFile('04_coupling.csv', outputDir, projectRoot);
    if (csvPath) {
      try {
        const content = fs.readFileSync(csvPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('entity,coupled')) continue;
          const parts = trimmed.split(',');
          if (parts.length >= 2) {
            const entity = parts[0].trim();
            const coupled = parts[1].trim();
            const degree = parts.length > 2 ? parseFloat(parts[2]) || 1 : 1;
            addEdge(entity, coupled, degree);
          }
        }
      } catch {
        // Degrade gracefully
      }
    }

    return { couplingGraph, churnMap };
  }

  private loadComplexity(outputDir?: string, projectRoot?: string): Map<string, FileComplexityData> {
    const complexityMap = new Map<string, FileComplexityData>();
    const filePath = this.findArtifactFile('03_complexity.json', outputDir, projectRoot);
    if (!filePath) return complexityMap;

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const list = Array.isArray(raw) ? raw : (typeof raw === 'object' ? Object.values(raw) : []);

      for (const item of list) {
        if (!item || !item.file) continue;
        const norm = this.normalizePath(item.file, projectRoot);
        complexityMap.set(norm, {
          cyclomatic: item.cyclomatic_complexity ?? item.cyclomatic ?? item.complexity ?? 0,
          nloc: item.nloc ?? 0,
          churn: item.churnCount ?? item.churn ?? 0,
          hotspotScore: item.hotspot_score ?? item.score ?? 0,
        });
      }
    } catch {
      // Degrade gracefully
    }

    return complexityMap;
  }

  private findArtifactFile(filename: string, outputDir?: string, projectRoot?: string): string | null {
    const candidates: string[] = [];
    if (outputDir) {
      const resolved = path.resolve(outputDir);
      candidates.push(path.join(resolved, filename));
      candidates.push(path.join(resolved, 'superconductor', 'intelligence', filename));
      candidates.push(path.join(resolved, 'intelligence', filename));
    }
    if (projectRoot) {
      const resolved = path.resolve(projectRoot);
      candidates.push(path.join(resolved, 'superconductor', 'intelligence', filename));
      candidates.push(path.join(resolved, 'intelligence', filename));
      candidates.push(path.join(resolved, filename));
    }

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }
    return null;
  }

  // =========================================================================
  // CLUSTERING & WORKLOAD BALANCING
  // =========================================================================

  private determineDefaultAgentCount(fileCount: number): number {
    if (fileCount <= 4) return Math.max(1, fileCount);
    if (fileCount < 25) return 4;
    if (fileCount < 60) return 5;
    return 6;
  }

  private clusterFiles(
    files: string[],
    weights: Map<string, number>,
    coupling: Map<string, Map<string, number>>,
    targetK: number,
    maxFilesPerPartition: number
  ): string[][] {
    // 1. Initial micro-clusters: group by directory and direct strong coupling
    const parentMap = new Map<string, string>();
    for (const f of files) parentMap.set(f, f);

    const find = (i: string): string => {
      let root = i;
      while (parentMap.get(root) !== root) {
        root = parentMap.get(root)!;
      }
      let curr = i;
      while (curr !== root) {
        const next = parentMap.get(curr)!;
        parentMap.set(curr, root);
        curr = next;
      }
      return root;
    };

    const clusterSize = new Map<string, number>();
    for (const f of files) clusterSize.set(f, 1);

    const union = (a: string, b: string): boolean => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA === rootB) return false;
      const combinedSize = (clusterSize.get(rootA) ?? 1) + (clusterSize.get(rootB) ?? 1);
      if (combinedSize > maxFilesPerPartition) return false;

      parentMap.set(rootB, rootA);
      clusterSize.set(rootA, combinedSize);
      return true;
    };

    // Union strongly coupled files
    for (const [from, neighbors] of coupling.entries()) {
      if (!parentMap.has(from)) continue;
      for (const [to, weight] of neighbors.entries()) {
        if (!parentMap.has(to)) continue;
        if (weight >= 5) {
          union(from, to);
        }
      }
    }

    // Union files in the exact same directory (if within size limits)
    const filesByDir = new Map<string, string[]>();
    for (const f of files) {
      const dir = path.posix.dirname(f);
      if (!filesByDir.has(dir)) filesByDir.set(dir, []);
      filesByDir.get(dir)!.push(f);
    }

    for (const dirFiles of filesByDir.values()) {
      for (let i = 1; i < dirFiles.length; i++) {
        union(dirFiles[0], dirFiles[i]);
      }
    }

    // Group into clusters
    const initialClusterMap = new Map<string, string[]>();
    for (const f of files) {
      const root = find(f);
      if (!initialClusterMap.has(root)) initialClusterMap.set(root, []);
      initialClusterMap.get(root)!.push(f);
    }

    let clusters: string[][] = Array.from(initialClusterMap.values());

    // Total weight and target
    const totalWeight = files.reduce((sum, f) => sum + (weights.get(f) ?? 1), 0);
    const targetWeight = totalWeight / targetK;

    // 2. Reduce clusters down to targetK via affinity-guided merging
    while (clusters.length > targetK) {
      let bestI = -1;
      let bestJ = -1;
      let highestScore = -Infinity;

      if (clusters.length > 25) {
        // Fast greedy merge for scalability on large codebases
        let minIdx = 0;
        for (let i = 1; i < clusters.length; i++) {
          if (clusters[i].length < clusters[minIdx].length) minIdx = i;
        }
        bestI = minIdx;
        const cA = clusters[bestI];
        const weightA = cA.reduce((sum, f) => sum + (weights.get(f) ?? 1), 0);

        for (let j = 0; j < clusters.length; j++) {
          if (j === bestI) continue;
          const cB = clusters[j];
          if (cA.length + cB.length > maxFilesPerPartition) continue;

          const aff = this.getClusterAffinity(cA, cB, coupling);
          const weightB = cB.reduce((sum, f) => sum + (weights.get(f) ?? 1), 0);
          const combinedWeight = weightA + weightB;
          const penalty = Math.max(0, combinedWeight - targetWeight) / Math.max(1, targetWeight);
          const score = (aff + 1) / (1 + penalty * 2);

          if (score > highestScore) {
            highestScore = score;
            bestJ = j;
          }
        }

        if (bestJ === -1) {
          let minOtherIdx = -1;
          let minOtherSize = Infinity;
          for (let j = 0; j < clusters.length; j++) {
            if (j === bestI) continue;
            if (clusters[j].length < minOtherSize) {
              minOtherSize = clusters[j].length;
              minOtherIdx = j;
            }
          }
          bestJ = minOtherIdx;
        }
      } else {
        // Fine-grained all-pairs affinity search for small cluster sets (<= 25)
        for (let i = 0; i < clusters.length; i++) {
          for (let j = i + 1; j < clusters.length; j++) {
            const cA = clusters[i];
            const cB = clusters[j];
            if (cA.length + cB.length > maxFilesPerPartition) continue;

            const aff = this.getClusterAffinity(cA, cB, coupling);
            const weightA = cA.reduce((sum, f) => sum + (weights.get(f) ?? 1), 0);
            const weightB = cB.reduce((sum, f) => sum + (weights.get(f) ?? 1), 0);
            const combinedWeight = weightA + weightB;

            const penalty = Math.max(0, combinedWeight - targetWeight) / Math.max(1, targetWeight);
            const score = (aff + 1) / (1 + penalty * 2);

            if (score > highestScore) {
              highestScore = score;
              bestI = i;
              bestJ = j;
            }
          }
        }

        if (bestI === -1) {
          let minCombinedSize = Infinity;
          for (let i = 0; i < clusters.length; i++) {
            for (let j = i + 1; j < clusters.length; j++) {
              const size = clusters[i].length + clusters[j].length;
              if (size < minCombinedSize) {
                minCombinedSize = size;
                bestI = i;
                bestJ = j;
              }
            }
          }
        }
      }

      if (bestI !== -1 && bestJ !== -1) {
        const merged = clusters[bestI].concat(clusters[bestJ]);
        clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
        clusters.push(merged);
      } else {
        break;
      }
    }

    // 3. If cluster count < targetK (e.g. initial clusters were few but targetK is higher)
    while (clusters.length < targetK) {
      // Find the cluster with the largest file count (or complexity) that has > 1 file
      let maxIdx = -1;
      let maxScore = -1;
      for (let i = 0; i < clusters.length; i++) {
        if (clusters[i].length > 1) {
          const w = clusters[i].reduce((sum, f) => sum + (weights.get(f) ?? 1), 0);
          if (w > maxScore) {
            maxScore = w;
            maxIdx = i;
          }
        }
      }

      if (maxIdx === -1) break; // Cannot split further

      const toSplit = clusters[maxIdx];
      toSplit.sort();
      const mid = Math.ceil(toSplit.length / 2);
      const partA = toSplit.slice(0, mid);
      const partB = toSplit.slice(mid);

      clusters.splice(maxIdx, 1, partA, partB);
    }

    return clusters;
  }

  private getClusterAffinity(
    clusterA: string[],
    clusterB: string[],
    coupling: Map<string, Map<string, number>>
  ): number {
    let score = 0;

    // Check direct coupling edges between clusters
    const setB = new Set(clusterB);
    for (const a of clusterA) {
      const neighbors = coupling.get(a);
      if (neighbors) {
        for (const [to, weight] of neighbors.entries()) {
          if (setB.has(to)) {
            score += weight * 10;
          }
        }
      }
    }

    // Directory path similarity using dominant directories
    const dirA = path.posix.dirname(clusterA[0] || '');
    const dirB = path.posix.dirname(clusterB[0] || '');
    if (dirA === dirB) {
      score += 20;
    } else {
      const partsA = dirA.split('/').filter(Boolean);
      const partsB = dirB.split('/').filter(Boolean);
      let common = 0;
      while (common < partsA.length && common < partsB.length && partsA[common] === partsB[common]) {
        common++;
      }
      if (common > 0) score += common * 5;
    }

    return score / Math.max(1, Math.min(clusterA.length, clusterB.length));
  }

  private balanceWorkload(
    clusters: string[][],
    weights: Map<string, number>,
    coupling: Map<string, Map<string, number>>,
    maxFilesPerPartition: number
  ): string[][] {
    const result = clusters.map(c => [...c]);
    const totalWeight = result.reduce((sum, c) => sum + c.reduce((s, f) => s + (weights.get(f) ?? 1), 0), 0);
    const targetWeight = totalWeight / Math.max(1, result.length);

    // Iterative refinement passes
    for (let iter = 0; iter < 25; iter++) {
      let heaviestIdx = -1;
      let maxWeight = -Infinity;
      let lightestIdx = -1;
      let minWeight = Infinity;

      for (let i = 0; i < result.length; i++) {
        const w = result[i].reduce((sum, f) => sum + (weights.get(f) ?? 1), 0);
        if (w > maxWeight) {
          maxWeight = w;
          heaviestIdx = i;
        }
        if (w < minWeight) {
          minWeight = w;
          lightestIdx = i;
        }
      }

      // If already reasonably balanced or heaviest has only 1 file, stop
      if (
        heaviestIdx === lightestIdx ||
        maxWeight - minWeight <= Math.max(5, targetWeight * 0.25) ||
        result[heaviestIdx].length <= 1
      ) {
        break;
      }

      const heavyCluster = result[heaviestIdx];
      const lightCluster = result[lightestIdx];

      if (lightCluster.length >= maxFilesPerPartition) {
        break;
      }

      // Find best file to move from heavy to light
      let bestFile: string | null = null;
      let bestMoveGain = -Infinity;

      for (const file of heavyCluster) {
        const fileW = weights.get(file) ?? 1;
        // Don't move if it would make light heavier than heavy was
        if (minWeight + fileW > maxWeight) continue;

        // Locality check: coupling to heavy vs light
        let couplingToHeavy = 0;
        let couplingToLight = 0;
        const neighbors = coupling.get(file);
        if (neighbors) {
          for (const other of heavyCluster) {
            if (other !== file) couplingToHeavy += neighbors.get(other) ?? 0;
          }
          for (const other of lightCluster) {
            couplingToLight += neighbors.get(other) ?? 0;
          }
        }

        // Don't separate files that are directly coupled to their current cluster
        if (couplingToHeavy > 0 && couplingToLight === 0) continue;

        // Shared directory affinity
        const fileDir = path.posix.dirname(file);
        let sharedDirHeavy = 0;
        let sharedDirLight = 0;
        for (const other of heavyCluster) {
          if (other !== file && path.posix.dirname(other) === fileDir) sharedDirHeavy++;
        }
        for (const other of lightCluster) {
          if (path.posix.dirname(other) === fileDir) sharedDirLight++;
        }

        // Don't break up a cohesive directory if the target cluster has no affinity to that directory
        if (sharedDirHeavy > 0 && sharedDirLight === 0) continue;

        const balanceImprovement = (maxWeight - minWeight) - Math.abs((maxWeight - fileW) - (minWeight + fileW));
        const localityCost = (couplingToHeavy - couplingToLight) * 5 + (sharedDirHeavy - sharedDirLight);

        const moveGain = balanceImprovement - localityCost;

        if (moveGain > bestMoveGain) {
          bestMoveGain = moveGain;
          bestFile = file;
        }
      }

      if (bestFile && bestMoveGain > 0) {
        result[heaviestIdx] = heavyCluster.filter(f => f !== bestFile);
        result[lightestIdx].push(bestFile);
      } else {
        break;
      }
    }

    return result;
  }

  private assertPartitionInvariant(allFiles: string[], clusters: string[][]): void {
    const partitionedFiles = new Set<string>();

    for (const cluster of clusters) {
      for (const file of cluster) {
        if (partitionedFiles.has(file)) {
          throw new Error(`[ArchitectureScanPartitioner] Invariant violated: File '${file}' is present in multiple partitions.`);
        }
        partitionedFiles.add(file);
      }
    }

    for (const file of allFiles) {
      if (!partitionedFiles.has(file)) {
        throw new Error(`[ArchitectureScanPartitioner] Invariant violated: File '${file}' was omitted from all partitions.`);
      }
    }
  }

  // =========================================================================
  // METADATA & DOMAIN EXTRACTION
  // =========================================================================

  private determineDomainAndName(files: string[]): { domain: string; name: string } {
    const tokenCounts = new Map<string, number>();
    const ignoredTokens = new Set([
      'packages', 'src', 'dist', 'lib', 'tests', 'test', '__tests__',
      'node_modules', '.', 'superconductor', 'extensions', 'repos'
    ]);

    for (const f of files) {
      const parts = f.split('/').filter(Boolean);
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i].toLowerCase();
        if (!ignoredTokens.has(part)) {
          tokenCounts.set(part, (tokenCounts.get(part) ?? 0) + 1);
        }
      }
    }

    const domainDescriptions: Record<string, { domain: string; name: string }> = {
      intelligence: { domain: 'intelligence', name: 'Intelligence & Codebase Topography' },
      concurrency: { domain: 'concurrency', name: 'Concurrency & Worker Orchestration' },
      storm: { domain: 'concurrency', name: 'Storm Concurrency & Worker Pool' },
      dag: { domain: 'dag', name: 'Task DAG & Dependency Resolution' },
      dispatcher: { domain: 'dispatcher', name: 'Task Dispatcher & Scheduling' },
      verification: { domain: 'verification', name: 'Verification & Quorum Review' },
      quorum: { domain: 'verification', name: 'Quorum Governance & Review' },
      planning: { domain: 'planning', name: 'Planning & Track Specification' },
      ui: { domain: 'ui', name: 'UI & Component Architecture' },
      components: { domain: 'ui', name: 'Frontend Components & Views' },
      cli: { domain: 'cli', name: 'CLI & Process Lifecycle' },
      guard: { domain: 'guard', name: 'Safety Guards & Access Control' },
      agents: { domain: 'agents', name: 'Agent System & System Prompts' },
      cache: { domain: 'cache', name: 'Model & Context Cache' },
      registry: { domain: 'registry', name: 'Component Registry & Ecosystem' },
      engine: { domain: 'engine', name: 'Core Engine & Runtime' },
      core: { domain: 'core', name: 'Core Framework Services' },
      skills: { domain: 'skills', name: 'Superconductor Skills & Workflows' },
      telemetry: { domain: 'telemetry', name: 'Telemetry & Audit Reporting' },
      state: { domain: 'state', name: 'State Management & Event Store' },
    };

    let bestMatch: { domain: string; name: string } | null = null;
    let bestScore = 0;

    for (const [token, count] of tokenCounts.entries()) {
      for (const [key, mapping] of Object.entries(domainDescriptions)) {
        if (token.includes(key) || key.includes(token)) {
          if (count > bestScore) {
            bestScore = count;
            bestMatch = mapping;
          }
        }
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    let topToken = 'core';
    let topCount = 0;
    for (const [token, count] of tokenCounts.entries()) {
      if (count > topCount) {
        topCount = count;
        topToken = token;
      }
    }

    const capitalized = topToken.charAt(0).toUpperCase() + topToken.slice(1);
    return {
      domain: topToken,
      name: `${capitalized} Subsystem`,
    };
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================

  private normalizePath(filePath: string, projectRoot?: string): string {
    let normalized = filePath.replace(/\\/g, '/');
    if (projectRoot) {
      const rootNormalized = projectRoot.replace(/\\/g, '/');
      if (normalized.startsWith(rootNormalized)) {
        normalized = path.relative(projectRoot, filePath).replace(/\\/g, '/');
      }
    }
    normalized = normalized.replace(/^\.\//, '');
    return normalized;
  }

  public isIgnoredFile(file: string): boolean {
    const lower = file.toLowerCase();
    // Dependency & VCS directories
    if (lower.startsWith('node_modules/') || lower.includes('/node_modules/')) return true;
    if (lower.startsWith('.git/') || lower.includes('/.git/')) return true;
    if (lower.startsWith('.vite/') || lower.includes('/.vite/')) return true;

    // Build outputs & compilation artifacts (e.g., dist/, build/, out/, packages/*/dist/)
    if (lower.startsWith('dist/') || lower.includes('/dist/')) return true;
    if (lower.startsWith('build/') || lower.includes('/build/')) return true;
    if (lower.startsWith('out/') || lower.includes('/out/')) return true;
    if (lower.endsWith('.d.ts') || lower.endsWith('.d.mts') || lower.endsWith('.d.cts')) return true;
    if (lower.endsWith('.map') || lower.endsWith('.js.map') || lower.endsWith('.ts.map')) return true;

    // Test coverage & temporary artifacts (e.g. coverage/, tmp/, .tmp/, .cache/)
    if (lower.startsWith('coverage/') || lower.includes('/coverage/')) return true;
    if (lower.startsWith('.coverage/') || lower.includes('/.coverage/')) return true;
    if (lower.startsWith('tmp/') || lower.includes('/tmp/')) return true;
    if (lower.startsWith('.tmp/') || lower.includes('/.tmp/')) return true;
    if (lower.startsWith('.cache/') || lower.includes('/.cache/')) return true;

    // Lockfiles and metadata
    if (lower.endsWith('.lock') || lower.endsWith('lock.yaml') || lower.endsWith('package-lock.json')) return true;
    if (lower.endsWith('00_manifest.json') || lower.endsWith('results.json')) return true;
    return false;
  }

  /**
   * Formats a scan manifest ready for parallel subagent dispatch.
   */
  public formatScanManifest(partitions: ScanPartition[], projectRoot?: string): ScanManifest {
    const root = resolveProjectRoot(projectRoot);
    const totalFiles = partitions.reduce((sum, p) => sum + p.files.length, 0);
    const totalHotspots = partitions.reduce((sum, p) => sum + p.hotspots.length, 0);

    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      projectRoot: root,
      totalFiles,
      partitions,
      summary: {
        partitionCount: partitions.length,
        totalHotspots,
        averageFilesPerPartition:
          partitions.length > 0 ? Math.round(totalFiles / partitions.length) : 0,
      },
    };
  }

  /**
   * Analyzes partitions and intelligence snapshots to detect candidate architectural opportunities:
   * - Non-DRY duplicate logic & component reinvention
   * - Shallow modules (deletion test candidates)
   * - Leaky seams & high coupling clusters
   * - Proposed track suggestions with title, description, and files affected.
   */
  public async detectCandidates(
    partitions?: ScanPartition[],
    options?: PartitionOptions
  ): Promise<ArchitectureCandidate[]> {
    const root = resolveProjectRoot(options?.projectRoot ?? options?.outputDir);
    const parts = partitions ?? (await this.partitionForSwarmScan(options));
    const outputDir = options?.outputDir ? path.resolve(options.outputDir) : undefined;

    const surfaceMap = this.loadDependencySurface(outputDir, root);
    const { couplingGraph, churnMap } = this.loadCoupling(outputDir, root);
    const complexityMap = this.loadComplexity(outputDir, root);

    const candidates: ArchitectureCandidate[] = [];
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const allFiles = parts.flatMap((p) => p.files);

    // 1. Detect Non-DRY duplicate logic & component reinvention
    const basenameMap = new Map<string, string[]>();
    for (const file of allFiles) {
      const base = path.posix.basename(file).toLowerCase().replace(/\.(ts|tsx|js|jsx)$/, '');
      if (!basenameMap.has(base)) {
        basenameMap.set(base, []);
      }
      basenameMap.get(base)!.push(file);
    }

    let nonDryIdx = 1;
    for (const [base, matchedFiles] of basenameMap.entries()) {
      if (
        matchedFiles.length >= 2 &&
        (base.includes('cache') ||
          base.includes('broker') ||
          base.includes('resolver') ||
          base.includes('spawner') ||
          base.includes('lock') ||
          base.includes('button') ||
          base.includes('card') ||
          base.includes('modal') ||
          base.includes('partitioner') ||
          base.includes('findings') ||
          base.includes('agent') ||
          base.includes('client') ||
          base.includes('adapter'))
      ) {
        const candidateId = `cand-nondry-${nonDryIdx++}`;
        const trackId = `dry_consolidate_${base.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}`;
        const isUiComponent = base.includes('button') || base.includes('card') || base.includes('modal');

        candidates.push({
          id: candidateId,
          type: isUiComponent ? 'COMPONENT_REINVENTION' : 'NON_DRY_DUPLICATION',
          title: `Consolidate Non-DRY Duplicate Logic for '${base}'`,
          description: `Multiple disparate modules or reinventions of '${base}' detected across packages (${matchedFiles.join(
            ', '
          )}). Violates Design OS Kernel DRY dogma and introduces semantic drift.`,
          files: matchedFiles,
          recommendationStrength: 'Strong',
          benefits: {
            locality: `Unifies scattered '${base}' implementations under an authoritative golden source module.`,
            leverage: `Refactors and bugfixes propagate immediately to all consumers without copy-pasting.`,
            testability: `Replaces redundant per-module mocks with a single comprehensive test suite.`,
          },
          beforeAfter: {
            beforeDiagram: `flowchart TD\n  subgraph Dispersed ["Duplicate Reinventions"]\n${matchedFiles
              .map((f, i) => `    M${i}["${f}"]`)
              .join('\n')}\n  end`,
            afterDiagram: `flowchart TD\n  subgraph Golden ["Golden Component / Shared Package"]\n    Core["@superconductor/core/${base}"]\n  end\n${matchedFiles
              .map((_, i) => `  Consumer${i} --> Core`)
              .join('\n')}`,
            beforeDescription: `Duplicated implementations scattered in multiple package directories.`,
            afterDescription: `Single deep golden source module reused across all callers.`,
          },
          proposedTrack: {
            trackId,
            title: `Consolidate duplicate ${base} implementations`,
            description: `Refactor disparate ${base} modules into an authoritative, reusable core module to prevent component reinvention.`,
            filesAffected: matchedFiles,
          },
        });
      }
    }

    // 2. Detect Shallow Modules (Deletion Test Candidates)
    let shallowIdx = 1;
    for (const file of allFiles) {
      const surface = surfaceMap.get(file) ?? 0;
      const comp = complexityMap.get(file);
      const cyclomatic = comp?.cyclomatic ?? 0;
      const nloc = comp?.nloc ?? 0;

      if (surface >= 2 && cyclomatic <= 2 && (nloc === 0 || nloc < 40)) {
        const candidateId = `cand-shallow-${shallowIdx++}`;
        const base = path.posix.basename(file).replace(/\.(ts|tsx|js|jsx)$/, '');
        const trackId = `deepen_shallow_${base.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}`;

        candidates.push({
          id: candidateId,
          type: 'SHALLOW_MODULE',
          title: `Deepen or Inline Shallow Module '${base}'`,
          description: `'${file}' exhibits notable dependency surface (${surface} callers/references) but almost zero internal cyclomatic complexity (${cyclomatic}). Its interface is nearly as complex as its implementation. This is a prime deletion test candidate: deleting it would concentrate complexity rather than scatter it.`,
          files: [file],
          recommendationStrength: 'Strong',
          benefits: {
            locality: `Inlines pass-through boilerplate directly into primary caller or coalesces it into a deep subsystem facade.`,
            leverage: `Eliminates cognitive hops and reduces boundary friction across small files.`,
            testability: `Interface test surface becomes meaningful rather than testing trivial passthrough mappings.`,
          },
          beforeAfter: {
            beforeDiagram: `flowchart LR\n  Caller["Caller Subsystem"] --> Shallow["${path.posix.basename(
              file
            )} (Shallow Shim)"]\n  Shallow --> Target["Real Worker"]`,
            afterDiagram: `flowchart LR\n  Caller["Caller Subsystem"] --> Deep["Deep Unified Module"]`,
            beforeDescription: `Thin intermediary pass-through module separating callers from logic.`,
            afterDescription: `Deep interface with hidden internal implementation complexity.`,
          },
          proposedTrack: {
            trackId,
            title: `Deepen or inline shallow module ${base}`,
            description: `Apply the deletion test to ${file}: inline pass-through logic and deepen caller boundary.`,
            filesAffected: [file],
          },
        });
        if (shallowIdx > 4) break;
      }
    }

    // 3. Detect Leaky Seams & High Coupling Clusters
    let couplingIdx = 1;
    for (const part of parts) {
      let partitionChurn = 0;
      let partitionCouplingDegree = 0;

      for (const f of part.files) {
        partitionChurn += churnMap.get(f) ?? 0;
        const neighbors = couplingGraph.get(f);
        if (neighbors) {
          for (const [to, weight] of neighbors.entries()) {
            if (!part.files.includes(to)) {
              partitionCouplingDegree += weight;
            }
          }
        }
      }

      if (partitionChurn > 20 || partitionCouplingDegree > 15 || part.complexityScore > 50) {
        const candidateId = `cand-coupling-${couplingIdx++}`;
        const domainSlug = part.domain.replace(/[^a-zA-Z0-9]/g, '_');
        const trackId = `seal_leaky_seam_${domainSlug}_${dateStr}`;

        candidates.push({
          id: candidateId,
          type: partitionCouplingDegree > 15 ? 'LEAKY_SEAM' : 'HIGH_COUPLING_CLUSTER',
          title: `Seal Leaky Seam in ${part.name}`,
          description: `High churn (${partitionChurn}) and leaky cross-partition coupling (${partitionCouplingDegree}) in ${part.domain}. Internal implementation details leak across subsystem boundaries, forcing cascading edits.`,
          files: part.files.slice(0, 8),
          recommendationStrength: 'Worth exploring',
          benefits: {
            locality: `Constrains ripple effects by establishing a formal architectural seam with an opaque interface.`,
            leverage: `Enables internal refactoring of ${part.domain} without breaking callers.`,
            testability: `External tests bind strictly to the boundary seam rather than volatile internal implementation files.`,
          },
          beforeAfter: {
            beforeDiagram: `flowchart TD\n  subgraph Leaky ["Leaky Subsystem (${part.domain})"]\n${part.files
              .slice(0, 4)
              .map((f, i) => `    F${i}["${path.posix.basename(f)}"]`)
              .join('\n')}\n    F0 <--> F1\n  end\n  External["External Callers"] <--> F0\n  External <--> F1`,
            afterDiagram: `flowchart TD\n  External["External Callers"] --> Facade["Deep Domain Facade Seam"]\n  subgraph Encapsulated ["Private Subsystem Internals"]\n    Facade --> Internal["Internal Modules"]\n  end`,
            beforeDescription: `Multiple cross-cutting calls directly into internal implementation files.`,
            afterDescription: `Single stable architectural seam encapsulating subsystem details.`,
          },
          proposedTrack: {
            trackId,
            title: `Isolate and encapsulate ${part.domain} coupling cluster`,
            description: `Construct a formal architectural seam around ${part.domain} to dampen change cascades.`,
            filesAffected: part.files.slice(0, 8),
          },
        });
        if (couplingIdx > 3) break;
      }
    }

    return candidates;
  }

  /**
   * Aggregates findings from parallel subagents into a unified JSON candidate report.
   */
  public aggregateFindings(
    subagentFindings: (ArchitectureCandidate[] | ArchitectureCandidatesReport)[],
    projectRoot?: string
  ): ArchitectureCandidatesReport {
    const root = resolveProjectRoot(projectRoot);
    const flat: ArchitectureCandidate[] = [];

    for (const item of subagentFindings) {
      if (Array.isArray(item)) {
        flat.push(...item);
      } else if (item && Array.isArray(item.candidates)) {
        flat.push(...item.candidates);
      }
    }

    const seenIds = new Set<string>();
    const deduplicated: ArchitectureCandidate[] = [];

    for (const c of flat) {
      if (!c || !c.id) continue;
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        deduplicated.push(c);
      }
    }

    let nonDryCount = 0;
    let shallowModuleCount = 0;
    let leakySeamCount = 0;
    let highCouplingCount = 0;

    for (const c of deduplicated) {
      if (c.type === 'NON_DRY_DUPLICATION' || c.type === 'COMPONENT_REINVENTION') {
        nonDryCount++;
      } else if (c.type === 'SHALLOW_MODULE') {
        shallowModuleCount++;
      } else if (c.type === 'LEAKY_SEAM') {
        leakySeamCount++;
      } else if (c.type === 'HIGH_COUPLING_CLUSTER') {
        highCouplingCount++;
      }
    }

    const strongCandidate = deduplicated.find((c) => c.recommendationStrength === 'Strong');
    const topRecommendationId = strongCandidate?.id ?? deduplicated[0]?.id;

    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      projectRoot: root,
      candidates: deduplicated,
      topRecommendationId,
      metrics: {
        totalCandidates: deduplicated.length,
        nonDryCount,
        shallowModuleCount,
        leakySeamCount,
        highCouplingCount,
      },
    };
  }
}
