/**
 * SkillTemplateGenerator Unit Tests
 *
 * Verifies contrastive learning sections, diff hunk formatting,
 * backward compatibility for traditional templates, and valid YAML frontmatter.
 */

import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import {
  SkillTemplateGenerator,
  generateSkillMarkdown,
  SkillTemplateData,
} from '../templates.js';

describe('SkillTemplateGenerator', () => {
  describe('Backward Compatibility (Non-Contrastive Templates)', () => {
    it('renders traditional sections when contrastive fields are omitted', () => {
      const data: SkillTemplateData = {
        name: 'test-traditional-skill',
        description: 'Standard traditional workflow skill.',
        sourceTrackId: 'track-trad-001',
        harvestTimestamp: '2026-09-07T00:00:00.000Z',
        confidenceScore: 0.85,
        title: 'Test Traditional Skill',
        overview: 'Overview for traditional workflow.',
        whenToUse: ['When handling standard tasks', 'When executing non-remediation workflows'],
        workflowProcedure: ['Step 1: Setup', 'Step 2: Execute', 'Step 3: Clean up'],
        guidelinesInvariants: ['Follow standard dogma rules', 'Maintain backward compatibility'],
        verification: ['Run npm test to verify'],
      };

      const markdown = SkillTemplateGenerator.render(data);

      // Verify traditional sections exist
      expect(markdown).toContain('# Test Traditional Skill');
      expect(markdown).toContain('## Overview');
      expect(markdown).toContain('Overview for traditional workflow.');
      expect(markdown).toContain('## When to Use');
      expect(markdown).toContain('- When handling standard tasks');
      expect(markdown).toContain('- When executing non-remediation workflows');
      expect(markdown).toContain('## Workflow & Procedure');
      expect(markdown).toContain('Step 1: Setup');
      expect(markdown).toContain('## Guidelines & Invariants');
      expect(markdown).toContain('- Follow standard dogma rules');
      expect(markdown).toContain('## Verification');
      expect(markdown).toContain('Run npm test to verify');

      // Contrastive sections MUST NOT be present
      expect(markdown).not.toContain('## Anti-Patterns & Common Traps');
      expect(markdown).not.toContain('## Hardened Implementation Pattern');
      expect(markdown).not.toContain('## Verification Recipe');
      expect(markdown).not.toContain('```diff');
    });

    it('generates identical output via standalone generateSkillMarkdown and class static method', () => {
      const data: SkillTemplateData = {
        name: 'test-compat-export',
        description: 'Testing export consistency.',
        harvestTimestamp: '2026-09-07T00:00:00.000Z',
      };

      const rendered1 = SkillTemplateGenerator.render(data);
      const rendered2 = SkillTemplateGenerator.generateSkillMarkdown(data);
      const rendered3 = generateSkillMarkdown(data);

      expect(rendered1).toBe(rendered2);
      expect(rendered2).toBe(rendered3);
    });

    it('uses sensible default fallbacks when optional fields are omitted', () => {
      const data: SkillTemplateData = {
        name: 'test-default-fallback',
        description: 'Default fallback test.',
      };

      const markdown = SkillTemplateGenerator.render(data);

      expect(markdown).toContain('# test-default-fallback');
      expect(markdown).toContain('## Overview');
      expect(markdown).toContain('## When to Use');
      expect(markdown).toContain('## Workflow & Procedure');
      expect(markdown).toContain('1. Set up and verify required environment preconditions.');
      expect(markdown).toContain('## Guidelines & Invariants');
      expect(markdown).toContain('- Follow Superconductor and Design OS Dogma standards.');
      expect(markdown).toContain('## Verification');
      expect(markdown).toContain('1. Run relevant automated test suites to confirm functionality.');
    });
  });

  describe('Contrastive Learning Sections', () => {
    it('renders dedicated Anti-Patterns and Hardened Pattern sections when contrastive fields are present', () => {
      const data: SkillTemplateData = {
        name: 'path-traversal-containment',
        description: 'Hardened path resolution preventing directory traversal escapes.',
        sourceTrackId: 'track-remediation-101',
        title: 'Path Traversal Containment Pattern',
        overview: 'Micro-skill distilled from path traversal remediation.',
        whenToUse: ['When handling user-provided file paths', 'When validating sandbox containment'],
        antiPattern: [
          'Using naive path.join() without verifying realpath containment.',
          'Relying on regex prefix matching that can be bypassed with ../ traverses.',
        ],
        hardenedPattern: [
          'Resolve canonical absolute path using fs.realpathSync.',
          'Verify resolved path starts with the sandboxed base directory + path.sep boundary.',
        ],
        invariantsRules: [
          'Path resolution MUST always resolve symlinks before checking boundaries.',
          'All out-of-boundary accesses MUST throw explicit PathTraversalSecurityError.',
        ],
        verificationRecipe: [
          'Run canary test suite with symlink and traversal attack payloads.',
          'Assert all escape attempts fail closed.',
        ],
      };

      const markdown = SkillTemplateGenerator.render(data);

      // Verify title & initial sections
      expect(markdown).toContain('# Path Traversal Containment Pattern');
      expect(markdown).toContain('## Overview');
      expect(markdown).toContain('## When to Use');

      // Verify dedicated contrastive headings
      expect(markdown).toContain('## Anti-Patterns & Common Traps (Where Things Go Wrong)');
      expect(markdown).toContain('- Using naive path.join() without verifying realpath containment.');
      expect(markdown).toContain('- Relying on regex prefix matching that can be bypassed with ../ traverses.');

      expect(markdown).toContain('## Hardened Implementation Pattern (Where Things Go Right)');
      expect(markdown).toContain('Resolve canonical absolute path using fs.realpathSync.');
      expect(markdown).toContain('Verify resolved path starts with the sandboxed base directory + path.sep boundary.');

      // Verify Invariants & Rules and Verification Recipe
      expect(markdown).toContain('## Invariants & Rules');
      expect(markdown).toContain('- Path resolution MUST always resolve symlinks before checking boundaries.');
      expect(markdown).toContain('- All out-of-boundary accesses MUST throw explicit PathTraversalSecurityError.');

      expect(markdown).toContain('## Verification Recipe');
      expect(markdown).toContain('Run canary test suite with symlink and traversal attack payloads.');
      expect(markdown).toContain('Assert all escape attempts fail closed.');

      // Verify traditional heading replacement
      expect(markdown).not.toContain('## Guidelines & Invariants');
    });

    it('upholds invariant: contrastive templates MUST render both Anti-Patterns and Hardened Patterns even if only one is specified', () => {
      // Case 1: only antiPattern provided
      const dataAntiOnly: SkillTemplateData = {
        name: 'test-anti-only',
        description: 'Only anti-pattern provided.',
        antiPattern: 'Insecure shell exec with raw string concatenation.',
      };

      const mdAntiOnly = SkillTemplateGenerator.render(dataAntiOnly);
      expect(mdAntiOnly).toContain('## Anti-Patterns & Common Traps (Where Things Go Wrong)');
      expect(mdAntiOnly).toContain('Insecure shell exec with raw string concatenation.');
      expect(mdAntiOnly).toContain('## Hardened Implementation Pattern (Where Things Go Right)');
      expect(mdAntiOnly).toContain('Implement strict boundary validation');

      // Case 2: only hardenedPattern provided
      const dataHardenedOnly: SkillTemplateData = {
        name: 'test-hardened-only',
        description: 'Only hardened pattern provided.',
        hardenedPattern: 'Use spawnSync with argument array instead of shell execution.',
      };

      const mdHardenedOnly = SkillTemplateGenerator.render(dataHardenedOnly);
      expect(mdHardenedOnly).toContain('## Anti-Patterns & Common Traps (Where Things Go Wrong)');
      expect(mdHardenedOnly).toContain('## Hardened Implementation Pattern (Where Things Go Right)');
      expect(mdHardenedOnly).toContain('Use spawnSync with argument array instead of shell execution.');
    });

    it('formats antiPattern string and array cleanly', () => {
      const dataString: SkillTemplateData = {
        name: 'test-anti-string',
        description: 'String anti-pattern test.',
        antiPattern: 'Single paragraph explaining the subtle race condition vulnerability.',
      };
      const mdString = SkillTemplateGenerator.render(dataString);
      expect(mdString).toContain('Single paragraph explaining the subtle race condition vulnerability.');

      const dataArray: SkillTemplateData = {
        name: 'test-anti-array',
        description: 'Array anti-pattern test.',
        antiPattern: ['Unchecked index bounds', 'Silent swallow of Promise rejection'],
      };
      const mdArray = SkillTemplateGenerator.render(dataArray);
      expect(mdArray).toContain('- Unchecked index bounds');
      expect(mdArray).toContain('- Silent swallow of Promise rejection');
    });
  });

  describe('Git Diff Hunk Formatting', () => {
    it('renders git diff hunk inside fenced diff block when diffHunk is provided', () => {
      const rawDiff = `--- a/src/security/sandbox.ts
+++ b/src/security/sandbox.ts
@@ -10,2 +10,4 @@
-  return path.resolve(base, target);
+  const resolved = path.resolve(base, target);
+  if (!resolved.startsWith(base + path.sep)) throw new Error('Escaped');
+  return resolved;`;

      const data: SkillTemplateData = {
        name: 'diff-test-skill',
        description: 'Testing diff formatting in skill template.',
        antiPattern: 'Returning unvalidated path resolution.',
        hardenedPattern: 'Validate path prefix after resolution.',
        diffHunk: rawDiff,
      };

      const markdown = SkillTemplateGenerator.render(data);

      expect(markdown).toContain('## Hardened Implementation Pattern (Where Things Go Right)');
      expect(markdown).toContain('Validate path prefix after resolution.');
      expect(markdown).toContain('```diff\n' + rawDiff.trim() + '\n```');
    });

    it('handles already-fenced diff hunks without duplicating triple backticks', () => {
      const fencedDiff = '```diff\n- oldCode();\n+ newCode();\n```';

      const data: SkillTemplateData = {
        name: 'fenced-diff-skill',
        description: 'Testing already-fenced diff hunk.',
        antiPattern: 'Old code called insecurely.',
        hardenedPattern: 'New hardened call.',
        diffHunk: fencedDiff,
      };

      const markdown = SkillTemplateGenerator.render(data);

      expect(markdown).toContain('```diff\n- oldCode();\n+ newCode();\n```');
      expect(markdown).not.toContain('````');
      expect(markdown).not.toContain('```diff\n```diff');
    });

    it('does not render diff block when diffHunk is omitted or empty', () => {
      const data: SkillTemplateData = {
        name: 'no-diff-skill',
        description: 'Testing absence of diff block.',
        antiPattern: 'Common anti-pattern.',
        hardenedPattern: 'Hardened solution.',
      };

      const markdown = SkillTemplateGenerator.render(data);

      expect(markdown).not.toContain('```diff');
    });
  });

  describe('YAML Frontmatter Validation', () => {
    it('produces valid YAML frontmatter that parses cleanly and preserves metadata', () => {
      const data: SkillTemplateData = {
        name: 'test-yaml-schema',
        description: 'Verifies YAML frontmatter integrity and parser compliance.',
        sourceTrackId: 'track-yaml-42',
        harvestTimestamp: '2026-09-07T05:30:00.000Z',
        confidenceScore: 0.94,
        status: 'incubating',
        vettingStatus: 'passed',
        tools: ['run_command', 'view_file', 'replace_file_content'],
        tags: ['security', 'path-containment', 'remediation'],
        metadata: {
          custom_engine_version: '2.0.0',
        },
      };

      const markdown = SkillTemplateGenerator.render(data);

      // Verify frontmatter block is present
      const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      expect(match).not.toBeNull();
      expect(match![1]).toBeDefined();

      // Parse YAML frontmatter
      const parsed = yaml.load(match![1]) as Record<string, any>;
      expect(parsed).toBeDefined();
      expect(parsed.name).toBe('test-yaml-schema');
      expect(parsed.description).toBe('Verifies YAML frontmatter integrity and parser compliance.');

      // Verify superconductor_learning sub-object
      const learning = parsed.superconductor_learning;
      expect(learning).toBeDefined();
      expect(learning.status).toBe('incubating');
      expect(learning.source_track).toBe('track-yaml-42');
      expect(learning.harvest_timestamp).toBe('2026-09-07T05:30:00.000Z');
      expect(learning.confidence_score).toBe(0.94);
      expect(learning.vetting_status).toBe('passed');

      // Verify optional tools and tags
      expect(parsed.tools).toEqual(['run_command', 'view_file', 'replace_file_content']);
      expect(parsed.tags).toEqual(['security', 'path-containment', 'remediation']);
      expect(parsed.custom_engine_version).toBe('2.0.0');
    });

    it('respects provenance object if provided in lieu of top-level fields', () => {
      const data: SkillTemplateData = {
        name: 'provenance-test',
        description: 'Testing provenance object precedence.',
        provenance: {
          status: 'active',
          source_track: 'track-prov-99',
          harvest_timestamp: '2026-09-07T06:00:00.000Z',
          confidence_score: 0.99,
          vetting_status: 'passed',
        },
      };

      const markdown = SkillTemplateGenerator.render(data);
      const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      const parsed = yaml.load(match![1]) as Record<string, any>;

      expect(parsed.superconductor_learning.status).toBe('active');
      expect(parsed.superconductor_learning.source_track).toBe('track-prov-99');
      expect(parsed.superconductor_learning.confidence_score).toBe(0.99);
      expect(parsed.superconductor_learning.vetting_status).toBe('passed');
    });
  });
});
