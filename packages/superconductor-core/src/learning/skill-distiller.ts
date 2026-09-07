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
  RemediationPair,
} from './types.js';
import {
  generateSkillMarkdown,
  SkillTemplateGenerator,
  SkillTemplateData,
} from './templates.js';
import { SkillDogmaValidator } from './dogma-validator.js';
import { ReflectiveInvariantSynthesizer } from './invariant-synthesizer.js';
import { TranscriptParser } from './transcript-parser.js';

export type { DistilledSkill, DistillationOptions };

export class WorkflowSkillDistiller {
  /**
   * Distills contrastive remediation micro-skills from an ExperienceRecord.
   *
   * Invariant: Distilled micro-skills MUST NOT exceed 15 steps and MUST adhere
   * to Dogma tool whitelist.
   */
  public static distillRemediationMicroSkills(
    record: ExperienceRecord,
    options?: DistillationOptions
  ): (DistilledSkill & { content: string; sourceTrackId: string; confidenceScore: number })[] {
    if (!record || typeof record !== 'object') {
      return [];
    }

    let pairs = Array.isArray(record.remediationPairs) ? record.remediationPairs : [];
    if (pairs.length === 0) {
      pairs = this.deriveRemediationPairs(record);
    }
    if (pairs.length === 0) {
      return [];
    }

    const distilled: (DistilledSkill & {
      content: string;
      sourceTrackId: string;
      confidenceScore: number;
    })[] = [];

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (!pair) continue;

      // 1. Derive clean, concise, kebab-case micro-skill name
      const name = this.deriveRemediationSkillName(
        pair,
        record,
        pairs.length === 1 ? options : undefined
      );
      if (!name) continue;

      // 2. Compute confidence score
      const confidenceScore = this.computeRemediationConfidenceScore(pair, record, options);
      if (typeof options?.minConfidence === 'number' && confidenceScore < options.minConfidence) {
        continue;
      }

      // 3. Formulate description and overview
      const description =
        (pairs.length === 1 ? options?.description : undefined) ||
        this.formulateRemediationDescription(pair, name);

      const overview =
        `Contrastive remediation micro-skill for \`${name}\` harvested from track \`${record.trackId || 'unknown'}\`.\n\n` +
        `Target Defect: ${pair.finding || pair.errorSummary || name}.`;

      // 4. Formulate when-to-use
      const whenToUse = this.formulateRemediationWhenToUse(pair, name);

      // 5. Formulate antiPattern
      const antiPattern = this.formulateAntiPattern(pair);

      // 6. Formulate hardenedPattern
      const hardenedPattern = this.formulateHardenedPattern(pair);

      // 7. Attach diffHunk
      const diffHunk = pair.diffHunk || (record.metadata?.diffHunk as string) || undefined;

      // 8. Synthesize RFC-2119 invariantsRules
      const invariantsRules = this.synthesizeInvariantsRules(pair, record);

      // 9. Formulate verificationRecipe
      const verificationRecipe = this.extractVerificationRecipe(pair, record);

      // 10. Enforce invariant: Filter tools to Dogma whitelist & cap steps to <= 15
      const rawResolutionSteps = Array.isArray(pair.resolutionSteps) ? pair.resolutionSteps : [];
      const permittedToolSteps = rawResolutionSteps.filter(
        step => step && step.tool && SkillDogmaValidator.DEFAULT_PERMITTED_TOOLS.has(step.tool)
      );

      const cappedSteps = this.capResolutionSteps(permittedToolSteps, 15);
      let workflowProcedure = this.extractWorkflowProcedure(cappedSteps);
      if (workflowProcedure.length > 15) {
        workflowProcedure = workflowProcedure.slice(0, 15);
      }
      if (workflowProcedure.length === 0) {
        workflowProcedure = [
          '1. Execute `replace_file_content` to apply hardened patch.',
          '2. Execute `run_command` to verify resolution assertions.',
        ];
      }

      const permittedTools = Array.from(
        new Set(
          cappedSteps
            .map(s => s.tool)
            .filter(t => t && SkillDogmaValidator.DEFAULT_PERMITTED_TOOLS.has(t))
        )
      );
      const tools = permittedTools.length > 0
        ? permittedTools
        : ['replace_file_content', 'run_command'];

      // 11. Call SkillTemplateGenerator.generateSkillMarkdown with contrastive data
      const tags = Array.from(
        new Set([
          'remediation',
          'micro-skill',
          pair.domain || 'general',
          ...(record.tags || []),
        ])
      );

      const templateData: SkillTemplateData = {
        name,
        description,
        sourceTrackId: record.trackId,
        confidenceScore,
        status: options?.status ?? 'incubating',
        vettingStatus: options?.vettingStatus ?? 'pending',
        harvestTimestamp: options?.harvestTimestamp,
        title: name,
        overview,
        whenToUse,
        antiPattern,
        hardenedPattern,
        diffHunk,
        workflowProcedure,
        invariantsRules,
        verificationRecipe,
        tools,
        tags,
        metadata: {
          remediationId: pair.id,
          domain: pair.domain || 'general',
          finding: pair.finding,
        },
      };

      const content = SkillTemplateGenerator.generateSkillMarkdown(templateData);

      distilled.push({
        name,
        description,
        content,
        sourceTrackId: record.trackId,
        confidenceScore,
        tags,
        metadata: templateData.metadata,
      });
    }

