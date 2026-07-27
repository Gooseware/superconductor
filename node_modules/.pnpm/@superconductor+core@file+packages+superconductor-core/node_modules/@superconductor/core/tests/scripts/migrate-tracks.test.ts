import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import yaml from 'js-yaml';
import {
  parseTracksMarkdown,
  migrateTracksFile,
  normalizeStatus,
  cleanMarkdown,
  extractUrl,
  slugifyTrackName,
  parseDependenciesString
} from '../../scripts/migrate-tracks.js';
import { trackManifestSchema } from '../../src/schema/track-manifest.js';

describe('migrate-tracks script', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-migrate-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('helper functions', () => {
    it('normalizeStatus handles various status strings', () => {
      expect(normalizeStatus('x')).toBe('completed');
      expect(normalizeStatus('[x]')).toBe('completed');
      expect(normalizeStatus('completed')).toBe('completed');

      expect(normalizeStatus('~')).toBe('in_progress');
      expect(normalizeStatus('[~]')).toBe('in_progress');
      expect(normalizeStatus('in_progress')).toBe('in_progress');

      expect(normalizeStatus(' ')).toBe('planned');
      expect(normalizeStatus('[ ]')).toBe('planned');
      expect(normalizeStatus('planned')).toBe('planned');
      expect(normalizeStatus(undefined)).toBe('planned');
    });

    it('cleanMarkdown strips markdown formatting', () => {
      expect(cleanMarkdown('**Track Name**')).toBe('Track Name');
      expect(cleanMarkdown('*Track Name*')).toBe('Track Name');
      expect(cleanMarkdown('`Track Name`')).toBe('Track Name');
      expect(cleanMarkdown('[Link](./tracks/foo/)')).toBe('Link');
    });

    it('extractUrl extracts URL from link syntax or plain text', () => {
      expect(extractUrl('[./tracks/foo/](./tracks/foo/)')).toBe('./tracks/foo/');
      expect(extractUrl('[Label](https://example.com/spec.md)')).toBe('https://example.com/spec.md');
      expect(extractUrl('./tracks/bar/')).toBe('./tracks/bar/');
    });

    it('slugifyTrackName creates clean identifier', () => {
      expect(slugifyTrackName('HTN Planning & Multi-Agent Delegation')).toBe('htn_planning_multi_agent_delegation');
      expect(slugifyTrackName('  Special #1 Track! ')).toBe('special_1_track');
    });

    it('parseDependenciesString extracts dependency list', () => {
      expect(parseDependenciesString('track_a, track_b')).toEqual(['track_a', 'track_b']);
      expect(parseDependenciesString('[track_a](./tracks/track_a/), [track_b](./tracks/track_b/)')).toEqual(['track_a', 'track_b']);
      expect(parseDependenciesString('-')).toEqual([]);
      expect(parseDependenciesString('none')).toEqual([]);
    });
  });

  describe('parseTracksMarkdown', () => {
    it('parses markdown list entries', () => {
      const markdown = `
# Project Tracks

- [x] **Track: Alpha Core**
*Link: [./tracks/alpha_core/](./tracks/alpha_core/)*

---

- [~] **Track: Beta Feature**
*Link: [./tracks/beta_feature/](./tracks/beta_feature/)*
- Dependencies: alpha_core

---

- [ ] **Track: Gamma Tool**
*Link: [./tracks/gamma_tool/](./tracks/gamma_tool/)*
      `;

      const result = parseTracksMarkdown(markdown);
      expect(result.version).toBe(1);
      expect(result.tracks).toHaveLength(3);

      expect(result.tracks[0]).toEqual({
        id: 'alpha_core',
        name: 'Alpha Core',
        status: 'completed',
        link: './tracks/alpha_core/',
        deps: [],
        note: undefined
      });

      expect(result.tracks[1]).toEqual({
        id: 'beta_feature',
        name: 'Beta Feature',
        status: 'in_progress',
        link: './tracks/beta_feature/',
        deps: ['alpha_core'],
        note: undefined
      });

      expect(result.tracks[2]).toEqual({
        id: 'gamma_tool',
        name: 'Gamma Tool',
        status: 'planned',
        link: './tracks/gamma_tool/',
        deps: [],
        note: undefined
      });
    });

    it('parses markdown table format', () => {
      const markdown = `
| Track ID | Track Name | Status | Link | Dependencies | Note |
| --- | --- | --- | --- | --- | --- |
| track_one | Track One | [x] | [Link](./tracks/track_one/) | - | Initial base |
| track_two | Track Two | [~] | [Link](./tracks/track_two/) | track_one | Secondary |
| track_three | Track Three | [ ] | [Link](./tracks/track_three/) | track_one, track_two | Final |
      `;

      const result = parseTracksMarkdown(markdown);
      expect(result.tracks).toHaveLength(3);

      expect(result.tracks[0].id).toBe('track_one');
      expect(result.tracks[0].status).toBe('completed');
      expect(result.tracks[0].deps).toEqual([]);
      expect(result.tracks[0].note).toBe('Initial base');

      expect(result.tracks[1].id).toBe('track_two');
      expect(result.tracks[1].status).toBe('in_progress');
      expect(result.tracks[1].deps).toEqual(['track_one']);

      expect(result.tracks[2].id).toBe('track_three');
      expect(result.tracks[2].status).toBe('planned');
      expect(result.tracks[2].deps).toEqual(['track_one', 'track_two']);
    });

    it('cross-references dependencies from inline notes', () => {
      const markdown = `
- [x] **Track: Core Abstraction** *(prerequisite for intelligence layer)*
*Link: [./tracks/core_abstraction/](./tracks/core_abstraction/)*

---

- [x] **Track: Intelligence Layer** *(requires core abstraction)*
*Link: [./tracks/intelligence_layer/](./tracks/intelligence_layer/)*
      `;

      const result = parseTracksMarkdown(markdown);
      const intelTrack = result.tracks.find(t => t.id === 'intelligence_layer');
      expect(intelTrack?.deps).toContain('core_abstraction');
    });

    it('validates generated output against trackManifestSchema', () => {
      const markdown = `
- [x] **Track: Schema Test**
*Link: [./tracks/schema_test/](./tracks/schema_test/)*
      `;

      const result = parseTracksMarkdown(markdown);
      const validation = trackManifestSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });
  });

  describe('migrateTracksFile', () => {
    it('reads input tracks.md and writes valid tracks.yaml', () => {
      const inputPath = path.join(tmpDir, 'tracks.md');
      const outputPath = path.join(tmpDir, 'tracks.yaml');

      const sampleMarkdown = `
# Project Tracks

- [x] **Track: Foundation Engine**
*Link: [./tracks/foundation_engine/](./tracks/foundation_engine/)*

---

- [ ] **Track: Advanced UI**
*Link: [./tracks/advanced_ui/](./tracks/advanced_ui/)*
- Dependencies: foundation_engine
      `;

      fs.writeFileSync(inputPath, sampleMarkdown, 'utf-8');

      const res = migrateTracksFile(inputPath, outputPath);
      expect(res.success).toBe(true);
      expect(res.trackCount).toBe(2);
      expect(fs.existsSync(outputPath)).toBe(true);

      const yamlContent = fs.readFileSync(outputPath, 'utf-8');
      const parsedYaml = yaml.load(yamlContent);
      const validation = trackManifestSchema.safeParse(parsedYaml);
      expect(validation.success).toBe(true);
    });

    it('throws error when input file does not exist', () => {
      const nonExistent = path.join(tmpDir, 'nonexistent.md');
      const outputPath = path.join(tmpDir, 'tracks.yaml');

      expect(() => migrateTracksFile(nonExistent, outputPath)).toThrow(/Input file not found/);
    });
  });
});
