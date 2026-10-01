import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import yaml from 'js-yaml';
import { TrackCompiler } from '../../src/visual/track-compiler.js';
import { ClusteredTrackCandidate } from '../../src/visual/layered-assembly.js';
import { SpatialAnnotation } from '../../src/visual/surface-adapter.js';
import { parseTaskCard } from '../../src/planning/parser.js';
import { isParsedTaskCard } from '../../src/planning/task-schema.js';

describe('TrackCompiler', () => {
  let compiler: TrackCompiler;
  let tempDir: string;

  const sampleAnnotation1: SpatialAnnotation = {
    id: 'ann-1',
    viewId: 'view-checkout',
    type: 'pin',
    selector: 'button.btn-primary',
    sourceLocation: {
      filePath: 'src/components/Button.tsx',
      componentName: 'Button',
      lineNumber: 42,
    },
    geometry: { x: 120, y: 85 },
    author: 'reviewer@superconductor.dev',
    comment: 'Button fails WCAG AA contrast (3.8:1 | requires 4.5:1)',
    tags: ['accessibility', 'wcag-aa'],
    severity: 'blocker',
    createdAt: '2026-10-01T12:00:00Z',
  };

  const sampleAnnotation2: SpatialAnnotation = {
    id: 'ann-2',
    viewId: 'view-checkout',
    type: 'bounding_box',
    selector: '.button-wrapper',
    sourceLocation: {
      filePath: 'src/components/Button.tsx',
      componentName: 'Button',
      lineNumber: 48,
    },
    geometry: { x: 100, y: 80, width: 180, height: 60 },
    author: 'designer@superconductor.dev',
    comment: 'Padding is inconsistent on mobile',
    tags: ['ui', 'spacing'],
    severity: 'enhancement',
    createdAt: '2026-10-01T12:05:00Z',
  };

  const sampleCandidate: ClusteredTrackCandidate = {
    trackId: 'visual_layer1_component_button',
    title: 'Shared Golden Component: Button',
    description: 'Refactor, standardize, and resolve visual defects for shared component Button',
    layer: 1,
    layerName: 'components',
    annotations: [sampleAnnotation1, sampleAnnotation2],
    dependsOn: ['visual_layer0_tokens'],
    dependencies: ['visual_layer0_tokens'],
    benefitScore: 16,
    targetFiles: ['src/components/Button.tsx'],
    affectedComponents: ['Button'],
    viewIds: ['view-checkout'],
    domain: 'ui',
    tier: 2,
    tcs: 3,
  };

  beforeEach(() => {
    compiler = new TrackCompiler();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-track-compiler-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Single Track Compilation', () => {
    it('should generate valid specMarkdown, planMarkdown, and indexMarkdown', () => {
      const result = compiler.compileToTrack(sampleCandidate);

      expect(result).toHaveProperty('specMarkdown');
      expect(result).toHaveProperty('planMarkdown');
      expect(result).toHaveProperty('indexMarkdown');

      expect(typeof result.specMarkdown).toBe('string');
      expect(typeof result.planMarkdown).toBe('string');
      expect(typeof result.indexMarkdown).toBe('string');
    });

    describe('spec.md output', () => {
      it('should contain title, ADR 0003 rationale, and track metadata', () => {
        const { specMarkdown } = compiler.compileToTrack(sampleCandidate);

        expect(specMarkdown).toContain('# Track Specification: Shared Golden Component: Button');
        expect(specMarkdown).toContain('## Background, Problem & Architectural Rationale');
        expect(specMarkdown).toContain('ADR 0003 (Layered Assembly Partitioning)');
        expect(specMarkdown).toContain('`visual_layer1_component_button`');
        expect(specMarkdown).toContain('Layer 1 (components)');
        expect(specMarkdown).toContain('`visual_layer0_tokens`');
      });

      it('should render a valid Visual Evidence Table with escaped pipe characters', () => {
        const { specMarkdown } = compiler.compileToTrack(sampleCandidate);

        expect(specMarkdown).toContain('## Visual Evidence Table');
        expect(specMarkdown).toContain('| ID | Type | Selector / Location | Severity | Tags | Comment |');
        expect(specMarkdown).toContain('|---|---|---|---|---|---|');

        // Check rows
        expect(specMarkdown).toContain('| ann-1 |');
        expect(specMarkdown).toContain('button.btn-primary (src/components/Button.tsx:42)');
        expect(specMarkdown).toContain('blocker');
        // Notice pipe in comment was escaped: "(3.8:1 \| requires 4.5:1)"
        expect(specMarkdown).toContain('3.8:1 \\| requires 4.5:1');

        expect(specMarkdown).toContain('| ann-2 |');
        expect(specMarkdown).toContain('box (100, 80, 180x60)');
        expect(specMarkdown).toContain('enhancement');
      });

      it('should contain Functional and Non-Functional Requirements and Acceptance Criteria', () => {
        const { specMarkdown } = compiler.compileToTrack(sampleCandidate);

        expect(specMarkdown).toContain('## Functional Requirements');
        expect(specMarkdown).toContain('- **FR-1**:');
        expect(specMarkdown).toContain('- **FR-2**:');

        expect(specMarkdown).toContain('## Non-Functional Requirements');
        expect(specMarkdown).toContain('Zero-Config & Confinement');
        expect(specMarkdown).toContain('Visual Performance');
        expect(specMarkdown).toContain('Design OS Hit-Testing Dogma');

        expect(specMarkdown).toContain('## Acceptance Criteria');
        expect(specMarkdown).toContain('- **AC-1**:');
        expect(specMarkdown).toContain('- **AC-2**:');
      });
    });

    describe('plan.md output and Schema Compliance', () => {
      it('should generate plan.md with strict schema tags', () => {
        const { planMarkdown } = compiler.compileToTrack(sampleCandidate);

        expect(planMarkdown).toContain('**Status:** [ ]');
        expect(planMarkdown).toContain('**Phase:** visual-assembly');
        expect(planMarkdown).toContain('## Phase 0: Implementation & Visual Refactoring');

        // Check strict tags
        expect(planMarkdown).toMatch(/\[TIER-\d+:TCS=\d+\]/);
        expect(planMarkdown).toContain('[AGENT:superconductor-processor]');
        expect(planMarkdown).toContain('[DOMAIN:ui]');
        expect(planMarkdown).toContain('CREATES: src/components/Button.tsx');
        expect(planMarkdown).toContain('PROTECTED: src/theme/tokens.css');
        expect(planMarkdown).toMatch(/INVARIANT_AFTER:\s*"[^"]+"/);
        expect(planMarkdown).toMatch(/REUSES:\s*\[[^\]]+\]/);

        // Verification phase
        expect(planMarkdown).toContain('## Phase 1: Verification & Visual Regression Testing');
        expect(planMarkdown).toContain('CREATES: tests/components/button.test.ts');
      });

      it('should be 100% parseable by superconductor parser parseTaskCard', () => {
        const { planMarkdown } = compiler.compileToTrack(sampleCandidate);

        // Split by task blocks starting with "- [ ] Task:"
        const taskBlocks = planMarkdown
          .split(/(?=-\s*\[\s*\]\s*Task:)/i)
          .filter((b) => b.toLowerCase().includes('task:'));

        expect(taskBlocks.length).toBe(2);

        for (const block of taskBlocks) {
          const parsed = parseTaskCard(block);
          expect(isParsedTaskCard(parsed)).toBe(true);
          expect(parsed.agent).toBe('superconductor-processor');
          expect(parsed.tier).toBeGreaterThanOrEqual(1);
          expect(parsed.creates.length).toBeGreaterThan(0);
          expect(parsed.protected.length).toBeGreaterThan(0);
          expect(parsed.invariantAfter).toBeDefined();
          expect(parsed.invariantAfter!.length).toBeGreaterThan(5);
          expect(parsed.reuses.length).toBeGreaterThan(0);
          expect(parsed.subtasks.length).toBeGreaterThanOrEqual(2);
        }
      });
    });

    describe('index.md output', () => {
      it('should contain track summary and links to spec and plan', () => {
        const { indexMarkdown } = compiler.compileToTrack(sampleCandidate);

        expect(indexMarkdown).toContain('# Track: Shared Golden Component: Button');
        expect(indexMarkdown).toContain('**Track ID:** `visual_layer1_component_button`');
        expect(indexMarkdown).toContain('**Layer:** Layer 1 (components)');
        expect(indexMarkdown).toContain('**Domain:** `ui`');
        expect(indexMarkdown).toContain('**Dependencies:** `visual_layer0_tokens`');
        expect(indexMarkdown).toContain('- [Specification](./spec.md)');
        expect(indexMarkdown).toContain('- [Implementation Plan](./plan.md)');
      });
    });
  });

  describe('Disk Output with options.outputDir', () => {
    it('should write spec.md, plan.md, and index.md to outputDir when provided', () => {
      const outputDir = path.join(tempDir, 'button-track');

      const result = compiler.compileToTrack(sampleCandidate, { outputDir });

      expect(fs.existsSync(path.join(outputDir, 'spec.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'plan.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'index.md'))).toBe(true);

      const writtenSpec = fs.readFileSync(path.join(outputDir, 'spec.md'), 'utf-8');
      const writtenPlan = fs.readFileSync(path.join(outputDir, 'plan.md'), 'utf-8');
      const writtenIndex = fs.readFileSync(path.join(outputDir, 'index.md'), 'utf-8');

      expect(writtenSpec).toBe(result.specMarkdown);
      expect(writtenPlan).toBe(result.planMarkdown);
      expect(writtenIndex).toBe(result.indexMarkdown);
    });
  });

  describe('Batch Compilation (compileAllToTracks)', () => {
    it('should compile multiple candidates into structured subdirectories', () => {
      const candidateTokens: ClusteredTrackCandidate = {
        trackId: 'visual_layer0_tokens',
        title: 'Foundation Design System & Semantic Tokens',
        description: 'Design tokens scaffolding',
        layer: 0,
        layerName: 'tokens',
        annotations: [],
        dependsOn: [],
        dependencies: [],
        benefitScore: 10,
        targetFiles: ['src/theme/tokens.css'],
        affectedComponents: [],
        viewIds: [],
        domain: 'design-tokens',
        tier: 1,
        tcs: 3,
      };

      const candidates = [candidateTokens, sampleCandidate];
      const batchResults = compiler.compileAllToTracks(candidates, tempDir);

      expect(batchResults.length).toBe(2);

      const tokenDir = path.join(tempDir, 'visual_layer0_tokens');
      const buttonDir = path.join(tempDir, 'visual_layer1_component_button');

      expect(fs.existsSync(path.join(tokenDir, 'spec.md'))).toBe(true);
      expect(fs.existsSync(path.join(tokenDir, 'plan.md'))).toBe(true);
      expect(fs.existsSync(path.join(tokenDir, 'index.md'))).toBe(true);

      expect(fs.existsSync(path.join(buttonDir, 'spec.md'))).toBe(true);
      expect(fs.existsSync(path.join(buttonDir, 'plan.md'))).toBe(true);
      expect(fs.existsSync(path.join(buttonDir, 'index.md'))).toBe(true);
    });
  });

  describe('Tracks YAML Generation (generateTracksYaml)', () => {
    it('should generate valid tracks.yaml content matching ExecutionPlanner schema', () => {
      const yamlStr = compiler.generateTracksYaml([sampleCandidate]);
      expect(typeof yamlStr).toBe('string');

      const parsed = yaml.load(yamlStr) as any;
      expect(parsed).toBeDefined();
      expect(Array.isArray(parsed.tracks)).toBe(true);
      expect(parsed.tracks.length).toBe(1);

      const track = parsed.tracks[0];
      expect(track.id).toBe('visual_layer1_component_button');
      expect(track.layer).toBe(1);
      expect(track.deps).toEqual(['visual_layer0_tokens']);
      expect(track.benefit_score).toBe(16);
    });
  });

  describe('Path Traversal Confinement and Validation (SEC-4)', () => {
    it('throws path traversal error when candidate trackId contains prohibited characters', () => {
      const maliciousCandidate: ClusteredTrackCandidate = {
        ...sampleCandidate,
        trackId: '../../escaped',
      };

      expect(() => {
        compiler.compileToTrack(maliciousCandidate);
      }).toThrow(/Invalid track ID "\.\.\/\.\.\/escaped": contains prohibited path traversal characters/);

      expect(() => {
        compiler.compileAllToTracks([maliciousCandidate], tempDir);
      }).toThrow(/Invalid track ID "\.\.\/\.\.\/escaped": contains prohibited path traversal characters/);
    });

    it('rejects candidate track IDs with slashes or backslashes', () => {
      const candidateWithSlash: ClusteredTrackCandidate = {
        ...sampleCandidate,
        trackId: 'sub/dir',
      };
      expect(() => {
        compiler.compileToTrack(candidateWithSlash);
      }).toThrow(/prohibited path traversal characters/);

      const candidateWithBackslash: ClusteredTrackCandidate = {
        ...sampleCandidate,
        trackId: 'sub\\dir',
      };
      expect(() => {
        compiler.compileToTrack(candidateWithBackslash);
      }).toThrow(/prohibited path traversal characters/);
    });
  });
});
