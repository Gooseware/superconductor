import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { ArchitectureScanPartitioner } from '../../src/intelligence/partitioner.js';

describe('Swarm Architecture Scanner & Skill Modernization', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const skillPath = path.join(repoRoot, 'skills/improve-architecture/SKILL.md');
  const swarmScanScript = path.join(repoRoot, 'skills/improve-architecture/scripts/swarm-scan.js');

  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-swarm-scan-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup
    }
  });

  describe('skills/improve-architecture/SKILL.md Specification Compliance', () => {
    it('SKILL.md exists and is documented with the 4-phase swarm workflow', () => {
      expect(fs.existsSync(skillPath)).toBe(true);
      const content = fs.readFileSync(skillPath, 'utf8');

      // Check for the 4 phases
      expect(content).toContain('Phase 1: Swarm Partitioning via Intelligence System');
      expect(content).toContain('Phase 2: Parallel Subagent Scan Dispatch');
      expect(content).toContain('Phase 3: Synthesis into the Astryx Interactive Report App');
      expect(content).toContain('Phase 4: One-Click / Checkbox Track Generation');

      // Check for ArchitectureScanPartitioner and swarm-scan.js references
      expect(content).toContain('ArchitectureScanPartitioner');
      expect(content).toContain('swarm-scan.js');
      expect(content).toContain('architecture-scan-manifest.json');
      expect(content).toContain('architecture-candidates.json');

      // Check for Astryx report frontend app reference
      expect(content).toContain('packages/superconductor-ui/src/apps/architecture-report');

      // Check for the core audit criteria
      expect(content).toContain('Non-DRY Duplicate Logic & Component Reinvention');
      expect(content).toContain('Shallow Modules (Deletion Test Candidates)');
      expect(content).toContain('Leaky Seams & High Coupling Clusters');
    });
  });

  describe('swarm-scan.js CLI Script Execution', () => {
    it('swarm-scan.js script file exists and is executable', () => {
      expect(fs.existsSync(swarmScanScript)).toBe(true);
      const stat = fs.statSync(swarmScanScript);
      expect(stat.mode & 0o111).toBeGreaterThan(0); // Executable
    });

    it('generates scan manifest cleanly with --manifest-only --json', () => {
      // Setup mock intelligence files in tempDir
      const intelDir = path.join(tempDir, 'superconductor', 'intelligence');
      fs.mkdirSync(intelDir, { recursive: true });

      fs.writeFileSync(
        path.join(intelDir, '08_dependency_surface.json'),
        JSON.stringify({
          heatmap: {
            'src/engine/runner.ts': 8,
            'src/engine/worker.ts': 6,
            'src/ui/Button.tsx': 4,
            'src/ui/Card.tsx': 3,
          },
        })
      );

      fs.writeFileSync(
        path.join(intelDir, '04_coupling.json'),
        JSON.stringify([
          { file: 'src/engine/runner.ts', churnCount: 15, dependents: ['src/engine/worker.ts'] },
          { file: 'src/ui/Button.tsx', churnCount: 2, dependents: ['src/ui/Card.tsx'] },
        ])
      );

      fs.writeFileSync(
        path.join(intelDir, '03_complexity.json'),
        JSON.stringify([
          { file: 'src/engine/runner.ts', cyclomatic_complexity: 12, hotspot_score: 25 },
          { file: 'src/engine/worker.ts', cyclomatic_complexity: 4, hotspot_score: 5 },
          { file: 'src/ui/Button.tsx', cyclomatic_complexity: 2, hotspot_score: 0 },
          { file: 'src/ui/Card.tsx', cyclomatic_complexity: 2, hotspot_score: 0 },
        ])
      );

      const outputManifest = path.join(tempDir, 'test-manifest.json');

      const stdout = execFileSync(
        'node',
        [
          swarmScanScript,
          '--project-root',
          tempDir,
          '--intel-dir',
          intelDir,
          '--output-manifest',
          outputManifest,
          '--manifest-only',
          '--json',
        ],
        { encoding: 'utf8' }
      );

      const manifest = JSON.parse(stdout);
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.totalFiles).toBe(4);
      expect(manifest.partitions.length).toBeGreaterThan(0);
      expect(fs.existsSync(outputManifest)).toBe(true);

      // Verify strict disjointness in manifest
      const seen = new Set<string>();
      for (const p of manifest.partitions) {
        for (const f of p.files) {
          expect(seen.has(f)).toBe(false);
          seen.add(f);
        }
      }
      expect(seen.size).toBe(4);
    });

    it('aggregates subagent candidate reports with --aggregate', () => {
      const subagent1File = path.join(tempDir, 'subagent-1.json');
      const subagent2File = path.join(tempDir, 'subagent-2.json');
      const outputCandidates = path.join(tempDir, 'architecture-candidates.json');

      const candidate1 = {
        id: 'cand-1',
        type: 'NON_DRY_DUPLICATION',
        title: 'Consolidate duplicate cache managers',
        description: 'Two cache managers detected in engine and core.',
        files: ['packages/engine/src/cache.ts', 'packages/core/src/cache.ts'],
        recommendationStrength: 'Strong',
        benefits: {
          locality: 'High',
          leverage: 'High',
          testability: 'High',
        },
        beforeAfter: {
          beforeDiagram: 'flowchart TD\n  A --> B',
          afterDiagram: 'flowchart TD\n  A --> C',
          beforeDescription: 'Before',
          afterDescription: 'After',
        },
        proposedTrack: {
          trackId: 'dry_consolidate_cache_20261001',
          title: 'Consolidate Cache Modules',
          description: 'Refactor into core.',
          filesAffected: ['packages/engine/src/cache.ts', 'packages/core/src/cache.ts'],
        },
      };

      const candidate2 = {
        id: 'cand-2',
        type: 'SHALLOW_MODULE',
        title: 'Inline shallow dispatcher shim',
        description: 'Dispatcher shim exhibits no logic.',
        files: ['packages/engine/src/dispatcher-shim.ts'],
        recommendationStrength: 'Strong',
        benefits: {
          locality: 'Med',
          leverage: 'Med',
          testability: 'High',
        },
        beforeAfter: {
          beforeDiagram: 'flowchart TD\n  A --> B',
          afterDiagram: 'flowchart TD\n  A --> C',
          beforeDescription: 'Before',
          afterDescription: 'After',
        },
        proposedTrack: {
          trackId: 'deepen_shallow_dispatcher_20261001',
          title: 'Inline Shallow Dispatcher Shim',
          description: 'Inline into engine.',
          filesAffected: ['packages/engine/src/dispatcher-shim.ts'],
        },
      };

      fs.writeFileSync(subagent1File, JSON.stringify([candidate1], null, 2));
      fs.writeFileSync(subagent2File, JSON.stringify([candidate2], null, 2));

      const stdout = execFileSync(
        'node',
        [
          swarmScanScript,
          '--project-root',
          tempDir,
          '--aggregate',
          subagent1File,
          subagent2File,
          '--output-candidates',
          outputCandidates,
          '--json',
        ],
        { encoding: 'utf8' }
      );

      const report = JSON.parse(stdout);
      expect(report.version).toBe('1.0.0');
      expect(report.candidates.length).toBe(2);
      expect(report.metrics.totalCandidates).toBe(2);
      expect(report.metrics.nonDryCount).toBe(1);
      expect(report.metrics.shallowModuleCount).toBe(1);
      expect(report.topRecommendationId).toBe('cand-1');
      expect(fs.existsSync(outputCandidates)).toBe(true);
    });

    it('runs full scan and identifies candidates with proposed tracks', async () => {
      const intelDir = path.join(tempDir, 'superconductor', 'intelligence');
      fs.mkdirSync(intelDir, { recursive: true });

      fs.writeFileSync(
        path.join(intelDir, '08_dependency_surface.json'),
        JSON.stringify({
          heatmap: {
            'src/cache/local-cache.ts': 5,
            'src/cache/remote-cache.ts': 5,
            'src/dispatcher/shim.ts': 4,
            'src/concurrency/turbulent.ts': 6,
          },
        })
      );

      fs.writeFileSync(
        path.join(intelDir, '04_coupling.json'),
        JSON.stringify([
          { file: 'src/concurrency/turbulent.ts', churnCount: 35, dependents: ['src/dispatcher/shim.ts'] },
        ])
      );

      fs.writeFileSync(
        path.join(intelDir, '03_complexity.json'),
        JSON.stringify([
          { file: 'src/cache/local-cache.ts', cyclomatic_complexity: 5, hotspot_score: 5 },
          { file: 'src/cache/remote-cache.ts', cyclomatic_complexity: 5, hotspot_score: 5 },
          { file: 'src/dispatcher/shim.ts', cyclomatic_complexity: 1, nloc: 10, hotspot_score: 0 },
          { file: 'src/concurrency/turbulent.ts', cyclomatic_complexity: 15, hotspot_score: 30 },
        ])
      );

      const partitioner = new ArchitectureScanPartitioner();
      const partitions = await partitioner.partitionForSwarmScan({
        projectRoot: tempDir,
        outputDir: intelDir,
        targetAgents: 2,
      });

      const candidates = await partitioner.detectCandidates(partitions, {
        projectRoot: tempDir,
        outputDir: intelDir,
      });

      const report = partitioner.aggregateFindings([candidates], tempDir);

      expect(report.candidates.length).toBeGreaterThan(0);

      // Verify candidate details
      for (const cand of report.candidates) {
        expect(cand.id).toBeTruthy();
        expect(cand.title).toBeTruthy();
        expect(cand.description).toBeTruthy();
        expect(cand.files.length).toBeGreaterThan(0);
        expect(cand.recommendationStrength).toMatch(/^(Strong|Worth exploring|Speculative)$/);
        expect(cand.beforeAfter.beforeDiagram).toContain('flowchart');
        expect(cand.beforeAfter.afterDiagram).toContain('flowchart');
        expect(cand.proposedTrack.trackId).toBeTruthy();
        expect(cand.proposedTrack.title).toBeTruthy();
        expect(cand.proposedTrack.description).toBeTruthy();
        expect(cand.proposedTrack.filesAffected.length).toBeGreaterThan(0);
      }

      // Check that shallow module was identified
      const shallow = report.candidates.find((c) => c.type === 'SHALLOW_MODULE');
      expect(shallow).toBeDefined();
      expect(shallow!.files).toContain('src/dispatcher/shim.ts');
    });

    it('honors --dry-run by not writing candidate report or manifest and logging [DRY RUN] (REV-5)', () => {
      const intelDir = path.join(tempDir, 'superconductor', 'intelligence');
      fs.mkdirSync(intelDir, { recursive: true });

      fs.writeFileSync(
        path.join(intelDir, '08_dependency_surface.json'),
        JSON.stringify({ heatmap: { 'src/core/item.ts': 5 } })
      );
      fs.writeFileSync(
        path.join(intelDir, '04_coupling.json'),
        JSON.stringify([])
      );
      fs.writeFileSync(
        path.join(intelDir, '03_complexity.json'),
        JSON.stringify([{ file: 'src/core/item.ts', cyclomatic_complexity: 2, hotspot_score: 1 }])
      );

      const outputManifest = path.join(tempDir, 'dry-run-manifest.json');
      const outputCandidates = path.join(tempDir, 'dry-run-candidates.json');

      const stdout = execFileSync(
        'node',
        [
          swarmScanScript,
          '--project-root',
          tempDir,
          '--intel-dir',
          intelDir,
          '--output-manifest',
          outputManifest,
          '--output-candidates',
          outputCandidates,
          '--dry-run',
        ],
        { encoding: 'utf8' }
      );

      expect(stdout).toContain('[DRY RUN] Would write candidates report to:');
      expect(stdout).toContain(outputCandidates);
      expect(stdout).toContain('[DRY RUN] Would write scan manifest to:');
      expect(stdout).toContain(outputManifest);
      expect(fs.existsSync(outputManifest)).toBe(false);
      expect(fs.existsSync(outputCandidates)).toBe(false);
    });

    it('honors --dry-run in aggregate mode by not writing candidates report and logging [DRY RUN]', () => {
      const subagentFile = path.join(tempDir, 'subagent.json');
      const outputCandidates = path.join(tempDir, 'dry-run-candidates-aggregate.json');

      const candidate = {
        id: 'cand-dry',
        type: 'NON_DRY_DUPLICATION',
        title: 'Dry run duplication test',
        description: 'Test dry run aggregate.',
        files: ['packages/engine/src/test.ts'],
        recommendationStrength: 'Strong',
        benefits: { locality: 'High', leverage: 'High', testability: 'High' },
        beforeAfter: {
          beforeDiagram: 'flowchart TD\n  A --> B',
          afterDiagram: 'flowchart TD\n  A --> C',
          beforeDescription: 'Before',
          afterDescription: 'After',
        },
        proposedTrack: {
          trackId: 'dry_run_track_20261001',
          title: 'Dry Run Track',
          description: 'Refactor test.',
          filesAffected: ['packages/engine/src/test.ts'],
        },
      };

      fs.writeFileSync(subagentFile, JSON.stringify([candidate], null, 2));

      const stdout = execFileSync(
        'node',
        [
          swarmScanScript,
          '--project-root',
          tempDir,
          '--aggregate',
          subagentFile,
          '--output-candidates',
          outputCandidates,
          '--dry-run',
        ],
        { encoding: 'utf8' }
      );

      expect(stdout).toContain('[DRY RUN] Would write candidates report to:');
      expect(stdout).toContain(outputCandidates);
      expect(fs.existsSync(outputCandidates)).toBe(false);
    });
  });
});
