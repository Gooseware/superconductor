/**
 * Skill Template Generator
 *
 * Generates canonical SKILL.md documents with validated YAML frontmatter
 * and standardized markdown instruction sections.
 *
 * Invariant: Distiller MUST produce valid SKILL.md documents with YAML
 * frontmatter containing name and description.
 */

import yaml from 'js-yaml';
import { SkillProvenanceMetadata, SkillTemplateData } from './types.js';

export type { SkillProvenanceMetadata, SkillTemplateData };

export class SkillTemplateGenerator {
  /**
   * Render a complete canonical SKILL.md document from provided template data.
   */
  public static render(data: SkillTemplateData): string {
    return generateSkillMarkdown(data);
  }

  /**
   * Helper method to generate canonical SKILL.md markdown text.
   */
  public static generateSkillMarkdown(data: SkillTemplateData): string {
    return generateSkillMarkdown(data);
  }
}

/**
 * Helper function to generate canonical SKILL.md markdown text.
 */
export function generateSkillMarkdown(data: SkillTemplateData): string {
  const name = (data.name || '').trim();
  const description = (data.description || '').trim();

  const provenanceStatus = data.provenance?.status ?? data.status ?? 'incubating';
  const sourceTrack = data.provenance?.source_track ?? data.sourceTrackId ?? 'unknown';
  const harvestTimestamp =
    data.provenance?.harvest_timestamp ?? data.harvestTimestamp ?? new Date().toISOString();
  const rawConfidence = data.provenance?.confidence_score ?? data.confidenceScore ?? 0.0;
  const confidenceScore = typeof rawConfidence === 'number'
    ? Number(rawConfidence.toFixed(2))
    : 0.0;
  const vettingStatus = data.provenance?.vetting_status ?? data.vettingStatus ?? 'pending';

  const frontmatterObj: Record<string, any> = {
    name,
    description,
    superconductor_learning: {
      status: provenanceStatus,
      source_track: sourceTrack,
      harvest_timestamp: harvestTimestamp,
      confidence_score: confidenceScore,
      vetting_status: vettingStatus,
    },
  };

  if (Array.isArray(data.tools) && data.tools.length > 0) {
    frontmatterObj.tools = data.tools;
  }

  if (Array.isArray(data.tags) && data.tags.length > 0) {
    frontmatterObj.tags = data.tags;
  }

  if (data.metadata && typeof data.metadata === 'object') {
    for (const [key, value] of Object.entries(data.metadata)) {
      if (!(key in frontmatterObj)) {
        frontmatterObj[key] = value;
      }
    }
  }

  const frontmatterYaml = yaml.dump(frontmatterObj, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trim();

  const title = data.title ?? name;

  const overview = formatSection(data.overview, [
    `Automated skill distilled from successful execution trajectory in track \`${sourceTrack}\`.`,
    description,
  ]);

  const whenToUse = formatSection(data.whenToUse, [
    `- Use when executing tasks matching: ${name}.`,
    `- Activate when encountering similar workflow patterns or problems in track execution.`,
  ], true);

  const isContrastive =
    hasContent(data.antiPattern) ||
    hasContent(data.hardenedPattern) ||
    (typeof data.diffHunk === 'string' && data.diffHunk.trim().length > 0);

  if (isContrastive) {
    const antiPattern = formatSection(
      data.antiPattern,
      [
        '- Avoid unconstrained tool executions and unvalidated inputs.',
        '- Prevent silent failures and unhandled error cases.',
      ],
      true
    );

    let hardenedContent = formatSection(
      data.hardenedPattern,
      [
        'Implement strict boundary validation, validated input handling, and automated verification before completion.',
      ]
    );

    if (data.diffHunk && data.diffHunk.trim().length > 0) {
      hardenedContent += '\n\n' + formatDiffHunk(data.diffHunk);
    }

    const invariantsRules = formatSection(
      data.invariantsRules ?? data.guidelinesInvariants,
      [
        '- Follow Superconductor and Design OS Dogma standards.',
        '- Ensure all changes maintain backward compatibility and pass verification.',
      ],
      true
    );

    const verificationRecipe = formatSection(
      data.verificationRecipe ?? data.verification,
      [
        '1. Run relevant automated test suites to confirm functionality.',
        '2. Verify that all invariants and acceptance criteria are satisfied.',
      ]
    );

    let markdown = `---
${frontmatterYaml}
---

# ${title}

## Overview
${overview}

## When to Use
${whenToUse}

## Anti-Patterns & Common Traps (Where Things Go Wrong)
${antiPattern}

## Hardened Implementation Pattern (Where Things Go Right)
${hardenedContent}
`;

    if (hasContent(data.workflowProcedure)) {
      const workflowProcedure = formatSection(data.workflowProcedure, []);
      markdown += `\n## Workflow & Procedure\n${workflowProcedure}\n`;
    }

    markdown += `\n## Invariants & Rules\n${invariantsRules}\n\n## Verification Recipe\n${verificationRecipe}\n`;

    return markdown.trim() + '\n';
  }

  // Traditional non-contrastive template workflow
  const workflowProcedure = formatSection(data.workflowProcedure, [
    '1. Set up and verify required environment preconditions.',
    '2. Execute core workflow steps sequentially.',
    '3. Inspect outputs and validate intermediate artifacts.',
  ]);

  const guidelinesInvariants = formatSection(data.guidelinesInvariants ?? data.invariantsRules, [
    '- Follow Superconductor and Design OS Dogma standards.',
    '- Ensure all changes maintain backward compatibility and pass verification.',
  ], true);

  const verification = formatSection(data.verification ?? data.verificationRecipe, [
    '1. Run relevant automated test suites to confirm functionality.',
    '2. Verify that all invariants and acceptance criteria are satisfied.',
  ]);

  return `---
${frontmatterYaml}
---

# ${title}

## Overview
${overview}

## When to Use
${whenToUse}

## Workflow & Procedure
${workflowProcedure}

## Guidelines & Invariants
${guidelinesInvariants}

## Verification
${verification}
`.trim() + '\n';
}

function hasContent(value: string | string[] | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(v => String(v).trim().length > 0);
  return false;
}

function formatDiffHunk(diffHunk: string): string {
  const trimmed = diffHunk.trim();
  if (trimmed.startsWith('```diff') && trimmed.endsWith('```')) {
    return trimmed;
  }
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    return trimmed.replace(/^```[a-z]*\r?\n?/, '```diff\n');
  }
  return '```diff\n' + trimmed + '\n```';
}

function formatSection(
  content: string | string[] | undefined,
  fallback: string[],
  asBullets: boolean = false
): string {
  if (content === undefined || content === null || (Array.isArray(content) && content.length === 0)) {
    return fallback.join('\n');
  }

  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : fallback.join('\n');
  }

  if (Array.isArray(content)) {
    const lines = content.map(item => {
      const line = String(item).trim();
      if (!line) return '';
      if (asBullets && !line.startsWith('-') && !line.startsWith('*') && !/^\d+\./.test(line)) {
        return `- ${line}`;
      }
      return line;
    }).filter(Boolean);

    return lines.length > 0 ? lines.join('\n') : fallback.join('\n');
  }

  return fallback.join('\n');
}
