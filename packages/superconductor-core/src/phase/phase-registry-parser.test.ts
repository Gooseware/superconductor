import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PhaseRegistryParser } from './phase-registry-parser.js';
import type { RegistryManifest } from './phase-manifest.js';

describe('PhaseRegistryParser', () => {
  describe('parse - multi-phase markdown', () => {
    it('parses multi-phase document with Phase headings and tables', () => {
      const markdown = `# Tracks Registry

## Phase 1: Core Foundation (Active)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`core_architecture\` | Core Architecture | \`main\` |
| \`[~]\` | \`dynamic_registry\` | [Dynamic Registry](./tracks/dynamic_registry/) | \`track/dynamic_registry\` |

## Phase 2: Multi-Language & UX (Planned)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[ ]\` | \`polyglot_ast\` | Polyglot AST Engine | \`feat/polyglot\` |
`;

      const manifest = PhaseRegistryParser.parse(markdown);

      expect(manifest.phases).toHaveLength(2);

      const phase1 = manifest.phases[0];
      expect(phase1.ordinal).toBe(1);
      expect(phase1.phaseId).toBe('core-foundation');
      expect(phase1.name).toBe('Core Foundation');
      expect(phase1.status).toBe('active');
      expect(phase1.tracks).toHaveLength(2);
      expect(phase1.tracks[0]).toEqual({
        trackId: 'core_architecture',
        title: 'Core Architecture',
        status: 'completed',
        branch: 'main',
      });
      expect(phase1.tracks[1]).toEqual({
        trackId: 'dynamic_registry',
        title: 'Dynamic Registry',
        status: 'in_progress',
        branch: 'track/dynamic_registry',
        link: './tracks/dynamic_registry/',
      });

      const phase2 = manifest.phases[1];
      expect(phase2.ordinal).toBe(2);
      expect(phase2.phaseId).toBe('multi-language-ux');
      expect(phase2.name).toBe('Multi-Language & UX');
      expect(phase2.status).toBe('planned');
      expect(phase2.tracks).toHaveLength(1);
      expect(phase2.tracks[0]).toEqual({
        trackId: 'polyglot_ast',
        title: 'Polyglot AST Engine',
        status: 'planned',
        branch: 'feat/polyglot',
      });
    });

    it('parses headings with explicit symbolic phase IDs in brackets', () => {
      const markdown = `
## Phase [custom-id-1]: Foundation Layer (Completed)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`p1_track\` | P1 Track | \`main\` |

## Phase 2 [custom-id-2]: Secondary Layer (Blocked)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[ ]\` | \`p2_track\` | P2 Track | \`feat/p2\` |
`;

      const manifest = PhaseRegistryParser.parse(markdown);
      expect(manifest.phases).toHaveLength(2);

      expect(manifest.phases[0].phaseId).toBe('custom-id-1');
      expect(manifest.phases[0].name).toBe('Foundation Layer');
      expect(manifest.phases[0].status).toBe('completed');

      expect(manifest.phases[1].phaseId).toBe('custom-id-2');
      expect(manifest.phases[1].ordinal).toBe(2);
      expect(manifest.phases[1].name).toBe('Secondary Layer');
      expect(manifest.phases[1].status).toBe('blocked');
    });

    it('parses Absorbed and Archived sections', () => {
      const markdown = `
## Phase 1: Alpha (Active)

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`track_alpha\` | Alpha | \`main\` |

## Absorbed / Closed Tracks

| Track ID | Absorbed By | Reason |
|----------|-------------|--------|
| \`scripted_swarm\` | \`superconductor_kernel\` | Superseded by FSM |
| \`legacy_logger\` | \`telemetry_v2\` | Merged into telemetry |

## Archived Tracks (Completed)

See \`superconductor/tracks/archive/\` for the following completed tracks:
- \`orchestrator_hardening_20260729\`
- \`orchestrator_self_healing_20260726\`
`;

      const manifest = PhaseRegistryParser.parse(markdown);
      expect(manifest.phases).toHaveLength(1);

      expect(manifest.absorbed).toEqual([
        {
          trackId: 'scripted_swarm',
          absorbedBy: 'superconductor_kernel',
          reason: 'Superseded by FSM',
        },
        {
          trackId: 'legacy_logger',
          absorbedBy: 'telemetry_v2',
          reason: 'Merged into telemetry',
        },
      ]);

      expect(manifest.archived).toEqual([
        'orchestrator_hardening_20260729',
        'orchestrator_self_healing_20260726',
      ]);
    });
  });

  describe('parse - legacy unphased tracks.md backward compatibility', () => {
    it('wraps unphased Active Tracks table into default virtual phase', () => {
      const legacyMarkdown = `# Tracks Registry

## Active Tracks

| Status | Track ID | Title | Branch |
|--------|----------|-------|--------|
| \`[x]\` | \`track_one\` | Track One | \`main\` |
| \`[~]\` | \`track_two\` | Track Two | \`feat\` |

## Absorbed / Closed Tracks

| Track ID | Absorbed By | Reason |
|----------|-------------|--------|
| \`old_track\` | \`new_track\` | Deprecated |
`;

      const manifest = PhaseRegistryParser.parse(legacyMarkdown);
      expect(manifest.phases).toHaveLength(1);

      const defaultPhase = manifest.phases[0];
      expect(defaultPhase.phaseId).toBe('default');
      expect(defaultPhase.name).toBe('Active Tracks');
      expect(defaultPhase.status).toBe('active');
      expect(defaultPhase.ordinal).toBe(1);
      expect(defaultPhase.tracks).toHaveLength(2);
      expect(defaultPhase.tracks[0].trackId).toBe('track_one');
      expect(defaultPhase.tracks[0].status).toBe('completed');
      expect(defaultPhase.tracks[1].trackId).toBe('track_two');
      expect(defaultPhase.tracks[1].status).toBe('in_progress');

      expect(manifest.absorbed).toHaveLength(1);
      expect(manifest.absorbed![0].trackId).toBe('old_track');
    });

    it('parses real superconductor/tracks.md cleanly without dropping any tracks', () => {
      const realTracksPath = path.resolve(__dirname, '../../../../superconductor/tracks.md');
      expect(fs.existsSync(realTracksPath)).toBe(true);

      const content = fs.readFileSync(realTracksPath, 'utf-8');
      const manifest = PhaseRegistryParser.parse(content);

      expect(manifest.phases).toHaveLength(1);
      const activePhase = manifest.phases[0];
      expect(activePhase.phaseId).toBe('default');
      expect(activePhase.name).toBe('Active Tracks');
      expect(activePhase.tracks.length).toBeGreaterThanOrEqual(25);

      // Verify specific known tracks from superconductor/tracks.md
      const trackIds = activePhase.tracks.map(t => t.trackId);
      expect(trackIds).toContain('adaptive_permissions_20260801');
      expect(trackIds).toContain('track_phases_and_sliding_window_20260921');
      expect(trackIds).toContain('ryoku_agy_plugin_20260901');

      // Verify absorbed tracks
      expect(manifest.absorbed).toBeDefined();
      expect(manifest.absorbed!.some(a => a.trackId === 'scripted_swarm_orchestrator')).toBe(true);

      // Verify archived tracks
      expect(manifest.archived).toBeDefined();
      expect(manifest.archived).toContain('orchestrator_hardening_20260729');
    });

    it('parses unphased list items if no tables exist', () => {
      const listMarkdown = `
# Tracks Registry

- [x] **Track: Alpha Core**
*Link: [./tracks/alpha_core/](./tracks/alpha_core/)*

---

- [~] **Track: Beta Feature**
*Link: [./tracks/beta_feature/](./tracks/beta_feature/)*
`;
      const manifest = PhaseRegistryParser.parse(listMarkdown);
      expect(manifest.phases).toHaveLength(1);
      expect(manifest.phases[0].tracks).toHaveLength(2);
      expect(manifest.phases[0].tracks[0].trackId).toBe('alpha_core');
      expect(manifest.phases[0].tracks[0].status).toBe('completed');
      expect(manifest.phases[0].tracks[1].trackId).toBe('beta_feature');
      expect(manifest.phases[0].tracks[1].status).toBe('in_progress');
    });
  });

  describe('serialize & round-trip idempotency', () => {
    it('serializes a manifest to clean markdown with aligned tables', () => {
      const manifest: RegistryManifest = {
        phases: [
          {
            phaseId: 'foundation',
            name: 'Foundation',
            status: 'completed',
            ordinal: 1,
            tracks: [
              {
                trackId: 'track_a',
                title: 'Track A',
                status: 'completed',
                branch: 'main',
                link: './tracks/track_a/',
              },
            ],
          },
          {
            phaseId: 'advanced-ui',
            name: 'Advanced UI',
            status: 'active',
            ordinal: 2,
            tracks: [
              {
                trackId: 'track_b',
                title: 'Track B',
                status: 'in_progress',
                branch: 'feat/b',
              },
            ],
          },
        ],
        absorbed: [
          {
            trackId: 'old_track',
            absorbedBy: 'track_a',
            reason: 'Consolidated',
          },
        ],
        archived: ['archive_1', 'archive_2'],
      };

      const markdown = PhaseRegistryParser.serialize(manifest);
      expect(markdown).toContain('## Phase 1: Foundation (Completed)');
      expect(markdown).toContain('## Phase 2: Advanced UI (Active)');
      expect(markdown).toMatch(/\|\s*Status\s*\|\s*Track ID\s*\|\s*Title\s*\|\s*Branch\s*\|/);
      expect(markdown).toContain('## Absorbed / Closed Tracks');
      expect(markdown).toContain('## Archived Tracks (Completed)');
      expect(markdown).toContain('- `archive_1`');

      // Round-trip parse
      const reparsed = PhaseRegistryParser.parse(markdown);
      expect(reparsed.phases).toHaveLength(2);
      expect(reparsed.phases[0].phaseId).toBe('foundation');
      expect(reparsed.phases[0].tracks[0].trackId).toBe('track_a');
      expect(reparsed.phases[0].tracks[0].link).toBe('./tracks/track_a/');
      expect(reparsed.phases[1].phaseId).toBe('advanced-ui');
      expect(reparsed.phases[1].tracks[0].trackId).toBe('track_b');
      expect(reparsed.absorbed).toEqual(manifest.absorbed);
      expect(reparsed.archived).toEqual(manifest.archived);
    });

    it('maintains round-trip parse -> serialize -> parse stability on real tracks.md', () => {
      const realTracksPath = path.resolve(__dirname, '../../../../superconductor/tracks.md');
      const content = fs.readFileSync(realTracksPath, 'utf-8');

      const manifest1 = PhaseRegistryParser.parse(content);
      const serialized = PhaseRegistryParser.serialize(manifest1);
      const manifest2 = PhaseRegistryParser.parse(serialized);

      expect(manifest2.phases[0].tracks.length).toBe(manifest1.phases[0].tracks.length);
      for (let i = 0; i < manifest1.phases[0].tracks.length; i++) {
        expect(manifest2.phases[0].tracks[i].trackId).toBe(manifest1.phases[0].tracks[i].trackId);
        expect(manifest2.phases[0].tracks[i].status).toBe(manifest1.phases[0].tracks[i].status);
        expect(manifest2.phases[0].tracks[i].title).toBe(manifest1.phases[0].tracks[i].title);
      }
      expect(manifest2.absorbed).toEqual(manifest1.absorbed);
      expect(manifest2.archived).toEqual(manifest1.archived);
    });
  });

  describe('edge cases & corrupted markdown', () => {
    it('returns empty manifest on empty or whitespace markdown', () => {
      expect(PhaseRegistryParser.parse('')).toEqual({ phases: [] });
      expect(PhaseRegistryParser.parse('   \n\n   ')).toEqual({ phases: [] });
    });

    it('handles markdown with no track tables or lists gracefully', () => {
      const randomMd = `# Some Project
This is a document with no tracks at all.
Just notes.
## Section 1
More notes.`;
      const result = PhaseRegistryParser.parse(randomMd);
      expect(result).toEqual({ phases: [] });
    });

    it('handles corrupted tables with missing columns or unclosed pipes', () => {
      const corrupted = `
## Phase 1: Resilient (Active)

| Status | Track ID | Title |
| --- | --- |
| [x] | track_1 | Only three cells |
| Broken row without pipes
| [~] | track_2 | Another one | extra |
`;
      const manifest = PhaseRegistryParser.parse(corrupted);
      expect(manifest.phases).toHaveLength(1);
      expect(manifest.phases[0].tracks.length).toBeGreaterThanOrEqual(1);
      expect(manifest.phases[0].tracks[0].trackId).toBe('track_1');
    });
  });
});
