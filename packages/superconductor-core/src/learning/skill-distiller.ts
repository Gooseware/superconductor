/**
 * WorkflowSkillDistiller
 *
 * Distills successful, high-leverage multi-step execution graphs from
 * ExperienceRecord traces into reusable, validated SKILL.md documents.
 *
 * Invariant: Distiller MUST produce valid SKILL.md documents with YAML
 * frontmatter containing name and description.
 */

import {
  ExperienceRecord,
  ExecutionStep,
  DistilledSkill,
  DistillationOptions,
} from './types.js';
import { generateSkillMarkdown, SkillTemplateData } from './templates.js';

export type { DistilledSkill, DistillationOptions };

export class WorkflowSkillDistiller {
  /**
   * Distills an ExperienceRecord into a candidate DistilledSkill.
   * Returns null if the record is trivial, failed (and not allowed), or below confidence threshold.
   */
  public static distillFromExperience(
    record: ExperienceRecord,
    options?: DistillationOptions
  ): (DistilledSkill & { content: string; sourceTrackId: string; confidenceScore: number }) | null {
    if (!record || typeof record !== 'object') {
      return null;
    }

    // 1. Validate outcome (discard failed records unless explicitly allowed)
    const isFailed = record.outcome === 'failure';
    const allowFailure = Boolean(options?.allowFailure || options?.allowFailed);
    if (isFailed && !allowFailure) {
      return null;
    }

    // 2. Validate step volume (discard trivial records unless allowed)
    const steps = Array.isArray(record.steps) ? record.steps : [];
    const minSteps = options?.minSteps ?? 2;
    const allowTrivial = Boolean(options?.allowTrivial);
    if (steps.length < minSteps && !allowTrivial) {
      return null;
    }

    // 3. Formulate kebab-case skill name
    const name = this.formulateSkillName(record, options);
    if (!name) {
      return null;
    }

    // 4. Compute confidence score
    const confidenceScore = this.computeConfidenceScore(record);
    if (typeof options?.minConfidence === 'number' && confidenceScore < options.minConfidence) {
      return null;
    }

    // 5. Formulate description
    const description = this.formulateDescription(record, name, options);

    // 6. Formulate procedure from steps
    const workflowProcedure = this.extractWorkflowProcedure(steps);

    // 7. Formulate guidelines and invariants from Quorum feedback
    const guidelinesInvariants = this.extractGuidelines(record);

    // 8. Formulate verification from test steps
    const verification = this.extractVerification(steps);

    // 9. Formulate when-to-use
    const whenToUse = this.extractWhenToUse(record, name);

    // 10. Generate canonical SKILL.md content
    const templateData: SkillTemplateData = {
      name,
      description,
      sourceTrackId: record.trackId,
      confidenceScore,
      status: options?.status ?? 'incubating',
      vettingStatus: options?.vettingStatus ?? 'pending',
      harvestTimestamp: options?.harvestTimestamp,
      overview: `Workflow distilled from track \`${record.trackId}\`.\n\nGoal: ${record.goal || name}`,
      whenToUse,
      workflowProcedure,
      guidelinesInvariants,
      verification,
    };

    const content = generateSkillMarkdown(templateData);

    return {
      name,
      description,
      content,
      sourceTrackId: record.trackId,
      confidenceScore,
    };
  }

  /**
   * Computes a normalized confidence score (0.0 - 1.0) based on trajectory metrics:
   * outcome, step success ratio, step count, quorum feedback, and tool diversity.
   */
  public static computeConfidenceScore(record: ExperienceRecord): number {
    if (!record || typeof record !== 'object') {
      return 0.0;
    }

    // Base score based on outcome
    let score = record.outcome === 'success' ? 0.6 : 0.15;

    const steps = Array.isArray(record.steps) ? record.steps : [];
    const stepCount = steps.length;

    // Step volume factor
    if (stepCount >= 5) {
      score += 0.15;
    } else if (stepCount >= 3) {
      score += 0.10;
    } else if (stepCount >= 2) {
      score += 0.05;
    }

    // Step success ratio factor
    if (stepCount > 0) {
      const successSteps = steps.filter(s => s && s.status === 'success').length;
      const successRatio = successSteps / stepCount;
      if (successRatio === 1.0) {
        score += 0.10;
      } else if (successRatio < 0.5) {
        score -= 0.15;
      } else {
        score += (successRatio - 0.5) * 0.2;
      }
    }

    // Quorum reviews factor
    const reviews = Array.isArray(record.quorumReviews) ? record.quorumReviews : [];
    if (reviews.length > 0) {
      const resolvedCount = reviews.filter(r => r && r.verdict === 'RESOLVED').length;
      const needsFixesCount = reviews.filter(r => r && r.verdict === 'NEEDS_FIXES').length;

      if (needsFixesCount === 0 && resolvedCount > 0) {
        score += Math.min(0.15, resolvedCount * 0.05);
      } else if (needsFixesCount > 0) {
        score -= needsFixesCount * 0.10;
      }
    }

    // Tool diversity factor
    if (stepCount > 0) {
      const uniqueTools = new Set(steps.map(s => s?.tool).filter(Boolean)).size;
      if (uniqueTools >= 2) {
        score += 0.05;
      }
    }

    // Capping for failed records
    if (record.outcome === 'failure') {
      score = Math.min(score, 0.40);
    }

    const clamped = Math.max(0.0, Math.min(1.0, score));
    return Math.round(clamped * 100) / 100;
  }

