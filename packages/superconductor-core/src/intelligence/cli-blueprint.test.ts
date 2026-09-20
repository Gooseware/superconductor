import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync, spawnSync } from 'child_process';
import {
  extractTrackId,
  injectBlueprintSection,
  runCliBlueprint,
  main,
  isDirectExecution,
  BlueprintCliSummary,
} from './cli-blueprint.js';
import { IntelligencePreflightCheck, PreflightCheckResult } from './preflight-check.js';
import { SwarmBlueprintGenerator, SwarmBlueprint } from './swarm-blueprint-generator.js';

describe('cli-blueprint', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-blueprint-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('extractTrackId', () => {
    it('extracts track_id from header markdown with backticks', () => {
      const plan = '# Implementation Plan: `intel_setup_2026`\n\n## Phase 1';
      expect(extractTrackId(plan, '/any/path/plan.md')).toBe('intel_setup_2026');
    });

    it('extracts track_id from header markdown without backticks', () => {
      const plan = '# Implementation Plan: intel_setup_2026\n\n## Phase 1';
      expect(extractTrackId(plan, '/any/path/plan.md')).toBe('intel_setup_2026');
    });

    it('extracts track_id from **Track ID:** line', () => {
      const plan = '# Implementation Plan: My Title\n**Track ID:** `ad_hoc_triage_2026`\n\n## Phase 1';
      expect(extractTrackId(plan, '/any/path/plan.md')).toBe('ad_hoc_triage_2026');
    });

    it('extracts track_id from JSON metadata block', () => {
      const plan = '```json\n{\n  "track_id": "json_track_2026"\n}\n```';
      expect(extractTrackId(plan, '/any/path/plan.md')).toBe('json_track_2026');
    });

    it('extracts track_id from file directory path when not explicit in markdown', () => {
      const plan = '# Some General Title\n\n## Phase 1';
      const planPath = path.join(tempDir, 'superconductor', 'tracks', 'track_from_dir_2026', 'plan.md');
      expect(extractTrackId(plan, planPath)).toBe('track_from_dir_2026');
    });

    it('falls back to unknown if no track id or recognizable folder', () => {
      const plan = '# General Title\n\n## Phase 1';
      expect(extractTrackId(plan, path.join(tempDir, 'plan.md'))).toBe('unknown');
    });
  });

  describe('injectBlueprintSection', () => {
    const mockSection = `## Swarm Blueprint\n\n**Mode:** pipeline\n**Estimated Track Token Budget:** $0.50\n\n### Wave Schedule\n| Wave | Tasks |\n|---|---|`;

    it('injects blueprint section before first ## Phase', () => {
      const plan = `# Implementation Plan: \`sample_track\`\n\n> Notes\n\n---\n\n## Phase 1: Setup\n- [ ] Task: Init`;
      const result = injectBlueprintSection(plan, mockSection);

      expect(result).toContain('## Swarm Blueprint');
      expect(result).toContain('**Mode:** pipeline');
      expect(result.indexOf('## Swarm Blueprint')).toBeLessThan(result.indexOf('## Phase 1: Setup'));
    });

    it('replaces existing ## Swarm Blueprint cleanly without duplication', () => {
      const initialPlan = `# Implementation Plan: \`sample_track\`\n\n---\n\n## Phase 1: Setup\n- [ ] Task: Init`;
      const firstPass = injectBlueprintSection(initialPlan, mockSection);
      expect(firstPass).toContain('## Swarm Blueprint');

      const updatedSection = `## Swarm Blueprint\n\n**Mode:** pipeline updated\n**Estimated Track Token Budget:** $0.99\n\n### Wave Schedule\n| Wave | Tasks |`;
      const secondPass = injectBlueprintSection(firstPass, updatedSection);

      // Verify no duplicate headers
      const matches = secondPass.match(/## Swarm Blueprint/g);
      expect(matches).toHaveLength(1);
      expect(secondPass).toContain('**Mode:** pipeline updated');
      expect(secondPass).toContain('$0.99');
      expect(secondPass).not.toContain('$0.50');
    });

    it('appends section at end if plan contains no ## Phase', () => {
      const plan = `# Title without phase\n\nJust some notes.`;
      const result = injectBlueprintSection(plan, mockSection);
      expect(result).toContain('## Swarm Blueprint');
      expect(result).toContain('Just some notes.');
    });
  });

  describe('runCliBlueprint', () => {
    it('throws error when planPath is missing', async () => {
      await expect(runCliBlueprint('')).rejects.toThrow('Missing plan.md path argument');
    });

    it('throws error when plan file does not exist', async () => {
      const nonExistent = path.join(tempDir, 'does_not_exist.md');
      await expect(runCliBlueprint(nonExistent)).rejects.toThrow('Plan file not found');
    });

    it('preflights with IntelligencePreflightCheck.run() and annotates plan in place', async () => {
      const trackDir = path.join(tempDir, 'superconductor', 'tracks', 'sample_track');
      fs.mkdirSync(trackDir, { recursive: true });
      const planPath = path.join(trackDir, 'plan.md');

      const originalPlan = `# Implementation Plan: \`sample_track\`\n\n---\n\n## Phase 1: Core\n- [ ] Task: Implement core logic\n- [ ] Task: Implement CLI wrapper [TIER-2]\n\n## Phase 2: Verification\n- [ ] Task: Run full test suite\n`;
      fs.writeFileSync(planPath, originalPlan, 'utf8');

      const preflightSpy = vi.spyOn(IntelligencePreflightCheck, 'run').mockReturnValue({
        report: {
          status: 'NONE',
          project_root: tempDir,
          manifest_project_root: null,
          snapshot_path: path.join(tempDir, 'superconductor', 'intelligence', '00_manifest.json'),
          head_commit: 'unknown',
          age_days: 0,
          commits_behind: 0,
          phases_ok: false,
        },
        formattedBanner: '[superconductor] Intelligence: NONE | Run: /superconductor:setup to index this project',
        isMismatch: false,
      });

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const result = await runCliBlueprint(planPath, { projectRoot: tempDir });

      expect(preflightSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[superconductor] Intelligence: NONE'));

      // Check summary
      expect(result.summary.track_id).toBe('sample_track');
      expect(result.summary.waves).toBeGreaterThan(0);
      expect(result.summary.oracleCadence).toBeGreaterThan(0);
      expect(result.summary.costSummary).toMatch(/^\$/);
      expect(result.summary.estimatedTasks).toBe(3);
      expect(result.summary.source).toBe('keyword_heuristics');

      // Check file was updated in place
      const updatedOnDisk = fs.readFileSync(planPath, 'utf8');
      expect(updatedOnDisk).toContain('## Swarm Blueprint');
      expect(updatedOnDisk).toContain('### Wave Schedule');
      expect(updatedOnDisk).toMatch(/- \[ \] Task: Implement core logic \[TIER-\d+:TCS=\d+\]/);
      expect(updatedOnDisk).toMatch(/- \[ \] Task: Implement CLI wrapper \[TIER-2:TCS=\d+\]/);
      expect(updatedOnDisk).toMatch(/- \[ \] Task: Run full test suite \[TIER-\d+:TCS=\d+\]/);
    });

    it('reports source: "intelligence" when snapshot is available and LIVE', async () => {
      const trackDir = path.join(tempDir, 'superconductor', 'tracks', 'live_track');
      fs.mkdirSync(trackDir, { recursive: true });
      const planPath = path.join(trackDir, 'plan.md');

      fs.writeFileSync(
        planPath,
        `# Implementation Plan: \`live_track\`\n\n## Phase 1: Work\n- [ ] Task: Build module\n`,
        'utf8'
      );

      // Create fake intelligence files
      const intelDir = path.join(tempDir, 'superconductor', 'intelligence');
      fs.mkdirSync(intelDir, { recursive: true });
      fs.writeFileSync(
        path.join(intelDir, '00_manifest.json'),
        JSON.stringify({
          project_root: tempDir,
          manifest_project_root: tempDir,
          lastCommitSha: '1234567890abcdef',
          timestamp: Date.now(),
        })
      );

      vi.spyOn(IntelligencePreflightCheck, 'run').mockReturnValue({
        report: {
          status: 'LIVE',
          project_root: tempDir,
          manifest_project_root: tempDir,
          snapshot_path: path.join(intelDir, '00_manifest.json'),
          head_commit: '1234567890abcdef',
          age_days: 0.1,
          commits_behind: 0,
          phases_ok: true,
        },
        formattedBanner: '[superconductor] Intelligence: LIVE | Project: test | SHA: 1234567 | Age: 2h',
        isMismatch: false,
      });

      // Mock SwarmBlueprintGenerator.generate to return repoContextSource: 'intelligence'
      const originalGenerate = SwarmBlueprintGenerator.generate;
      vi.spyOn(SwarmBlueprintGenerator, 'generate').mockImplementation((plan, opts) => {
        const bp = originalGenerate(plan, opts);
        return {
          ...bp,
          repoContextSource: 'intelligence',
        };
      });

      const result = await runCliBlueprint(planPath, { projectRoot: tempDir, silentPreflight: true });
      expect(result.summary.source).toBe('intelligence');
    });

    it('falls back to source: "keyword_heuristics" when preflight detects MISMATCH', async () => {
      const trackDir = path.join(tempDir, 'superconductor', 'tracks', 'mismatch_track');
      fs.mkdirSync(trackDir, { recursive: true });
      const planPath = path.join(trackDir, 'plan.md');

      fs.writeFileSync(
        planPath,
        `# Implementation Plan: \`mismatch_track\`\n\n## Phase 1: Work\n- [ ] Task: Build module\n`,
        'utf8'
      );

      vi.spyOn(IntelligencePreflightCheck, 'run').mockReturnValue({
        report: {
          status: 'MISMATCH',
          project_root: tempDir,
          manifest_project_root: '/other/workspace',
          snapshot_path: path.join(tempDir, 'superconductor', 'intelligence', '00_manifest.json'),
          head_commit: '1234567890abcdef',
          age_days: 0.1,
          commits_behind: 0,
          phases_ok: true,
        },
        formattedBanner: '[superconductor] Intelligence: MISMATCH | Indexed: /other/workspace | Current: ' + tempDir,
        isMismatch: true,
      });

      const result = await runCliBlueprint(planPath, { projectRoot: tempDir, silentPreflight: true });
      expect(result.summary.source).toBe('keyword_heuristics');
    });
  });

  describe('main', () => {
    it('prints pure JSON summary to stdout and returns summary on success', async () => {
      const trackDir = path.join(tempDir, 'superconductor', 'tracks', 'main_track');
      fs.mkdirSync(trackDir, { recursive: true });
      const planPath = path.join(trackDir, 'plan.md');

      fs.writeFileSync(
        planPath,
        `# Implementation Plan: \`main_track\`\n\n## Phase 1: Start\n- [ ] Task: Implement feature\n`,
        'utf8'
      );

      const stdoutLines: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
        stdoutLines.push(msg);
      });

      const summary = await main([planPath]);

      expect(logSpy).toHaveBeenCalled();
      expect(summary.track_id).toBe('main_track');
      expect(summary.waves).toBeGreaterThanOrEqual(1);
      expect(summary.estimatedTasks).toBe(1);

      // Verify stdout was valid JSON parseable by skills
      const parsedStdout = JSON.parse(stdoutLines.join('\n'));
      expect(parsedStdout.track_id).toBe('main_track');
      expect(parsedStdout.waves).toBe(summary.waves);
      expect(parsedStdout.oracleCadence).toBe(summary.oracleCadence);
      expect(parsedStdout.costSummary).toBe(summary.costSummary);
      expect(parsedStdout.estimatedTasks).toBe(summary.estimatedTasks);
      expect(parsedStdout.source).toBe(summary.source);
    });

    it('exits with code 1 and writes usage when no arguments provided', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: any) => {
        throw new Error(`process.exit: ${code}`);
      }) as any);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      await expect(main([])).rejects.toThrow('process.exit: 1');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: node dist/intelligence/cli-blueprint.js'));
    });

    it('exits with code 1 and writes error when file does not exist', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: any) => {
        throw new Error(`process.exit: ${code}`);
      }) as any);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      await expect(main(['/non/existent/plan.md'])).rejects.toThrow('process.exit: 1');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[superconductor:blueprint] ERROR:'));
    });
  });

  describe('isDirectExecution', () => {
    it('returns false when argv[1] does not match module path', () => {
      expect(isDirectExecution('/some/other/script.js', 'file:///target/cli-blueprint.js')).toBe(false);
    });

    it('returns false when argv[1] is undefined', () => {
      expect(isDirectExecution(undefined, 'file:///target/cli-blueprint.js')).toBe(false);
    });
  });

  describe('CLI subprocess execution', () => {
    const compiledCliPath = path.resolve(__dirname, '../../dist/intelligence/cli-blueprint.js');

    it('executes compiled CLI script directly via node on a plan file', () => {
      if (!fs.existsSync(compiledCliPath)) {
        // Build may not have run yet in isolated unit test mode
        return;
      }

      const trackDir = path.join(tempDir, 'superconductor', 'tracks', 'subprocess_track');
      fs.mkdirSync(trackDir, { recursive: true });
      const planPath = path.join(trackDir, 'plan.md');

      fs.writeFileSync(
        planPath,
        `# Implementation Plan: \`subprocess_track\`\n\n---\n\n## Phase 1: Setup\n- [ ] Task: Alpha task\n- [ ] Task: Beta task [TIER-2]\n`,
        'utf8'
      );

      const spawnResult = spawnSync('node', [compiledCliPath, planPath], {
        encoding: 'utf8',
      });

      expect(spawnResult.status).toBe(0);

      // Verify stdout parses as valid BlueprintCliSummary
      const stdoutSummary = JSON.parse(spawnResult.stdout.trim());
      expect(stdoutSummary.track_id).toBe('subprocess_track');
      expect(stdoutSummary.waves).toBeGreaterThan(0);
      expect(stdoutSummary.oracleCadence).toBeGreaterThan(0);
      expect(stdoutSummary.costSummary).toMatch(/^\$\d+\.\d{2}$/);
      expect(stdoutSummary.estimatedTasks).toBe(2);
      expect(stdoutSummary.source).toBe('keyword_heuristics');

      // Verify plan.md was updated in place
      const updated = fs.readFileSync(planPath, 'utf8');
      expect(updated).toContain('## Swarm Blueprint');
      expect(updated).toMatch(/- \[ \] Task: Alpha task \[TIER-\d+:TCS=\d+\]/);
      expect(updated).toMatch(/- \[ \] Task: Beta task \[TIER-2:TCS=\d+\]/);
    });

    it('fails with exit code 1 and writes usage to stderr when no arguments are provided', () => {
      if (!fs.existsSync(compiledCliPath)) {
        return;
      }

      const spawnResult = spawnSync('node', [compiledCliPath], {
        encoding: 'utf8',
      });

      expect(spawnResult.status).toBe(1);
      expect(spawnResult.stderr).toContain('Usage: node dist/intelligence/cli-blueprint.js');
    });
  });
});

