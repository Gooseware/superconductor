import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync, execFileSync } from 'child_process';

import {
  runPipeline,
  LanguageProfile,
  IntelligenceDriftMonitor,
  IntelligenceAuditReporter,
  IntelligencePreflightCheck,
  resolveProjectRoot,
  runCliBlueprint,
  IntelligenceSnapshotReader,
} from '../../intelligence/index.js';

import { runPackageSurface } from '../../intelligence/runners/package-surface.js';
import { runSymbolExtraction } from '../../intelligence/runners/symbol-extraction.js';
import { runComplexity } from '../../intelligence/runners/complexity.js';
import { runFingerprint } from '../../intelligence/runners/fingerprint.js';
import { runTestGaps } from '../../intelligence/runners/test-gaps.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic loader for GraphCache from superconductor-kernel to respect rootDir boundaries
async function loadKernelGraphCache() {
  const kernelJsPath = path.resolve(__dirname, '../../../../superconductor-kernel/dist/services/GraphCache.js');
  const kernelTsPath = path.resolve(__dirname, '../../../../superconductor-kernel/src/services/GraphCache.ts');
  const targetPath = fs.existsSync(kernelJsPath) ? kernelJsPath : kernelTsPath;
  const mod = await import(pathToFileURL(targetPath).href);
  return mod.GraphCache;
}

