import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { ClusteredTrackCandidate } from './layered-assembly.js';
import { SpatialAnnotation } from './surface-adapter.js';

export interface TrackCompilerOptions {
  outputDir?: string;
  phaseName?: string;
}

export interface CompiledTrackResult {
  specMarkdown: string;
  planMarkdown: string;
  indexMarkdown: string;
}

/**
 * Escapes characters that would break markdown tables.
 */
function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

/**
 * TrackCompiler
 * 
 * Compiles a ClusteredTrackCandidate into fully-formed, schema-compliant
 * Superconductor track documents:
 * - spec.md: Background, ADR 0003 rationale, Visual Evidence Table, FRs, ACs.
 * - plan.md: Strict schema tags ([TIER-N:TCS=X], [AGENT:superconductor-processor], [DOMAIN:...], CREATES:, PROTECTED:, INVARIANT_AFTER:, REUSES: [...]).
 * - index.md: Track metadata, layer classification, dependencies, document links.
 */
export class TrackCompiler {
  /**
   * Compiles an individual candidate into track documents.
   * If options.outputDir is provided, files are written directly to disk.
   */
  public compileToTrack(
    candidate: ClusteredTrackCandidate,
    options?: TrackCompilerOptions
  ): CompiledTrackResult {
    if (!/^[a-zA-Z0-9_\-]+$/.test(candidate.trackId)) {
      throw new Error(`Invalid track ID "${candidate.trackId}": contains prohibited path traversal characters`);
    }

    const specMarkdown = this.generateSpecMarkdown(candidate);
    const planMarkdown = this.generatePlanMarkdown(candidate, options?.phaseName);
    const indexMarkdown = this.generateIndexMarkdown(candidate);

    if (options?.outputDir) {
      fs.mkdirSync(options.outputDir, { recursive: true });
      fs.writeFileSync(path.join(options.outputDir, 'spec.md'), specMarkdown, 'utf-8');
      fs.writeFileSync(path.join(options.outputDir, 'plan.md'), planMarkdown, 'utf-8');
      fs.writeFileSync(path.join(options.outputDir, 'index.md'), indexMarkdown, 'utf-8');
    }

    return {
      specMarkdown,
      planMarkdown,
      indexMarkdown,
    };
  }

  /**
   * Compiles multiple candidates into structured track subdirectories under baseOutputDir.
   */
  public compileAllToTracks(
    candidates: ClusteredTrackCandidate[],
    baseOutputDir: string
  ): Array<{
    candidate: ClusteredTrackCandidate;
    trackDir: string;
    files: CompiledTrackResult;
  }> {
    const resolvedBase = path.resolve(baseOutputDir);
    return candidates.map((candidate) => {
      if (!/^[a-zA-Z0-9_\-]+$/.test(candidate.trackId)) {
        throw new Error(`Invalid track ID "${candidate.trackId}": contains prohibited path traversal characters`);
      }
      const trackDir = path.join(baseOutputDir, candidate.trackId);
      const resolvedTrackDir = path.resolve(trackDir);
      if (!resolvedTrackDir.startsWith(resolvedBase + path.sep)) {
        throw new Error(`Track output path escapes target directory: ${resolvedTrackDir}`);
      }
      const files = this.compileToTrack(candidate, { outputDir: trackDir });
      return {
        candidate,
        trackDir,
        files,
      };
    });
  }

  /**
   * Generates a YAML string suitable for superconductor/tracks.yaml.
   */
  public generateTracksYaml(candidates: ClusteredTrackCandidate[]): string {
    const trackEntries = candidates.map((c) => ({
      id: c.trackId,
      title: c.title,
      layer: c.layer,
      domain: c.domain,
      deps: c.dependsOn,
      benefit_score: c.benefitScore,
    }));

    return yaml.dump({ tracks: trackEntries }, { indent: 2, lineWidth: -1 });
  }

