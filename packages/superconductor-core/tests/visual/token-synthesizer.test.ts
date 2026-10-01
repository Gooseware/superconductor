import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  TokenSynthesizer,
  CANONICAL_DESIGN_TOKENS,
  type DesignTokenCatalog,
} from '../../src/visual/token-synthesizer.js';
import { parsePlanTasksWithMetadata } from '../../src/planning/parser.js';

describe('TokenSynthesizer', () => {
  let tmpDir: string;
  let synthesizer: TokenSynthesizer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-token-synthesizer-test-'));
    synthesizer = new TokenSynthesizer();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('4-Tier Semantic Token Taxonomy Validation', () => {
    it('should define all 20 canonical design tokens across 4 tiers', () => {
      const canonical = TokenSynthesizer.getCanonicalTokens();
      expect(canonical).toHaveLength(20);

      const tiers = {
        surfaces: canonical.filter((t) => t.tier === 'surfaces'),
        typography: canonical.filter((t) => t.tier === 'typography'),
        brand: canonical.filter((t) => t.tier === 'brand'),
        geometry: canonical.filter((t) => t.tier === 'geometry'),
      };

      // 1. Surfaces & Backgrounds (4 tokens)
      expect(tiers.surfaces.map((t) => t.name)).toEqual([
        '--surface-canvas',
        '--surface-card',
        '--surface-elevated',
        '--surface-sunken',
      ]);

      // 2. Content & Typography (4 tokens)
      expect(tiers.typography.map((t) => t.name)).toEqual([
        '--text-primary',
        '--text-secondary',
        '--text-muted',
        '--text-accent',
      ]);

      // 3. Brand & State (5 tokens)
      expect(tiers.brand.map((t) => t.name)).toEqual([
        '--brand-primary',
        '--brand-secondary',
        '--state-success',
        '--state-warning',
        '--state-danger',
      ]);

      // 4. Geometry & Spacing (7 tokens)
      expect(tiers.geometry.map((t) => t.name)).toEqual([
        '--radius-sm',
        '--radius-md',
        '--radius-lg',
        '--space-2',
        '--space-4',
        '--space-8',
        '--space-16',
      ]);
    });

    it('should synthesize complete fallback catalog for project with no existing tokens', async () => {
      const emptyProjectDir = path.join(tmpDir, 'empty-app');
      fs.mkdirSync(emptyProjectDir, { recursive: true });

      const catalog = await synthesizer.synthesizeTokens(emptyProjectDir);

      expect(catalog.hasMissingTokens).toBe(true);
      expect(catalog.missingTokens).toHaveLength(20);
      expect(catalog.coveragePercent).toBe(0);

      // Verify all 4 tiers exist and are populated with synthesized fallback values
      expect(catalog.tiers.surfaces).toHaveLength(4);
      expect(catalog.tiers.typography).toHaveLength(4);
      expect(catalog.tiers.brand).toHaveLength(5);
      expect(catalog.tiers.geometry).toHaveLength(7);

      for (const token of Object.values(catalog.tokens)) {
        expect(token.source).toBe('synthesized');
        expect(token.value).toBe(token.defaultValue);
      }

      const validation = synthesizer.validateTaxonomy(catalog);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.tierSummary).toEqual({
        surfaces: 4,
        typography: 4,
        brand: 5,
        geometry: 7,
      });
    });

    it('should extract existing tokens from CSS and JSON files in project root', async () => {
      const projectDir = path.join(tmpDir, 'existing-tokens-app');
      fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });

      // Create a CSS file with partial tokens
      const cssContent = `
        :root {
          --surface-canvas: #0a0a0a;
          --surface-card: #171717;
          --text-primary: #ededed;
          --space-8: 0.5rem;
          --radius-md: 6px;
        }
      `;
      fs.writeFileSync(path.join(projectDir, 'src', 'theme.css'), cssContent, 'utf-8');

      // Create a JSON tokens file with brand tokens
      const jsonContent = JSON.stringify({
        'brand-primary': '#3b82f6',
        'state-danger': '#ef4444',
      });
      fs.writeFileSync(path.join(projectDir, 'src', 'tokens.json'), jsonContent, 'utf-8');

      const catalog = await synthesizer.synthesizeTokens(projectDir);

      expect(catalog.tokens['--surface-canvas'].value).toBe('#0a0a0a');
      expect(catalog.tokens['--surface-canvas'].source).toContain('theme.css');
      expect(catalog.tokens['--surface-card'].value).toBe('#171717');
      expect(catalog.tokens['--text-primary'].value).toBe('#ededed');
      expect(catalog.tokens['--space-8'].value).toBe('0.5rem');
      expect(catalog.tokens['--radius-md'].value).toBe('6px');
      expect(catalog.tokens['--brand-primary'].value).toBe('#3b82f6');
      expect(catalog.tokens['--state-danger'].value).toBe('#ef4444');

      // Total found = 7, missing = 13
      expect(catalog.missingTokens).toHaveLength(13);
      expect(catalog.coveragePercent).toBe(35);
      expect(catalog.hasMissingTokens).toBe(true);
      expect(catalog.detectedSources.length).toBeGreaterThanOrEqual(2);

      const validation = synthesizer.validateTaxonomy(catalog);
      expect(validation.valid).toBe(true);
    });

    it('should report taxonomy errors when a catalog is incomplete or corrupt', () => {
      const corruptCatalog = {
        tiers: {
          surfaces: [],
          typography: [],
          brand: [],
          geometry: [],
        },
        tokens: {},
        hasMissingTokens: true,
        missingTokens: [],
        coveragePercent: 0,
        detectedSources: [],
      } as DesignTokenCatalog;

      const validation = synthesizer.validateTaxonomy(corruptCatalog);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Raw Style Extraction and Token Recommendation', () => {
    it('should extract raw hex colors and recommend nearest semantic tokens', () => {
      const snippet = `
        .card {
          background-color: #1e293b;
          border-color: #dc2626;
          color: #f8fafc;
        }
      `;

      const report = synthesizer.extractRawStyles(snippet);

      expect(report.byType.hexColors).toBe(3);
      expect(report.violations.some((v) => v.raw === '#1e293b')).toBe(true);
      expect(report.violations.some((v) => v.raw === '#dc2626')).toBe(true);

      // #1e293b (slate-800 dark surface) -> --surface-card
      const cardBgViolation = report.violations.find((v) => v.raw === '#1e293b');
      expect(cardBgViolation?.recommendation.token).toBe('--surface-card');
      expect(cardBgViolation?.recommendation.replacement).toBe('var(--surface-card)');

      // #dc2626 (red-600 error) -> --state-danger
      const dangerViolation = report.violations.find((v) => v.raw === '#dc2626');
      expect(dangerViolation?.recommendation.token).toBe('--state-danger');
      expect(dangerViolation?.recommendation.replacement).toBe('var(--state-danger)');

      // Check recommended replacements map
      expect(report.recommendedReplacements.some((r) => r.original === '#1e293b')).toBe(true);
      expect(report.recommendedReplacements.some((r) => r.original === '#dc2626')).toBe(true);
    });

    it('should extract RGB/RGBA colors and recommend semantic tokens', () => {
      const snippet = `
        <div style={{ color: 'rgb(220, 38, 38)', borderColor: 'rgba(37, 99, 235, 0.8)' }}>
          Alert
        </div>
      `;

      const report = synthesizer.extractRawStyles(snippet);

      expect(report.byType.rgbColors).toBeGreaterThanOrEqual(1);

      const dangerViolation = report.violations.find((v) => v.raw.includes('220, 38, 38'));
      expect(dangerViolation).toBeDefined();
      expect(dangerViolation?.recommendation.token).toBe('--state-danger');
      expect(dangerViolation?.recommendation.replacement).toBe('var(--state-danger)');
    });

    it('should extract magic pixel spacing values and map to nearest spacing tokens', () => {
      const snippet = `
        .container {
          padding: 13px;
          margin-top: 3px;
          gap: 7px;
        }
      `;

      const report = synthesizer.extractRawStyles(snippet);

      expect(report.byType.magicDimensions).toBeGreaterThanOrEqual(3);

      // 13px is closest to --space-16 (16px)
      const paddingViolation = report.violations.find((v) => v.raw.includes('padding: 13px') || v.raw.includes('13px'));
      expect(paddingViolation).toBeDefined();
      expect(paddingViolation?.recommendation.token).toBe('--space-16');
      expect(paddingViolation?.recommendation.replacement).toBe('var(--space-16)');

      // 3px is closest to --space-4 (4px)
      const marginViolation = report.violations.find((v) => v.raw.includes('margin-top: 3px'));
      expect(marginViolation).toBeDefined();
      expect(marginViolation?.recommendation.token).toBe('--space-4');

      // 7px is closest to --space-8 (8px)
      const gapViolation = report.violations.find((v) => v.raw.includes('gap: 7px'));
      expect(gapViolation).toBeDefined();
      expect(gapViolation?.recommendation.token).toBe('--space-8');
    });

    it('should extract magic radius values and map to nearest radius tokens', () => {
      const snippet = `
        <button style={{ borderRadius: '7px' }}>Click</button>
        <div style={{ borderRadius: '3px' }}>Badge</div>
        <div style={{ borderRadius: '15px' }}>Modal</div>
      `;

      const report = synthesizer.extractRawStyles(snippet);

      // 7px closest to --radius-md (8px)
      const r7 = report.violations.find((v) => v.raw.includes('7px'));
      expect(r7?.recommendation.token).toBe('--radius-md');
      expect(r7?.recommendation.replacement).toBe('var(--radius-md)');

      // 3px closest to --radius-sm (4px)
      const r3 = report.violations.find((v) => v.raw.includes('3px'));
      expect(r3?.recommendation.token).toBe('--radius-sm');

      // 15px closest to --radius-lg (16px)
      const r15 = report.violations.find((v) => v.raw.includes('15px'));
      expect(r15?.recommendation.token).toBe('--radius-lg');
    });

    it('should discover inline style literals and flag them as violations', () => {
      const snippet = `
        export const MyCard = () => (
          <div style={{ backgroundColor: '#1e293b', padding: '13px', borderRadius: '7px' }}>
            <span style={{ color: '#ffffff' }}>Header</span>
          </div>
        );
      `;

      const report = synthesizer.extractRawStyles(snippet);

      expect(report.byType.inlineLiterals).toBe(2);
      expect(report.byType.hexColors).toBe(2);
      expect(report.byType.magicDimensions).toBe(2);
      expect(report.totalViolations).toBe(6);

      const inlineViolations = report.violations.filter((v) => v.type === 'inline-literal');
      expect(inlineViolations).toHaveLength(2);
      expect(inlineViolations[0].recommendation.reason).toContain('Inline style literals violate');
    });

    it('should support Tailwind arbitrary brackets: p-[13px] and rounded-[7px]', () => {
      const snippet = `
        <div className="bg-[#1e293b] p-[13px] rounded-[7px] text-[#dc2626]">
          Tailwind Component
        </div>
      `;

      const report = synthesizer.extractRawStyles(snippet);

      expect(report.byType.hexColors).toBe(2);
      expect(report.byType.magicDimensions).toBe(2);

      const padViolation = report.violations.find((v) => v.raw === 'p-[13px]');
      expect(padViolation?.recommendation.token).toBe('--space-16');

      const radViolation = report.violations.find((v) => v.raw === 'rounded-[7px]');
      expect(radViolation?.recommendation.token).toBe('--radius-md');

      const bgViolation = report.violations.find((v) => v.raw === '#1e293b');
      expect(bgViolation?.recommendation.token).toBe('--surface-card');

      const textViolation = report.violations.find((v) => v.raw === '#dc2626');
      expect(textViolation?.recommendation.token).toBe('--state-danger');
    });
  });

  describe('Design System Track Generation', () => {
    it('should generate valid spec.md and plan.md for foundational design system scaffolding', async () => {
      const emptyProjectDir = path.join(tmpDir, 'track-gen-app');
      fs.mkdirSync(emptyProjectDir, { recursive: true });

      const catalog = await synthesizer.synthesizeTokens(emptyProjectDir);
      const track = synthesizer.generateDesignSystemTrack(catalog);

      expect(track.specMarkdown).toBeDefined();
      expect(track.planMarkdown).toBeDefined();

      // Check spec markdown content
      expect(track.specMarkdown).toContain('# Track Specification: Scaffolding Foundational Semantic Design Tokens');
      expect(track.specMarkdown).toContain('ADR 0002');
      expect(track.specMarkdown).toContain('--surface-canvas');
      expect(track.specMarkdown).toContain('--text-primary');
      expect(track.specMarkdown).toContain('--brand-primary');
      expect(track.specMarkdown).toContain('--space-16');
      expect(track.specMarkdown).toContain('## Functional Requirements');
      expect(track.specMarkdown).toContain('## Acceptance Criteria');

      // Check plan markdown content
      expect(track.planMarkdown).toContain('## Phase 0: Semantic Design Token Definition & Token Scaffolding');
      expect(track.planMarkdown).toContain('CREATES: src/theme/tokens.css');
      expect(track.planMarkdown).toContain('PROTECTED: package.json');
      expect(track.planMarkdown).toContain('INVARIANT_AFTER:');

      // Verify that Superconductor parser parses the generated plan.md successfully
      const parsedTasks = parsePlanTasksWithMetadata(track.planMarkdown);
      expect(parsedTasks.length).toBeGreaterThanOrEqual(3);

      const scaffoldTask = parsedTasks.find((t) => t.creates.includes('src/theme/tokens.css'));
      expect(scaffoldTask).toBeDefined();
      expect(scaffoldTask?.tier).toBe(1);
      expect(scaffoldTask?.agent).toBe('superconductor-processor');
      expect(scaffoldTask?.domain).toBe('design-tokens');
      expect(scaffoldTask?.invariantAfter).toContain('canonical semantic tokens');
    });

    it('should generate valid CSS variable declarations string', async () => {
      const css = synthesizer.generateCssVariables();

      expect(css).toContain(':root {');
      expect(css).toContain('--surface-canvas: #ffffff;');
      expect(css).toContain('--surface-card: #f8fafc;');
      expect(css).toContain('--text-primary: #0f172a;');
      expect(css).toContain('--brand-primary: #2563eb;');
      expect(css).toContain('--state-success: #16a34a;');
      expect(css).toContain('--radius-md: 8px;');
      expect(css).toContain('--space-16: 16px;');
      expect(css).toContain('}');
    });
  });
});