  /**
   * Formulates a clean kebab-case skill name.
   */
  public static formulateSkillName(
    record: ExperienceRecord,
    options?: DistillationOptions
  ): string {
    if (options?.skillName) {
      return this.toKebabCase(options.skillName);
    }

    if (record.goal) {
      // Strip common task / plan prefixes
      const cleaned = record.goal
        .replace(/^(?:task:\s*)?(?:implement|create|build|add|support|setup|refactor|fix)\s+/i, '')
        .trim();

      const candidate = this.toKebabCase(cleaned);
      if (candidate && candidate.length >= 3) {
        return candidate;
      }
    }

    if (record.trackId) {
      // Strip trailing date stamps like _20260906 or -20260906
      const cleanedTrack = record.trackId.replace(/[-_]\d{8}$/, '');
      const candidate = this.toKebabCase(cleanedTrack);
      if (candidate) {
        return candidate;
      }
    }

    return `workflow-skill-${this.toKebabCase(record.id) || 'unnamed'}`;
  }

  /**
   * Formulate a single-line descriptive summary.
   */
  private static formulateDescription(
    record: ExperienceRecord,
    name: string,
    options?: DistillationOptions
  ): string {
    if (options?.description) {
      return options.description.trim();
    }

    if (record.goal) {
      const cleanGoal = record.goal.replace(/^(?:task:\s*)?/i, '').trim();
      return cleanGoal.endsWith('.') ? cleanGoal : `${cleanGoal}.`;
    }

    return `Workflow for ${name} harvested from track ${record.trackId || 'unknown'}.`;
  }

  /**
   * Converts a phrase or token to kebab-case.
   */
  public static toKebabCase(str: string): string {
    if (!str) return '';
    let trimmed = str.trim();

    // If there is no whitespace or underscore/hyphen, split camelCase / PascalCase
    if (!/[\s_-]/.test(trimmed)) {
      trimmed = trimmed.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
    }

    return trimmed
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  private static extractWorkflowProcedure(steps: ExecutionStep[]): string[] {
    if (!steps || steps.length === 0) {
      return [
        '1. Set up and verify required environment preconditions.',
        '2. Execute core workflow steps according to target requirements.',
        '3. Inspect intermediate outputs and validate results.',
      ];
    }

    return steps.map((step, idx) => {
      const stepNum = idx + 1;
      const toolName = step.tool || 'action';
      let detail = '';

      if (step.input && typeof step.input === 'object') {
        const inputObj = step.input as Record<string, unknown>;
        const summary =
          typeof inputObj.toolSummary === 'string'
            ? inputObj.toolSummary
            : typeof inputObj.toolAction === 'string'
              ? inputObj.toolAction
              : '';

        let target = '';
        if (typeof inputObj.CommandLine === 'string') {
          target = `\`${inputObj.CommandLine}\``;
        } else if (typeof inputObj.TargetFile === 'string') {
          target = `\`${inputObj.TargetFile}\``;
        } else if (typeof inputObj.Action === 'string') {
          target = `Action: ${inputObj.Action}`;
        }

        if (summary && target) {
          detail = `${summary} (${target})`;
        } else if (summary) {
          detail = summary;
        } else if (target) {
          detail = target;
        }
      }

      const detailText = detail ? ` - ${detail}` : '';
      return `${stepNum}. Execute \`${toolName}\`${detailText}.`;
    });
  }

  private static extractGuidelines(record: ExperienceRecord): string[] {
    const guidelines: string[] = [];

    if (Array.isArray(record.quorumReviews)) {
      for (const review of record.quorumReviews) {
        if (Array.isArray(review.findings)) {
          for (const finding of review.findings) {
            if (finding && typeof finding === 'string' && finding.trim()) {
              guidelines.push(`- ${finding.trim()}`);
            }
          }
        }
      }
    }

    if (guidelines.length === 0) {
      guidelines.push(
        '- Follow Superconductor and Design OS Dogma standards.',
        '- Ensure all changes maintain backward compatibility and pass verification.'
      );
    }

    return guidelines;
  }

  private static extractVerification(steps: ExecutionStep[]): string[] {
    const testStep = steps.find(
      s =>
        s.tool === 'run_command' &&
        s.input &&
        typeof s.input === 'object' &&
        typeof (s.input as Record<string, unknown>).CommandLine === 'string' &&
        /(test|vitest|jest|pytest|cargo test|npm test)/i.test(
          (s.input as Record<string, unknown>).CommandLine as string
        )
    );

    if (testStep) {
      const cmd = (testStep.input as Record<string, unknown>).CommandLine as string;
      return [
        `1. Execute verification command: \`${cmd}\``,
        '2. Confirm all tests pass with zero failures.',
      ];
    }

    return [
      '1. Run relevant automated test suites to confirm functionality.',
      '2. Verify that all invariants and acceptance criteria are satisfied.',
    ];
  }

  private static extractWhenToUse(record: ExperienceRecord, name: string): string[] {
    const whenToUse: string[] = [
      `- Use when performing tasks related to: ${record.goal || name}.`,
    ];

    if (Array.isArray(record.tags) && record.tags.length > 0) {
      whenToUse.push(`- Applicable for workflows tagged with: ${record.tags.join(', ')}.`);
    }

    const uniqueTools = Array.from(new Set(record.steps.map(s => s.tool).filter(Boolean)));
    if (uniqueTools.length > 0) {
      whenToUse.push(`- Leverages tools: ${uniqueTools.map(t => `\`${t}\``).join(', ')}.`);
    }

    return whenToUse;
  }
}