  /**
   * Generates spec.md
   */
  private generateSpecMarkdown(candidate: ClusteredTrackCandidate): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Track Specification: ${candidate.title}`);
    lines.push('');

    // Background & Architectural Rationale
    lines.push('## Background, Problem & Architectural Rationale');
    lines.push(
      `This track addresses visual feedback captured via spatial annotations for Layer ${candidate.layer} (${candidate.layerName.toUpperCase()}).`
    );
    lines.push(
      'In accordance with **ADR 0003 (Layered Assembly Partitioning)**, visual feedback is structured into hierarchical editing waves rather than naive screen-by-screen slicing. This architecture completely eliminates cross-track merge conflicts on shared component files and ensures foundational design tokens propagate naturally downstream.'
    );
    lines.push('');
    lines.push(`- **Track ID:** \`${candidate.trackId}\``);
    lines.push(`- **Layer Level:** Layer ${candidate.layer} (${candidate.layerName})`);
    lines.push(`- **Domain:** \`${candidate.domain}\``);
    lines.push(`- **Benefit Score:** ${candidate.benefitScore}`);
    lines.push(
      `- **Dependencies:** ${
        candidate.dependsOn.length > 0
          ? candidate.dependsOn.map((d) => `\`${d}\``).join(', ')
          : 'None (Wave 0 Prerequisite Foundation)'
      }`
    );
    lines.push('');

    // Visual Evidence Table
    lines.push('## Visual Evidence Table');
    lines.push(
      'The following spatial annotations were anchored in the live preview and assembled into this track candidate:'
    );
    lines.push('');
    lines.push('| ID | Type | Selector / Location | Severity | Tags | Comment |');
    lines.push('|---|---|---|---|---|---|');

    for (const ann of candidate.annotations) {
      const typeStr =
        ann.type === 'pin'
          ? `pin (${ann.geometry.x}, ${ann.geometry.y})`
          : `box (${ann.geometry.x}, ${ann.geometry.y}, ${ann.geometry.width ?? 0}x${ann.geometry.height ?? 0})`;

      let locStr = ann.selector || '';
      if (ann.sourceLocation?.filePath) {
        const fileLoc = `${ann.sourceLocation.filePath}${
          ann.sourceLocation.lineNumber ? `:${ann.sourceLocation.lineNumber}` : ''
        }`;
        locStr = locStr ? `${locStr} (${fileLoc})` : fileLoc;
      }
      if (!locStr) {
        locStr = ann.viewId || '(global)';
      }

      const severity = ann.severity || 'enhancement';
      const tags = (ann.tags || []).join(', ');
      const comment = escapeTableCell(ann.comment || '');

      lines.push(
        `| ${escapeTableCell(ann.id)} | ${escapeTableCell(typeStr)} | ${escapeTableCell(
          locStr
        )} | ${severity} | ${escapeTableCell(tags)} | ${comment} |`
      );
    }
    lines.push('');

    // Functional Requirements
    lines.push('## Functional Requirements');
    lines.push(this.generateFunctionalRequirements(candidate));
    lines.push('');

    // Non-Functional Requirements
    lines.push('## Non-Functional Requirements');
    lines.push(
      '- **Zero-Config & Confinement**: All code modifications must remain strictly confined to the targeted domain files.'
    );
    lines.push(
      '- **Visual Performance**: Animation and style updates must render at 60fps without layout thrashing or unneeded DOM re-renders.'
    );
    lines.push(
      '- **Design OS Hit-Testing Dogma**: Floating UI elements, overlays, and previews must adhere to pointer-events pass-through standards.'
    );
    lines.push(
      '- **Accessibility**: All modified components and views must satisfy WCAG 2.1 AA contrast and navigation standards.'
    );
    lines.push('');

    // Acceptance Criteria
    lines.push('## Acceptance Criteria');
    lines.push(this.generateAcceptanceCriteria(candidate));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generates plan.md with strict schema tags:
   * [TIER-N:TCS=X], [AGENT:superconductor-processor], [DOMAIN:...], CREATES:, PROTECTED:, INVARIANT_AFTER:, REUSES: [...]
   */
  private generatePlanMarkdown(
    candidate: ClusteredTrackCandidate,
    phaseName?: string
  ): string {
    const lines: string[] = [];

    lines.push('**Status:** [ ]');
    lines.push(`**Phase:** ${phaseName || 'visual-assembly'}`);
    lines.push('');

    // Phase 0: Primary Implementation
    lines.push('## Phase 0: Implementation & Visual Refactoring');
    lines.push('');

    const primaryTask = this.generatePrimaryTaskCard(candidate);
    lines.push(primaryTask);
    lines.push('');

    // Phase 1: Verification & Visual Regression
    lines.push('## Phase 1: Verification & Visual Regression Testing');
    lines.push('');

    const verificationTask = this.generateVerificationTaskCard(candidate);
    lines.push(verificationTask);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generates index.md
   */
  private generateIndexMarkdown(candidate: ClusteredTrackCandidate): string {
    const lines: string[] = [];

    lines.push(`# Track: ${candidate.title}`);
    lines.push('');
    lines.push(`**Track ID:** \`${candidate.trackId}\`  `);
    lines.push(`**Layer:** Layer ${candidate.layer} (${candidate.layerName})  `);
    lines.push(`**Domain:** \`${candidate.domain}\`  `);
    lines.push(`**Benefit Score:** ${candidate.benefitScore}  `);
    lines.push(
      `**Dependencies:** ${
        candidate.dependsOn.length > 0
          ? candidate.dependsOn.map((d) => `\`${d}\``).join(', ')
          : 'None (Root Wave)'
      }`
    );
    lines.push('');
    lines.push('## Documents');
    lines.push('- [Specification](./spec.md)');
    lines.push('- [Implementation Plan](./plan.md)');
    lines.push('');

    return lines.join('\n');
  }

  private generateFunctionalRequirements(candidate: ClusteredTrackCandidate): string {
    const frs: string[] = [];

    switch (candidate.layer) {
      case 0: // Tokens
        frs.push(
          '- **FR-1**: Standardize canonical semantic design tokens (Surfaces, Typography, Brand, Geometry) in `:root` and dark mode.'
        );
        frs.push(
          '- **FR-2**: Provide token exports and type definitions for consumption across shared components.'
        );
        frs.push(
          '- **FR-3**: Resolve all visual inconsistencies, hardcoded color values, and spacing discrepancies documented in the Visual Evidence Table.'
        );
        break;

      case 1: // Shared Golden Components
        const comp = candidate.affectedComponents[0] || 'Shared Component';
        frs.push(
          `- **FR-1**: Refactor \`${comp}\` to strictly bind to semantic design tokens without inline style magic numbers.`
        );
        frs.push(
          `- **FR-2**: Resolve layout, contrast, and interactive state defects for \`${comp}\` highlighted in the Visual Evidence Table.`
        );
        frs.push(
          `- **FR-3**: Ensure \`${comp}\` renders consistently across all views that consume it without breaking props.`
        );
        break;

      case 2: // Downstream Views / Screen Features
        const view = candidate.viewIds[0] || candidate.title;
        frs.push(
          `- **FR-1**: Update \`${view}\` layout, container geometry, and visual hierarchy to reflect the visual feedback notes.`
        );
        frs.push(
          `- **FR-2**: Bind \`${view}\` to updated shared components and foundational tokens.`
        );
        frs.push(
          `- **FR-3**: Eliminate visual alignment and responsive state bugs listed in the Visual Evidence Table.`
        );
        break;

      case 3: // Workflows / E2E
        frs.push(
          '- **FR-1**: Verify end-to-end multi-screen user workflow continuity and layout stability.'
        );
        frs.push(
          '- **FR-2**: Resolve multi-view transition glitches and state persistence discrepancies.'
        );
        frs.push(
          '- **FR-3**: Validate integration flow against all attached spatial annotation criteria.'
        );
        break;
    }

    return frs.join('\n');
  }

  private generateAcceptanceCriteria(candidate: ClusteredTrackCandidate): string {
    const acs: string[] = [];

    switch (candidate.layer) {
      case 0:
        acs.push(
          '- **AC-1**: All semantic tokens are declared in `src/theme/tokens.css` with valid fallback values.'
        );
        acs.push(
          '- **AC-2**: Automated token verification tests verify 100% token coverage across all 4 tiers.'
        );
        acs.push(
          '- **AC-3**: Visual defects in the evidence table tagged `#token` or `#theme` are eliminated.'
        );
        break;

      case 1:
        const comp = candidate.affectedComponents[0] || 'Shared Component';
        acs.push(
          `- **AC-1**: \`${comp}\` satisfies WCAG AA contrast requirements in both light and dark themes.`
        );
        acs.push(
          `- **AC-2**: Component tests for \`${comp}\` pass without regressions in shared consumption.`
        );
        acs.push(
          `- **AC-3**: All spatial annotation defects associated with \`${comp}\` are resolved.`
        );
        break;

      case 2:
        const view = candidate.viewIds[0] || candidate.title;
        acs.push(
          `- **AC-1**: \`${view}\` layout renders correctly across desktop and mobile viewports.`
        );
        acs.push(
          `- **AC-2**: Visual evidence issues anchored on \`${view}\` are confirmed fixed.`
        );
        acs.push(
          `- **AC-3**: View integration tests pass and confirm correct shared component bindings.`
        );
        break;

      case 3:
        acs.push(
          '- **AC-1**: Multi-screen navigation workflow transitions smoothly without visual jumps.'
        );
        acs.push(
          '- **AC-2**: All cross-cutting workflow annotations in the evidence table are satisfied.'
        );
        acs.push(
          '- **AC-3**: E2E integration test suite runs cleanly and confirms workflow completion.'
        );
        break;
    }

    return acs.join('\n');
  }

  private generatePrimaryTaskCard(candidate: ClusteredTrackCandidate): string {
    const creates = candidate.targetFiles.length > 0
      ? candidate.targetFiles.join(', ')
      : candidate.layer === 0
      ? 'src/theme/tokens.css'
      : `src/components/${candidate.affectedComponents[0] || 'Component'}.tsx`;

    let protectedFiles = 'package.json';
    if (candidate.layer > 0 && candidate.dependsOn.length > 0) {
      protectedFiles = 'src/theme/tokens.css';
    }

    let invariant = 'Implementation MUST strictly adhere to design system guidelines and pass visual tests.';
    if (candidate.layer === 0) {
      invariant = 'All 4 tiers of canonical semantic tokens MUST be defined in :root with valid fallback values.';
    } else if (candidate.layer === 1) {
      const comp = candidate.affectedComponents[0] || 'Component';
      invariant = `Shared component ${comp} MUST bind to semantic tokens and pass WCAG AA contrast checks.`;
    } else if (candidate.layer === 2) {
      invariant = 'View layout MUST integrate shared components and preserve responsive state parity.';
    } else if (candidate.layer === 3) {
      invariant = 'Multi-screen workflow transitions MUST preserve state across view boundaries without visual glitches.';
    }

    const reuses = candidate.layer === 0
      ? ['src/theme/tokens.css']
      : ['src/theme/tokens.css', ...candidate.affectedComponents.map((c) => `src/components/${c}.tsx`)];

    const lines: string[] = [
      `- [ ] Task: ${candidate.title} [TIER-${candidate.tier}:TCS=${candidate.tcs}] [AGENT:superconductor-processor] [DOMAIN:${candidate.domain}]`,
      `    CREATES: ${creates}`,
      `    PROTECTED: ${protectedFiles}`,
      `    INVARIANT_AFTER: "${invariant}"`,
      `    REUSES: [${reuses.join(', ')}]`,
      '    - [ ] Apply visual fixes identified in spatial annotations',
      '    - [ ] Bind semantic tokens and verify responsive styles',
      '    - [ ] Verify component state transitions and layout integrity',
    ];

    return lines.join('\n');
  }

  private generateVerificationTaskCard(candidate: ClusteredTrackCandidate): string {
    let testFile = 'tests/visual/verification.test.ts';
    if (candidate.layer === 0) {
      testFile = 'tests/theme/tokens.test.ts';
    } else if (candidate.layer === 1) {
      const comp = candidate.affectedComponents[0] || 'component';
      testFile = `tests/components/${comp.toLowerCase()}.test.ts`;
    } else if (candidate.layer === 2) {
      const view = candidate.viewIds[0] || 'view';
      testFile = `tests/views/${view.toLowerCase().replace(/^view[-_]?/, '')}.test.ts`;
    } else if (candidate.layer === 3) {
      testFile = 'tests/e2e/workflow.test.ts';
    }

    const primaryTarget = candidate.targetFiles[0] || 'src/theme/tokens.css';

    const lines: string[] = [
      `- [ ] Task: Verification & Test Suite [TIER-2:TCS=2] [AGENT:superconductor-processor] [DOMAIN:tests]`,
      `    CREATES: ${testFile}`,
      `    PROTECTED: ${primaryTarget}`,
      `    INVARIANT_AFTER: "All visual regression tests and accessibility checks MUST pass cleanly."`,
      `    REUSES: [${primaryTarget}]`,
      '    - [ ] Execute automated visual regression test suite',
      '    - [ ] Verify accessibility standards (WCAG AA contrast & keyboard nav)',
    ];

    return lines.join('\n');
  }
}
