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

  const workflowProcedure = formatSection(data.workflowProcedure, [
    '1. Set up and verify required environment preconditions.',
    '2. Execute core workflow steps sequentially.',
    '3. Inspect outputs and validate intermediate artifacts.',
  ]);

  const guidelinesInvariants = formatSection(data.guidelinesInvariants, [
    '- Follow Superconductor and Design OS Dogma standards.',
    '- Ensure all changes maintain backward compatibility and pass verification.',
  ], true);

  const verification = formatSection(data.verification, [
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
