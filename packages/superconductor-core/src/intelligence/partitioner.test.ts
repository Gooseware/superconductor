import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ArchitectureScanPartitioner, ScanPartition } from './partitioner.js';
import * as intelligenceExports from './index.js';

describe('ArchitectureScanPartitioner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-partitioner-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Module Exports', () => {
    it('exports ArchitectureScanPartitioner and types from intelligence index', () => {
      expect(intelligenceExports.ArchitectureScanPartitioner).toBeDefined();
      expect(typeof intelligenceExports.ArchitectureScanPartitioner).toBe('function');
    });

    it('supports static method invocation', async () => {
      const result = await ArchitectureScanPartitioner.partitionForSwarmScan({ outputDir: tempDir });
      expect(result).toEqual([]);
    });
  });

  describe('Empty and Edge Cases', () => {
    it('returns empty array when no intelligence artifacts exist', async () => {
      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({ outputDir: tempDir });
      expect(partitions).toEqual([]);
    });

    it('gracefully handles malformed JSON files', async () => {
      fs.writeFileSync(path.join(tempDir, '08_dependency_surface.json'), '{ invalid json');
      fs.writeFileSync(path.join(tempDir, '04_coupling.json'), 'not json');
      fs.writeFileSync(path.join(tempDir, '03_complexity.json'), '{"corrupt');

      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({ outputDir: tempDir });
      expect(partitions).toEqual([]);
    });

    it('handles single file codebase without crashing or creating excessive partitions', async () => {
      fs.writeFileSync(
        path.join(tempDir, '03_complexity.json'),
        JSON.stringify([{ file: 'src/main.ts', cyclomatic_complexity: 5, hotspot_score: 10 }])
      );

      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({
        outputDir: tempDir,
        targetAgents: 4,
      });

      expect(partitions.length).toBe(1);
      expect(partitions[0].files).toEqual(['src/main.ts']);
      expect(partitions[0].complexityScore).toBeGreaterThanOrEqual(10);
      expect(partitions[0].hotspots.length).toBe(1);
      expect(partitions[0].hotspots[0].file).toBe('src/main.ts');
    });
  });

  describe('Clustering and Invariants with Fixtures', () => {
    const setupStandardFixtures = (dir: string) => {
      // 08_dependency_surface.json
      const surface = {
        heatmap: {
          'src/concurrency/worker.ts': 12,
          'src/concurrency/pool.ts': 8,
          'src/concurrency/storm.ts': 15,
          'src/dag/parser.ts': 6,
          'src/dag/validator.ts': 7,
          'src/dag/graph.ts': 10,
          'src/intelligence/snapshot.ts': 9,
          'src/intelligence/drift.ts': 5,
          'src/intelligence/reporter.ts': 11,
          'src/ui/button.tsx': 3,
          'src/ui/card.tsx': 4,
          'src/ui/theme.tsx': 6,
        },
      };
      fs.writeFileSync(path.join(dir, '08_dependency_surface.json'), JSON.stringify(surface, null, 2));

      // 04_coupling.json (coupling edges & churn)
      const coupling = [
        { file: 'src/concurrency/worker.ts', dependents: ['src/concurrency/pool.ts', 'src/concurrency/storm.ts'] },
        { file: 'src/dag/parser.ts', dependents: ['src/dag/validator.ts', 'src/dag/graph.ts'] },
        { file: 'src/intelligence/snapshot.ts', dependents: ['src/intelligence/drift.ts', 'src/intelligence/reporter.ts'] },
        { file: 'src/ui/button.tsx', dependents: ['src/ui/card.tsx'] },
        { file: 'src/concurrency/storm.ts', churnCount: 25 },
        { file: 'src/dag/graph.ts', churnCount: 18 },
        { file: 'src/intelligence/reporter.ts', churnCount: 30 },
      ];
      fs.writeFileSync(path.join(dir, '04_coupling.json'), JSON.stringify(coupling, null, 2));

      // 03_complexity.json
      const complexity = [
        { file: 'src/concurrency/worker.ts', cyclomatic_complexity: 8, hotspot_score: 14 },
        { file: 'src/concurrency/pool.ts', cyclomatic_complexity: 4, hotspot_score: 6 },
        { file: 'src/concurrency/storm.ts', cyclomatic_complexity: 18, hotspot_score: 35 },
        { file: 'src/dag/parser.ts', cyclomatic_complexity: 6, hotspot_score: 10 },
        { file: 'src/dag/validator.ts', cyclomatic_complexity: 5, hotspot_score: 8 },
        { file: 'src/dag/graph.ts', cyclomatic_complexity: 14, hotspot_score: 24 },
        { file: 'src/intelligence/snapshot.ts', cyclomatic_complexity: 9, hotspot_score: 16 },
        { file: 'src/intelligence/drift.ts', cyclomatic_complexity: 4, hotspot_score: 5 },
        { file: 'src/intelligence/reporter.ts', cyclomatic_complexity: 16, hotspot_score: 32 },
        { file: 'src/ui/button.tsx', cyclomatic_complexity: 2, hotspot_score: 0 },
        { file: 'src/ui/card.tsx', cyclomatic_complexity: 3, hotspot_score: 0 },
        { file: 'src/ui/theme.tsx', cyclomatic_complexity: 5, hotspot_score: 0 },
      ];
      fs.writeFileSync(path.join(dir, '03_complexity.json'), JSON.stringify(complexity, null, 2));
    };

    it('enforces strict zero overlap invariant across all partitions', async () => {
      setupStandardFixtures(tempDir);
      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({
        outputDir: tempDir,
        targetAgents: 4,
      });

      expect(partitions.length).toBe(4);

      const seenFiles = new Set<string>();
      let totalFilesAcrossPartitions = 0;

      for (const partition of partitions) {
        expect(partition.files.length).toBeGreaterThan(0);
        for (const file of partition.files) {
          expect(seenFiles.has(file)).toBe(false);
          seenFiles.add(file);
          totalFilesAcrossPartitions++;
        }
      }

      expect(seenFiles.size).toBe(totalFilesAcrossPartitions);
      expect(seenFiles.size).toBe(12); // All 12 files accounted for
    });

    it('clusters coupled files together for high architectural locality', async () => {
      setupStandardFixtures(tempDir);
      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({
        outputDir: tempDir,
        targetAgents: 4,
      });

      // Find the partition containing worker.ts
      const concurrencyPart = partitions.find(p => p.files.includes('src/concurrency/worker.ts'));
      expect(concurrencyPart).toBeDefined();
      // worker.ts and storm.ts / pool.ts are coupled and in same dir -> should be together
      expect(concurrencyPart!.files).toContain('src/concurrency/pool.ts');
      expect(concurrencyPart!.files).toContain('src/concurrency/storm.ts');

      // Find DAG partition
      const dagPart = partitions.find(p => p.files.includes('src/dag/parser.ts'));
      expect(dagPart).toBeDefined();
      expect(dagPart!.files).toContain('src/dag/validator.ts');
      expect(dagPart!.files).toContain('src/dag/graph.ts');

      // Find Intelligence partition
      const intelPart = partitions.find(p => p.files.includes('src/intelligence/snapshot.ts'));
      expect(intelPart).toBeDefined();
      expect(intelPart!.files).toContain('src/intelligence/reporter.ts');
      expect(intelPart!.files).toContain('src/intelligence/drift.ts');
    });

    it('balances workload evenly across partitions', async () => {
      setupStandardFixtures(tempDir);
      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({
        outputDir: tempDir,
        targetAgents: 4,
      });

      const scores = partitions.map(p => p.complexityScore);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);

      // Verify that every partition has significant work and no partition is empty
      expect(minScore).toBeGreaterThan(0);
      // The ratio between max and min should be reasonable, avoiding a single 95% partition
      expect(maxScore).toBeLessThan(minScore * 10);
    });

    it('accurately identifies and attributes hotspots to their respective partitions', async () => {
      setupStandardFixtures(tempDir);
      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({
        outputDir: tempDir,
        targetAgents: 4,
      });

      for (const partition of partitions) {
        expect(partition.hotspots).toBeDefined();
        expect(Array.isArray(partition.hotspots)).toBe(true);

        // Every hotspot must be a file that belongs to this partition
        for (const h of partition.hotspots) {
          expect(partition.files).toContain(h.file);
          expect(h.score).toBeGreaterThan(0);
        }

        // Hotspots should be sorted in descending order of score
        for (let i = 1; i < partition.hotspots.length; i++) {
          expect(partition.hotspots[i - 1].score).toBeGreaterThanOrEqual(partition.hotspots[i].score);
        }
      }

      // Check specific major hotspots
      const allHotspotFiles = partitions.flatMap(p => p.hotspots.map(h => h.file));
      expect(allHotspotFiles).toContain('src/concurrency/storm.ts');
      expect(allHotspotFiles).toContain('src/intelligence/reporter.ts');
      expect(allHotspotFiles).toContain('src/dag/graph.ts');
    });

    it('assigns domain, name, and suggestedAgentRole for each partition', async () => {
      setupStandardFixtures(tempDir);
      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({
        outputDir: tempDir,
        targetAgents: 4,
      });

      for (const partition of partitions) {
        expect(partition.id).toMatch(/^partition-\d+$/);
        expect(partition.name).toBeTruthy();
        expect(partition.domain).toBeTruthy();
        expect(partition.suggestedAgentRole).toContain('Architecture Specialist');
      }

      const domains = partitions.map(p => p.domain);
      expect(domains).toContain('concurrency');
      expect(domains).toContain('dag');
      expect(domains).toContain('intelligence');
      expect(domains).toContain('ui');
    });

    it('respects maxFilesPerPartition option', async () => {
      setupStandardFixtures(tempDir);
      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({
        outputDir: tempDir,
        targetAgents: 4,
        maxFilesPerPartition: 3,
      });

      for (const partition of partitions) {
        expect(partition.files.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('Alternative Formats and Heuristics', () => {
    it('parses CSV coupling files and object-based complexity entries', async () => {
      // 08_dependency_surface.json as direct object map
      fs.writeFileSync(
        path.join(tempDir, '08_dependency_surface.json'),
        JSON.stringify({
          'packages/engine/src/auth.ts': 5,
          'packages/engine/src/session.ts': 8,
        })
      );

      // 04_coupling.csv
      fs.writeFileSync(
        path.join(tempDir, '04_coupling.csv'),
        'entity,coupled,degree,average_revs\npackages/engine/src/auth.ts,packages/engine/src/session.ts,0.9,10\n'
      );

      // 03_complexity.json as keyed object
      fs.writeFileSync(
        path.join(tempDir, '03_complexity.json'),
        JSON.stringify({
          'packages/engine/src/auth.ts': { cyclomatic_complexity: 8, hotspot_score: 12 },
          'packages/engine/src/session.ts': { cyclomatic_complexity: 12, hotspot_score: 22 },
        })
      );

      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({
        outputDir: tempDir,
        targetAgents: 2,
      });

      expect(partitions.length).toBeGreaterThanOrEqual(1);
      const allFiles = partitions.flatMap(p => p.files);
      expect(allFiles).toContain('packages/engine/src/auth.ts');
      expect(allFiles).toContain('packages/engine/src/session.ts');
    });

    it('defaults to 4-6 agents when targetAgents is omitted', async () => {
      const files: Record<string, number> = {};
      const complexityList: any[] = [];
      for (let i = 0; i < 30; i++) {
        const file = `packages/core/src/file_${i}.ts`;
        files[file] = 2;
        complexityList.push({ file, cyclomatic_complexity: 3, hotspot_score: i % 5 === 0 ? 10 : 0 });
      }

      fs.writeFileSync(path.join(tempDir, '08_dependency_surface.json'), JSON.stringify(files));
      fs.writeFileSync(path.join(tempDir, '03_complexity.json'), JSON.stringify(complexityList));

      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({ outputDir: tempDir });

      // For 30 files, default is in the range 4-6
      expect(partitions.length).toBeGreaterThanOrEqual(4);
      expect(partitions.length).toBeLessThanOrEqual(6);

      const seen = new Set<string>();
      for (const p of partitions) {
        for (const f of p.files) {
          expect(seen.has(f)).toBe(false);
          seen.add(f);
        }
      }
      expect(seen.size).toBe(30);
    });
  });

  describe('Real Superconductor Intelligence Artifacts', () => {
    it('partitions real intelligence artifacts from superconductor/intelligence if available', async () => {
      const realIntelDir = path.resolve(process.cwd(), 'superconductor', 'intelligence');
      if (!fs.existsSync(path.join(realIntelDir, '03_complexity.json'))) {
        // Skip if running in an environment without pre-generated artifacts
        return;
      }

      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({
        outputDir: realIntelDir,
        projectRoot: process.cwd(),
        targetAgents: 5,
      });

      expect(partitions.length).toBe(5);

      const allFiles = new Set<string>();
      let fileCount = 0;

      for (const p of partitions) {
        expect(p.files.length).toBeGreaterThan(0);
        expect(p.complexityScore).toBeGreaterThan(0);
        expect(p.hotspots.length).toBeGreaterThan(0);
        expect(p.suggestedAgentRole).toMatch(/^Architecture Specialist/);

        for (const file of p.files) {
          expect(allFiles.has(file)).toBe(false); // Zero overlap!
          allFiles.add(file);
          fileCount++;
        }
      }

      expect(allFiles.size).toBe(fileCount);
    });
  });

  describe('isIgnoredFile Build & Coverage Artifact Filtering (REV-3)', () => {
    it('correctly filters out build outputs, coverage, d.ts, and temporary files', () => {
      const partitioner = new ArchitectureScanPartitioner();

      // Build outputs
      expect(partitioner.isIgnoredFile('dist/index.js')).toBe(true);
      expect(partitioner.isIgnoredFile('packages/superconductor-core/dist/index.js')).toBe(true);
      expect(partitioner.isIgnoredFile('packages/engine/dist/engine.js')).toBe(true);
      expect(partitioner.isIgnoredFile('build/output.js')).toBe(true);
      expect(partitioner.isIgnoredFile('packages/ui/build/bundle.js')).toBe(true);
      expect(partitioner.isIgnoredFile('out/bundle.js')).toBe(true);

      // TypeScript declarations and source maps
      expect(partitioner.isIgnoredFile('src/index.d.ts')).toBe(true);
      expect(partitioner.isIgnoredFile('packages/superconductor-core/dist/index.d.ts')).toBe(true);
      expect(partitioner.isIgnoredFile('dist/bundle.js.map')).toBe(true);

      // Test coverage
      expect(partitioner.isIgnoredFile('coverage/lcov.info')).toBe(true);
      expect(partitioner.isIgnoredFile('packages/superconductor-core/coverage/coverage-final.json')).toBe(true);

      // Temporary directories
      expect(partitioner.isIgnoredFile('tmp/scratch.ts')).toBe(true);
      expect(partitioner.isIgnoredFile('.tmp/run.log')).toBe(true);
      expect(partitioner.isIgnoredFile('.cache/metadata.json')).toBe(true);

      // Standard project source files MUST NOT be ignored
      expect(partitioner.isIgnoredFile('packages/superconductor-core/src/index.ts')).toBe(false);
      expect(partitioner.isIgnoredFile('src/concurrency/worker.ts')).toBe(false);
      expect(partitioner.isIgnoredFile('packages/engine/src/cache.ts')).toBe(false);
    });
  });
});