    return distilled;
  }

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

    // Check distillRemediations option
    if (options?.distillRemediations && record.remediationPairs && record.remediationPairs.length > 0) {
      const microSkills = this.distillRemediationMicroSkills(record, options);
      if (microSkills.length > 0) {
        return microSkills[0];
      }
    }

    // 1. Validate outcome (discard failed records unless explicitly allowed)
    const isFailed = record.outcome === 'failure';
    const allowFailure = Boolean(options?.allowFailure || options?.allowFailed);
    if (isFailed && !allowFailure) {
      return null;
    }

    // 2. Validate step volume (discard trivial records unless allowed)
    let steps = Array.isArray(record.steps) ? record.steps : [];
    const minSteps = options?.minSteps ?? 2;
    const allowTrivial = Boolean(options?.allowTrivial);
    if (steps.length < minSteps && !allowTrivial) {
      return null;
    }

    // 2b. Condense track steps if steps > 20 and no explicit override is provided
    const maxStepsOverride = options?.maxSteps;
    if (steps.length > 20 && maxStepsOverride === undefined) {
      steps = this.condenseTrackSteps(steps, 20);
    } else if (maxStepsOverride !== undefined && steps.length > maxStepsOverride) {
      steps = this.condenseTrackSteps(steps, maxStepsOverride);
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

  /**
   * Derives RemediationPairs from execution steps or quorum reviews if not explicitly provided.
   */
  private static deriveRemediationPairs(record: ExperienceRecord): RemediationPair[] {
    const pairs: RemediationPair[] = [];

    // 1. Derive from steps via TranscriptParser
    if (Array.isArray(record.steps) && record.steps.length > 0) {
      const stepPairs = TranscriptParser.extractFailureRemediationPairs(record.steps);
      if (stepPairs.length > 0) {
        pairs.push(...stepPairs);
      }
    }

    // 2. If no pairs from steps, check Quorum reviews with NEEDS_FIXES
    if (pairs.length === 0 && Array.isArray(record.quorumReviews)) {
      for (let idx = 0; idx < record.quorumReviews.length; idx++) {
        const qr = record.quorumReviews[idx];
        if (qr && qr.verdict === 'NEEDS_FIXES' && Array.isArray(qr.findings)) {
          for (let fIdx = 0; fIdx < qr.findings.length; fIdx++) {
            const finding = qr.findings[fIdx];
            if (!finding || typeof finding !== 'string' || !finding.trim()) continue;

            let domain = 'security';
            if (qr.reviewerRole) {
              const roleLower = qr.reviewerRole.toLowerCase();
              if (roleLower.includes('correctness')) domain = 'correctness';
              else if (roleLower.includes('adversarial')) domain = 'adversarial';
              else if (roleLower.includes('security')) domain = 'security';
            }

            const resolutionSteps = (record.steps || []).filter(s => s.status === 'success');

            pairs.push({
              id: `rem-quorum-${idx}-${fIdx}`,
              domain,
              finding: finding.trim(),
              errorSummary: finding.trim(),
              resolutionSteps,
            });
          }
        }
      }
    }

    return pairs;
  }

  /**
   * Derives a clean, concise, kebab-case micro-skill name.
   */
  public static deriveRemediationSkillName(
    pair: RemediationPair,
    record?: ExperienceRecord,
    options?: DistillationOptions
  ): string {
    if (options?.skillName) {
      return this.toKebabCase(options.skillName);
    }

    const finding = (pair.finding || '').trim();
    const summary = (pair.errorSummary || '').trim();
    const domain = (pair.domain || '').trim().toLowerCase();
    const combined = `${finding} ${summary}`.toLowerCase();

    // Semantic pattern matches for canonical micro-skills
    if (/path\s*traversal|directory\s*traversal|\.\.\/|outside\s*(?:root|sandbox)/i.test(combined)) {
      return 'path-traversal-containment';
    }
    if (/shell\s*pattern|prohibited\s*shell|regex\s*(?:hardening|bypass)/i.test(combined)) {
      return 'shell-pattern-regex-hardening';
    }
    if (/canary\s*sandbox|sandbox\s*isolation|sandbox\s*escape/i.test(combined)) {
      return 'canary-sandbox-isolation';
    }
    if (/sql\s*injection/i.test(combined)) {
      return 'sql-injection-prevention';
    }
    if (/command\s*injection/i.test(combined)) {
      return 'command-injection-containment';
    }
    if (/cross[- ]site|xss/i.test(combined)) {
      return 'xss-sanitization-hardening';
    }
    if (/prototype\s*pollution/i.test(combined)) {
      return 'prototype-pollution-guard';
    }
    if (/credential\s*leak|secret\s*leak|token\s*leak|password\s*leak/i.test(combined)) {
      return 'credential-redaction-hardening';
    }
    if (/buffer\s*overflow/i.test(combined)) {
      return 'buffer-overflow-prevention';
    }
    if (/memory\s*leak/i.test(combined)) {
      return 'memory-leak-containment';
    }
    if (/circular\s*dependency|infinite\s*loop|cycle\s*detection/i.test(combined)) {
      return 'cycle-detection-guard';
    }
    if (/timeout|hanging\s*socket|socket\s*timeout/i.test(combined)) {
      return 'timeout-handling-resilience';
    }

    // Derive from finding or errorSummary
    const candidateText = finding || summary;
    if (candidateText) {
      const cleaned = candidateText
        .replace(/^(?:assertionerror|error|exception|fail|failed|vulnerability|finding|defect|fix|task):\s*/i, '')
        .replace(/^(?:the\s+)?(?:system|component|module|service)\s+(?:must\s+not|must|should\s+not|should)\s+/i, '')
        .replace(/^(?:fails?\s+to|does\s+not|doesn't)\s+/i, '')
        .replace(/[^a-zA-Z0-9\s-]/g, ' ')
        .trim();

      const stopWords = new Set([
        'the', 'a', 'an', 'in', 'to', 'for', 'with', 'of', 'and', 'or', 'by',
        'is', 'was', 'be', 'at', 'from', 'on', 'as', 'into', 'that', 'this', 'it'
      ]);

      const words = cleaned
        .split(/\s+/)
        .map(w => w.toLowerCase())
        .filter(w => w.length > 1 && !stopWords.has(w));

      if (words.length > 0) {
        const selectedWords = words.slice(0, 4);
        const lastWord = selectedWords[selectedWords.length - 1];
        const standardSuffixes = [
          'containment', 'hardening', 'prevention', 'guard', 'isolation',
          'remediation', 'resolution', 'validation', 'handling', 'protection',
          'sanitization', 'fix'
        ];

        if (!standardSuffixes.includes(lastWord)) {
          if (domain === 'security') {
            selectedWords.push('hardening');
          } else {
            selectedWords.push('remediation');
          }
        }

        const candidate = this.toKebabCase(selectedWords.join('-'));
        if (candidate && candidate.length >= 3) {
          return candidate;
        }
      }
    }

    if (pair.id) {
      return `remediation-${this.toKebabCase(pair.id)}`;
    }
    return `remediation-micro-skill-${Date.now().toString(36)}`;
  }

  /**
   * Formulate antiPattern description covering failure description, error trace, and vulnerability reason.
   */
  private static formulateAntiPattern(pair: RemediationPair): string[] {
    const antiPatterns: string[] = [];

    if (pair.finding && pair.finding.trim()) {
      antiPatterns.push(`Vulnerability / Defect: ${pair.finding.trim().replace(/\.+$/, '')}.`);
    }

    if (pair.errorSummary && pair.errorSummary.trim()) {
      antiPatterns.push(`Failure trace / description: ${pair.errorSummary.trim().replace(/\.+$/, '')}.`);
    }

    if (pair.failureStep) {
      const tool = pair.failureStep.tool;
      let detail = '';
      if (pair.failureStep.input && typeof pair.failureStep.input === 'object') {
        const inp = pair.failureStep.input as Record<string, any>;
        if (inp.TargetFile) detail = ` on \`${inp.TargetFile}\``;
        else if (inp.CommandLine) detail = ` running \`${inp.CommandLine}\``;
        else if (inp.Action) detail = ` (action: ${inp.Action})`;
      }
      antiPatterns.push(`Failing execution: Step with tool \`${tool}\`${detail} produced failure status "${pair.failureStep.status}".`);

      const snippet = this.extractErrorSnippet(pair.failureStep.output);
      if (snippet) {
        antiPatterns.push(`Error trace snippet: \`${snippet}\`.`);
      }
    }

    antiPatterns.push('Anti-pattern traps: Unvalidated boundary conditions, unconstrained execution paths, or missing error containment.');

    return antiPatterns;
  }

  /**
   * Formulate hardenedPattern describing fix strategy and surgical resolution steps.
   */
  private static formulateHardenedPattern(pair: RemediationPair): string[] {
    const lines: string[] = [];

    lines.push('Implement strict boundary validation, validated input handling, and automated verification before completion.');

    const filesTouched = new Set<string>();
    for (const step of pair.resolutionSteps || []) {
      if (step.input && typeof step.input === 'object') {
        const inp = step.input as Record<string, any>;
        if (typeof inp.TargetFile === 'string') {
          filesTouched.add(inp.TargetFile);
        }
      }
    }

    if (filesTouched.size > 0) {
      lines.push(`Surgically hardened targets: ${Array.from(filesTouched).map(f => `\`${f}\``).join(', ')}.`);
    }

    lines.push(
      'Resolution Strategy & Surgical Steps:',
      '1. Diagnose root cause and boundary invariants.',
      '2. Apply minimal, verified modifications adhering to Dogma rules.',
      '3. Execute target test assertions to guarantee regression-free containment.'
    );

    return lines;
  }

  /**
   * Synthesizes RFC-2119 invariants rules for the remediation micro-skill.
   */
  private static synthesizeInvariantsRules(
    pair: RemediationPair,
    record: ExperienceRecord
  ): string[] {
    const rules: string[] = [];

    const textToFormulate = pair.finding || pair.errorSummary;
    if (textToFormulate) {
      const rule = ReflectiveInvariantSynthesizer.formulateRule(
        textToFormulate,
        pair.domain || 'security',
        pair.errorSummary
      );
      if (ReflectiveInvariantSynthesizer.isValidInvariant(rule)) {
        rules.push(rule);
      } else {
        rules.push(`The system MUST contain and prevent ${textToFormulate.toLowerCase().replace(/\.+$/, '')}.`);
      }
    }

    // Quorum-backed findings if present
    if (Array.isArray(record.quorumReviews)) {
      for (const qr of record.quorumReviews) {
        if (Array.isArray(qr.findings)) {
          for (const f of qr.findings) {
            if (f && typeof f === 'string' && /\b(MUST|MUST NOT)\b/i.test(f)) {
              rules.push(f.trim());
            }
          }
        }
      }
    }

    rules.push('The implementation MUST maintain backward compatibility and pass automated verification.');

    return Array.from(new Set(rules));
  }

  /**
   * Formulates the exact test command and assertion used to verify the fix.
   */
  private static extractVerificationRecipe(
    pair: RemediationPair,
    record: ExperienceRecord
  ): string[] {
    let testCmd: string | undefined;

    // Search resolutionSteps for test command
    for (const step of pair.resolutionSteps || []) {
      if (step.tool === 'run_command' && step.input && typeof step.input === 'object') {
        const inp = step.input as Record<string, any>;
        if (
          typeof inp.CommandLine === 'string' &&
          /(test|vitest|jest|pytest|cargo test|npm test)/i.test(inp.CommandLine)
        ) {
          testCmd = inp.CommandLine;
          break;
        }
      }
    }

    // Search record.steps after the failure step
    if (!testCmd && Array.isArray(record.steps)) {
      const afterFail = pair.failureStep
        ? record.steps.filter(s => s.stepIndex > pair.failureStep!.stepIndex)
        : record.steps;
      for (const step of afterFail) {
        if (step.tool === 'run_command' && step.input && typeof step.input === 'object') {
          const inp = step.input as Record<string, any>;
          if (
            typeof inp.CommandLine === 'string' &&
            /(test|vitest|jest|pytest|cargo test|npm test)/i.test(inp.CommandLine)
          ) {
            testCmd = inp.CommandLine;
            break;
          }
        }
      }
    }

    const cleanError = (pair.errorSummary || 'defect').slice(0, 100).replace(/\.+$/, '');

    if (testCmd) {
      return [
        `1. Execute verification command: \`${testCmd}\``,
        '2. Confirm all test assertions pass with exit code 0.',
        `3. Verify that failure "${cleanError}" is resolved and no longer reproducible.`,
      ];
    }

    return [
      '1. Run relevant automated test suites to confirm functionality.',
      '2. Confirm all test assertions pass with zero failures.',
      `3. Verify that defect "${cleanError}" is completely eliminated.`,
    ];
  }

  /**
   * Caps and condenses resolution steps to ensure invariant (max 15 steps).
   */
  private static capResolutionSteps(
    steps: ExecutionStep[],
    maxSteps: number = 15
  ): ExecutionStep[] {
    if (!Array.isArray(steps) || steps.length <= maxSteps) {
      return steps;
    }

    // 1. Filter consecutive identical views/reads
    const deduped: ExecutionStep[] = [];
    for (let i = 0; i < steps.length; i++) {
      const curr = steps[i];
      const prev = deduped[deduped.length - 1];
      if (prev && prev.tool === curr.tool && prev.tool === 'view_file') {
        const prevPath = (prev.input as any)?.AbsolutePath || (prev.input as any)?.TargetFile;
        const currPath = (curr.input as any)?.AbsolutePath || (curr.input as any)?.TargetFile;
        if (prevPath && currPath && prevPath === currPath) {
          continue;
        }
      }
      deduped.push(curr);
    }

    if (deduped.length <= maxSteps) {
      return deduped;
    }

    // 2. Keep the first (maxSteps - 1) steps and the final verification/test step
    const lastStep = deduped[deduped.length - 1];
    const capped = deduped.slice(0, maxSteps - 1);
    capped.push(lastStep);
    return capped;
  }

  /**
   * Condenses execution steps for general track distillation if steps > maxSteps (default 20).
   */
  public static condenseTrackSteps(
    steps: ExecutionStep[],
    maxSteps: number = 20
  ): ExecutionStep[] {
    if (!Array.isArray(steps) || steps.length <= maxSteps) {
      return steps;
    }

    // 1. Filter out consecutive repetitive query/inspection steps
    const filtered: ExecutionStep[] = [];
    for (let i = 0; i < steps.length; i++) {
      const curr = steps[i];
      const prev = filtered[filtered.length - 1];

      if (prev && prev.tool === curr.tool) {
        if (curr.tool === 'view_file') {
          const prevPath = (prev.input as any)?.AbsolutePath;
          const currPath = (curr.input as any)?.AbsolutePath;
          if (prevPath && currPath && prevPath === currPath) {
            continue;
          }
        }
        if (curr.tool === 'list_dir') {
          const prevDir = (prev.input as any)?.DirectoryPath;
          const currDir = (curr.input as any)?.DirectoryPath;
          if (prevDir && currDir && prevDir === currDir) {
            continue;
          }
        }
      }
      filtered.push(curr);
    }

    if (filtered.length <= maxSteps) {
      return filtered;
    }

    // 2. Identify priority steps: modifications, test commands, setup, and completion
    const isModificationOrTest = (step: ExecutionStep): boolean => {
      if (['write_to_file', 'replace_file_content', 'edit_file', 'create_file'].includes(step.tool)) {
        return true;
      }
      if (step.tool === 'run_command' && step.input && typeof step.input === 'object') {
        const cmd = (step.input as any).CommandLine;
        if (typeof cmd === 'string' && /(test|vitest|jest|build|compile|check)/i.test(cmd)) {
          return true;
        }
      }
      return false;
    };

    const firstStep = filtered[0];
    const lastStep = filtered[filtered.length - 1];

    const prioritySteps: ExecutionStep[] = [];
    const otherSteps: ExecutionStep[] = [];

    for (let i = 1; i < filtered.length - 1; i++) {
      const s = filtered[i];
      if (isModificationOrTest(s)) {
        prioritySteps.push(s);
      } else {
        otherSteps.push(s);
      }
    }

    const middleBudget = maxSteps - 2;
    let selectedMiddle: ExecutionStep[] = [];

    if (prioritySteps.length <= middleBudget) {
      const remainingSlots = middleBudget - prioritySteps.length;
      const sampledOther: ExecutionStep[] = [];
      if (remainingSlots > 0 && otherSteps.length > 0) {
        const interval = Math.max(1, Math.floor(otherSteps.length / remainingSlots));
        for (let i = 0; i < otherSteps.length && sampledOther.length < remainingSlots; i += interval) {
          sampledOther.push(otherSteps[i]);
        }
      }
      selectedMiddle = [...prioritySteps, ...sampledOther];
    } else {
      selectedMiddle = prioritySteps.slice(0, middleBudget);
    }

    const orderMap = new Map<ExecutionStep, number>();
    filtered.forEach((s, idx) => orderMap.set(s, idx));
    selectedMiddle.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));

    const result = [firstStep, ...selectedMiddle, lastStep];
    return result.slice(0, maxSteps);
  }

  /**
   * Helper to extract a short error snippet.
   */
  private static extractErrorSnippet(output: unknown): string {
    if (typeof output === 'string') {
      const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
      const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
      const errLine = lines.find(l => /\b(Error|Exception|FAIL|AssertionError)\b/i.test(l));
      if (errLine) return errLine.slice(0, 150);
      if (lines.length > 0) return lines[0].slice(0, 150);
    } else if (output && typeof output === 'object') {
      const outObj = output as Record<string, any>;
      if (typeof outObj.error === 'string') return outObj.error.slice(0, 150);
      if (outObj.error && typeof outObj.error.message === 'string') return outObj.error.message.slice(0, 150);
      if (typeof outObj.message === 'string') return outObj.message.slice(0, 150);
      if (typeof outObj.stderr === 'string') {
        const firstLine = outObj.stderr.split('\n')[0]?.trim();
        if (firstLine) return firstLine.slice(0, 150);
      }
    }
    return '';
  }

  /**
   * Computes confidence score for remediation micro-skills.
   */
  private static computeRemediationConfidenceScore(
    pair: RemediationPair,
    record: ExperienceRecord,
    options?: DistillationOptions
  ): number {
    let score = 0.88;

    if (pair.diffHunk || (record.metadata?.diffHunk as string)) {
      score += 0.04;
    }

    const hasTestStep = (pair.resolutionSteps || []).some(
      s =>
        s.tool === 'run_command' &&
        s.status === 'success' &&
        s.input &&
        typeof s.input === 'object' &&
        /(test|vitest|jest|pytest|npm test)/i.test((s.input as any).CommandLine || '')
    );
    if (hasTestStep) {
      score += 0.04;
    }

    const hasResolved = (record.quorumReviews || []).some(r => r.verdict === 'RESOLVED');
    if (hasResolved) {
      score += 0.04;
    }

    const clamped = Math.max(0.0, Math.min(0.98, score));
    return Math.round(clamped * 100) / 100;
  }

  private static formulateRemediationDescription(pair: RemediationPair, name: string): string {
    if (pair.finding) {
      const cleanFinding = pair.finding.trim().replace(/\.+$/, '');
      return `Micro-skill for ${name.replace(/-/g, ' ')} remediating: ${cleanFinding}.`;
    }
    if (pair.errorSummary) {
      const cleanSummary = pair.errorSummary.trim().replace(/\.+$/, '');
      return `Micro-skill for ${name.replace(/-/g, ' ')} resolving: ${cleanSummary}.`;
    }
    return `Contrastive remediation micro-skill for ${name.replace(/-/g, ' ')}.`;
  }

  private static formulateRemediationWhenToUse(pair: RemediationPair, name: string): string[] {
    const items: string[] = [
      `- Activate when addressing defects matching: ${name}.`,
    ];
    if (pair.finding) {
      items.push(`- Apply when reviewing or remediating: "${pair.finding.trim()}".`);
    } else if (pair.errorSummary) {
      items.push(`- Apply when encountering error: "${pair.errorSummary.slice(0, 80)}".`);
    }
    if (pair.domain) {
      items.push(`- Applies to domain: ${pair.domain}.`);
    }
    items.push('- Use in automated remediation workflows and pre-merge Dogma vetting.');
    return items;
  }
}