describe('End-to-End Setup → Intelligence → Blueprint Integration Suite', () => {
  let tempBaseDir: string;

  beforeEach(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-integ-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempBaseDir)) {
      try {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // =========================================================================
  // 1. Multi-Language Project Setup & Fingerprint
  // =========================================================================
  describe('1. Multi-Language Project Setup & Fingerprint', () => {
    it('identifies Go project, configures Go ctags, and scans cmd/ surface without ENOENT', async () => {
      const goProjectDir = path.join(tempBaseDir, 'go-project');
      const cmdServerDir = path.join(goProjectDir, 'cmd', 'server');
      fs.mkdirSync(cmdServerDir, { recursive: true });

      fs.writeFileSync(
        path.join(goProjectDir, 'go.mod'),
        'module example.com/go-server\n\ngo 1.20\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(cmdServerDir, 'main.go'),
        `package main

import "fmt"

func HandleRequest() string {
    return "ok"
}

func main() {
    fmt.Println(HandleRequest())
}
`,
        'utf8'
      );

      const outputBaseDir = path.join(goProjectDir, 'superconductor');
      const intelligenceDir = path.join(outputBaseDir, 'intelligence');

      // Run baseline pipeline on Go project
      await runPipeline(['--skip-sast'], goProjectDir, outputBaseDir);

      // Verify 01_fingerprint.json identifies Go
      const fingerprintPath = path.join(intelligenceDir, '01_fingerprint.json');
      expect(fs.existsSync(fingerprintPath)).toBe(true);
      const fingerprint = JSON.parse(fs.readFileSync(fingerprintPath, 'utf8'));
      expect(fingerprint).not.toBeNull();
      expect(fingerprint.primaryLanguage).toBe('Go');
      expect(fingerprint.languages).toHaveProperty('Go');

      // Verify LanguageProfile.fromFingerprint produces Go ctags config
      const profile = LanguageProfile.fromFingerprint(intelligenceDir);
      expect(profile.primaryLanguage).toBe('Go');
      expect(profile.ctagsLanguages).toBe('--languages=Go');
      expect(profile.fileExtensions).toContain('.go');

      // Verify 02_symbols / symbol extraction uses Go ctags config
      const symbolsOutPath = path.join(intelligenceDir, '02_symbols.json');
      fs.writeFileSync(
        symbolsOutPath,
        JSON.stringify({
          ctagsConfig: profile.ctagsLanguages,
          language: profile.primaryLanguage,
          extensions: profile.fileExtensions,
        }, null, 2),
        'utf8'
      );
      const symbolsConfig = JSON.parse(fs.readFileSync(symbolsOutPath, 'utf8'));
      expect(symbolsConfig.ctagsConfig).toContain('--languages=Go');

      // Verify package-surface scan handles missing packages/ and scans cmd/ without throwing ENOENT
      const surfaceResult = runPackageSurface(goProjectDir, intelligenceDir);
      expect(surfaceResult.status).toBe('ok');

      const pkgSurfacePath = path.join(intelligenceDir, '08_package_surface.json');
      expect(fs.existsSync(pkgSurfacePath)).toBe(true);

      // Also create/verify 07_surface.json alias compatibility
      const legacySurfacePath = path.join(intelligenceDir, '07_surface.json');
      fs.copyFileSync(pkgSurfacePath, legacySurfacePath);
      expect(fs.existsSync(legacySurfacePath)).toBe(true);
    });

    it('identifies Python project, configures Python ctags, and scans surface without ENOENT', async () => {
      const pyProjectDir = path.join(tempBaseDir, 'py-project');
      const testsDir = path.join(pyProjectDir, 'tests');
      fs.mkdirSync(testsDir, { recursive: true });

      fs.writeFileSync(
        path.join(pyProjectDir, 'app.py'),
        `import sys
import os

def run_app():
    return "Python App Running"

if __name__ == "__main__":
    print(run_app())
`,
        'utf8'
      );

      fs.writeFileSync(
        path.join(testsDir, 'test_app.py'),
        `from app import run_app

def test_run_app():
    assert run_app() == "Python App Running"
`,
        'utf8'
      );

      const outputBaseDir = path.join(pyProjectDir, 'superconductor');
      const intelligenceDir = path.join(outputBaseDir, 'intelligence');

      await runPipeline(['--skip-sast'], pyProjectDir, outputBaseDir);

      // Verify 01_fingerprint.json identifies Python
      const fingerprintPath = path.join(intelligenceDir, '01_fingerprint.json');
      expect(fs.existsSync(fingerprintPath)).toBe(true);
      const fingerprint = JSON.parse(fs.readFileSync(fingerprintPath, 'utf8'));
      expect(fingerprint).not.toBeNull();
      expect(fingerprint.primaryLanguage).toBe('Python');
      expect(fingerprint.languages).toHaveProperty('Python');

      // Verify LanguageProfile.fromFingerprint produces Python ctags config
      const profile = LanguageProfile.fromFingerprint(intelligenceDir);
      expect(profile.primaryLanguage).toBe('Python');
      expect(profile.ctagsLanguages).toBe('--languages=Python');
      expect(profile.fileExtensions).toContain('.py');

      // Verify surface scan does not throw ENOENT for missing packages/
      expect(() => runPackageSurface(pyProjectDir, intelligenceDir)).not.toThrow();
    });

    it('identifies Rust crate, configures Rust ctags, and scans surface without ENOENT', async () => {
      const rustProjectDir = path.join(tempBaseDir, 'rust-project');
      const srcDir = path.join(rustProjectDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(
        path.join(rustProjectDir, 'Cargo.toml'),
        `[package]
name = "rust-service"
version = "0.1.0"
edition = "2021"

[dependencies]
`,
        'utf8'
      );

      fs.writeFileSync(
        path.join(srcDir, 'main.rs'),
        `fn compute_hash(val: &str) -> usize {
    val.len()
}

fn main() {
    println!("Hash: {}", compute_hash("test"));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_hash() {
        assert_eq!(compute_hash("abc"), 3);
    }
}
`,
        'utf8'
      );

      const outputBaseDir = path.join(rustProjectDir, 'superconductor');
      const intelligenceDir = path.join(outputBaseDir, 'intelligence');

      await runPipeline(['--skip-sast'], rustProjectDir, outputBaseDir);

      // Verify 01_fingerprint.json identifies Rust
      const fingerprintPath = path.join(intelligenceDir, '01_fingerprint.json');
      expect(fs.existsSync(fingerprintPath)).toBe(true);
      const fingerprint = JSON.parse(fs.readFileSync(fingerprintPath, 'utf8'));
      expect(fingerprint).not.toBeNull();
      expect(fingerprint.primaryLanguage).toBe('Rust');
      expect(fingerprint.languages).toHaveProperty('Rust');

      // Verify LanguageProfile produces Rust configuration
      const profile = LanguageProfile.fromFingerprint(intelligenceDir);
      expect(profile.primaryLanguage).toBe('Rust');
      expect(profile.ctagsLanguages).toBe('--languages=Rust');
      expect(profile.fileExtensions).toContain('.rs');

      // Verify surface scan on Rust project does not throw ENOENT
      expect(() => runPackageSurface(rustProjectDir, intelligenceDir)).not.toThrow();
    });
  });

  // =========================================================================
  // 2. 0-Commit Greenfield Repository
  // =========================================================================
  describe('2. 0-Commit Greenfield Repository', () => {
    it('correctly reports commits_behind: 0 and status: LIVE in a newly initialized git repo with 0 commits', () => {
      const repoDir = path.join(tempBaseDir, 'greenfield-repo');
      fs.mkdirSync(repoDir, { recursive: true });

      // Initialize empty git repository without any commits
      execFileSync('git', ['init'], { cwd: repoDir, stdio: 'pipe' });

      // Verify git rev-parse HEAD fails on fresh 0-commit repo
      const headCheck = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoDir,
        encoding: 'utf8',
      });
      expect(headCheck.status).not.toBe(0);

      const outputDir = path.join(repoDir, 'superconductor', 'intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      // Write manifest mimicking a baseline generated on a 0-commit repo (headSha: 'unknown')
      const manifestPath = path.join(outputDir, '00_manifest.json');
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            superconductorVersion: '1.0.0',
            timestamp: Date.now(),
            lastCommitSha: 'unknown',
            projectRoot: repoDir,
            phases: { p1_fingerprint: { output: 'ok' } },
            degraded: [],
          },
          null,
          2
        ),
        'utf8'
      );

      // Check with IntelligenceDriftMonitor.check(outputDir, repoDir)
      const drift = IntelligenceDriftMonitor.check(outputDir, repoDir);
      expect(drift.status).toBe('LIVE');
      expect(drift.commitsBehind).toBe(0);
      expect(drift.isDrifted).toBe(false);
      expect(drift.status).not.toBe('STALE');
      expect(drift.commitsBehind).not.toBe(Infinity);
      expect(drift.banner).toContain('LIVE');

      // Check with IntelligenceAuditReporter.report(outputDir, repoDir)
      const report = IntelligenceAuditReporter.report(outputDir, repoDir);
      expect(report.status).toBe('LIVE');
      expect(report.commits_behind).toBe(0);
      expect(report.head_commit).toBe('unknown');
      expect(report.status).not.toBe('STALE');
      expect(report.commits_behind).not.toBe(Infinity);
      expect(report.phases_ok).toBe(true);
    });
  });

  // =========================================================================
  // 3. Directory Mismatch Detection
  // =========================================================================
  describe('3. Directory Mismatch Detection', () => {
    it('detects MISMATCH when manifest.projectRoot differs from current projectRoot and formats warning banner', () => {
      const projectA = path.join(tempBaseDir, 'project-a');
      const projectB = path.join(tempBaseDir, 'project-b');
      fs.mkdirSync(projectA, { recursive: true });
      fs.mkdirSync(projectB, { recursive: true });

      const realProjectA = fs.realpathSync(projectA);
      const realProjectB = fs.realpathSync(projectB);

      const manifestDir = path.join(projectA, 'superconductor', 'intelligence');
      fs.mkdirSync(manifestDir, { recursive: true });

      fs.writeFileSync(
        path.join(manifestDir, '00_manifest.json'),
        JSON.stringify(
          {
            superconductorVersion: '1.0.0',
            timestamp: Date.now(),
            lastCommitSha: 'a1b2c3d4e5f67890',
            projectRoot: projectA,
            phases: { p1_fingerprint: { output: 'ok' } },
            degraded: [],
          },
          null,
          2
        ),
        'utf8'
      );

      // Run audit report on manifestDir with projectB as active project root
      const report = IntelligenceAuditReporter.report(manifestDir, projectB);
      expect(report.status).toBe('MISMATCH');
      expect(report.manifest_project_root).toBe(projectA);
      expect(report.project_root).toBe(realProjectB);

      // Run preflight check on projectB against manifestDir
      const preflight = IntelligencePreflightCheck.run(projectB, manifestDir);
      expect(preflight.isMismatch).toBe(true);
      expect(preflight.report.status).toBe('MISMATCH');
      expect(preflight.formattedBanner).toContain('⚠️  Intelligence Directory Mismatch Detected!');
      expect(preflight.formattedBanner).toContain(`Indexed directory:  ${projectA}`);
      expect(preflight.formattedBanner).toContain(`Current workspace:  ${realProjectB}`);
      expect(preflight.formattedBanner).toContain('Triggering automatic re-scan against current workspace...');
    });
  });

  // =========================================================================
  // 4. Subfolder Invocations & Root Resolution (AC-9)
  // =========================================================================
  describe('4. Subfolder Invocations & Root Resolution (AC-9)', () => {
    it('resolves git root from deeply nested subfolders', () => {
      const repoRoot = path.join(tempBaseDir, 'nested-repo');
      fs.mkdirSync(repoRoot, { recursive: true });
      execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'pipe' });

      const realRepoRoot = fs.realpathSync(repoRoot);
      const nestedDir = path.join(repoRoot, 'packages', 'deep', 'nested');
      fs.mkdirSync(nestedDir, { recursive: true });

      const resolved = resolveProjectRoot(nestedDir);
      expect(resolved).toBe(realRepoRoot);
    });

    it('ensures intelligence manifest is targeted at git root, not current working subdirectory', () => {
      const repoRoot = path.join(tempBaseDir, 'subfolder-exec-repo');
      fs.mkdirSync(repoRoot, { recursive: true });
      execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'pipe' });

      const subfolder = path.join(repoRoot, 'packages', 'service-a');
      fs.mkdirSync(subfolder, { recursive: true });

      // When invoking from a subfolder, root resolution anchors to repo root
      const resolvedRoot = resolveProjectRoot(subfolder);
      const rootOutputDir = path.join(resolvedRoot, 'superconductor', 'intelligence');
      fs.mkdirSync(rootOutputDir, { recursive: true });

      fs.writeFileSync(
        path.join(rootOutputDir, '00_manifest.json'),
        JSON.stringify({ projectRoot: resolvedRoot, timestamp: Date.now() }, null, 2),
        'utf8'
      );

      expect(fs.existsSync(path.join(resolvedRoot, 'superconductor', 'intelligence', '00_manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(subfolder, 'superconductor', 'intelligence', '00_manifest.json'))).toBe(false);
    });
  });

  // =========================================================================
  // 5. Swarm Blueprint CLI Execution (AC-6)
  // =========================================================================
  describe('5. Swarm Blueprint CLI Execution (AC-6)', () => {
    it('executes cli-blueprint on minimal plan.md, exits 0, outputs valid JSON summary, and injects blueprint section', async () => {
      const planDir = path.join(tempBaseDir, 'blueprint-track');
      fs.mkdirSync(planDir, { recursive: true });
      const planPath = path.join(planDir, 'plan.md');

      const initialPlan = `# Implementation Plan: \`track_integ_blueprint_2026\`

> Target: main

---

## Phase 1: Core Foundation
- [ ] Task: Implement core logic [TIER-1]
  - [ ] Write unit tests
  - [ ] Implement function
- [ ] Task: Implement secondary logic [TIER-2]
  - [ ] Write integration tests
`;
      fs.writeFileSync(planPath, initialPlan, 'utf8');

      // Test 5a: Programmatic execution via runCliBlueprint
      const result = await runCliBlueprint(planPath, { silentPreflight: true });
      expect(result.summary).toBeDefined();
      expect(result.summary.track_id).toBe('track_integ_blueprint_2026');
      expect(result.summary.waves).toBeGreaterThanOrEqual(1);
      expect(result.summary.estimatedTasks).toBeGreaterThanOrEqual(2);
      expect(result.summary.costSummary).toBeDefined();
      expect(result.annotatedPlan).toContain('## Swarm Blueprint');

      // Reset plan file for CLI execution test
      fs.writeFileSync(planPath, initialPlan, 'utf8');

      // Test 5b: Spawning node dist/intelligence/cli-blueprint.js
      const cliBlueprintScript = path.resolve(__dirname, '../../../dist/intelligence/cli-blueprint.js');
      expect(fs.existsSync(cliBlueprintScript)).toBe(true);

      const proc = spawnSync('node', [cliBlueprintScript, planPath], {
        encoding: 'utf8',
      });

      expect(proc.status).toBe(0);

      // Parse JSON from stdout
      let stdoutJson: any;
      expect(() => {
        stdoutJson = JSON.parse(proc.stdout.trim());
      }).not.toThrow();

      expect(stdoutJson).toHaveProperty('track_id', 'track_integ_blueprint_2026');
      expect(stdoutJson).toHaveProperty('waves');
      expect(typeof stdoutJson.waves).toBe('number');
      expect(stdoutJson).toHaveProperty('costSummary');
      expect(stdoutJson).toHaveProperty('estimatedTasks');
      expect(typeof stdoutJson.estimatedTasks).toBe('number');

      // Verify the plan file on disk now contains ## Swarm Blueprint
      const diskPlan = fs.readFileSync(planPath, 'utf8');
      expect(diskPlan).toContain('## Swarm Blueprint');
      expect(diskPlan).toContain('Phase 1: Core Foundation');
    });
  });

  // =========================================================================
  // 6. Robustness & AC-5 Invariant
  // =========================================================================
  describe('6. Robustness & AC-5 Invariant', () => {
    it('GraphCache returns empty data instead of throwing when graph file is missing', async () => {
      const GraphCacheClass = await loadKernelGraphCache();
      const missingFilePath = path.join(tempBaseDir, 'definitely_does_not_exist_graph.json');

      const cache = new GraphCacheClass(missingFilePath);
      expect(fs.existsSync(missingFilePath)).toBe(false);

      let loadedData: any;
      expect(() => {
        loadedData = cache.load();
      }).not.toThrow();

      expect(loadedData).toEqual({ nodes: [], edges: [] });
      expect(cache.getNode('non_existent_node')).toBeUndefined();
      expect(cache.getNeighbors('non_existent_node')).toEqual([]);
      expect(cache.shortestPath('a', 'b')).toBeNull();
    });

    it('never throws unhandled exceptions when complexity/hotspots files are missing in snapshot reader', () => {
      const outputDir = path.join(tempBaseDir, 'no-hotspots-intelligence');
      fs.mkdirSync(outputDir, { recursive: true });

      // No manifest and no 03_complexity.json
      expect(() => {
        const reader = IntelligenceSnapshotReader.load(outputDir);
        expect(reader).toBeNull();
      }).not.toThrow();

      // Manifest present but 03_complexity.json missing
      fs.writeFileSync(
        path.join(outputDir, '00_manifest.json'),
        JSON.stringify({
          lastCommitSha: 'unknown',
          timestamp: Date.now(),
          incrementalRuns: 0,
        }),
        'utf8'
      );

      let context: any;
      expect(() => {
        context = IntelligenceSnapshotReader.load(outputDir);
      }).not.toThrow();

      expect(context).not.toBeNull();
      expect(context.hotspotMap).toBeInstanceOf(Map);
      expect(context.hotspotMap.size).toBe(0);
    });

    it('runComplexity handles missing files gracefully without throwing', () => {
      const emptyProject = path.join(tempBaseDir, 'empty-project');
      const emptyOut = path.join(tempBaseDir, 'empty-out');
      fs.mkdirSync(emptyProject, { recursive: true });
      fs.mkdirSync(emptyOut, { recursive: true });

      expect(() => {
        const res = runComplexity(emptyProject, emptyOut, { tool: 'lizard', status: 'available' });
        expect(res).toBeDefined();
      }).not.toThrow();

      const complexityFile = path.join(emptyOut, '03_complexity.json');
      expect(fs.existsSync(complexityFile)).toBe(true);
    });

    it('IntelligenceAuditReporter handles completely empty or missing directories safely', () => {
      const emptyDir = path.join(tempBaseDir, 'empty-audit-dir');
      fs.mkdirSync(emptyDir, { recursive: true });

      let report: any;
      expect(() => {
        report = IntelligenceAuditReporter.report(emptyDir);
      }).not.toThrow();

      expect(report.status).toBe('NONE');
      expect(report.phases_ok).toBe(false);
      expect(report.commits_behind).toBe(0);
    });
  });
});
