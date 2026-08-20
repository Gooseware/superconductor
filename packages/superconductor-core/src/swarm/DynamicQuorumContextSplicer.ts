import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { LanguagePersona, LanguagePersonaResolver } from './LanguagePersonaResolver.js';

export type ReviewerRole =
  | 'security-reviewer'
  | 'correctness-reviewer'
  | 'adversarial-reviewer'
  | 'regression-reviewer';

export interface SpliceOptions {
  persona?: LanguagePersona | string;
  personas?: (LanguagePersona | string)[];
  role?: ReviewerRole | string;
  projectRoot?: string;
  skillsDir?: string;
  maxTokens?: number;
  changedFiles?: string[];
  basePrompt?: string;
  includeStaticAnalysis?: boolean;
  includeAntiPatterns?: boolean;
}

export interface QuorumSpliceOptions {
  projectRoot?: string;
  skillsDir?: string;
  personas?: (LanguagePersona | string)[];
  changedFiles?: string[];
  basePrompts?: Partial<Record<ReviewerRole, string>>;
  maxTokensPerPrompt?: number;
  includeStaticAnalysis?: boolean;
  includeAntiPatterns?: boolean;
}

export const DEFAULT_REVIEWER_BASE_PROMPTS: Record<ReviewerRole, string> = {
  'security-reviewer':
    '# Security Reviewer\nYou are the Security Reviewer. Inspect code for vulnerabilities, injection vectors, memory safety violations, authentication/authorization gaps, and sensitive data leaks.',
  'correctness-reviewer':
    '# Correctness Reviewer\nYou are the Correctness Reviewer. Inspect code for logical flaws, off-by-one errors, async race conditions, state mutation bugs, and specification compliance.',
  'adversarial-reviewer':
    '# Adversarial Reviewer\nYou are the Adversarial Reviewer. Probe edge cases, resource exhaustion, unexpected inputs, mock theatre, and hostile boundaries.',
  'regression-reviewer':
    '# Regression Reviewer\nYou are the Regression Reviewer. Audit backward compatibility, performance regressions, responsive layout breakpoints, and contract drift.'
};

interface ParsedPersonaSkill {
  name: string;
  description: string;
  staticAnalysis?: string;
  securityRubric?: string;
  correctnessRubric?: string;
  adversarialRubric?: string;
  regressionRubric?: string;
  antiPatterns?: string;
  rawContent: string;
}

export class DynamicQuorumContextSplicer {
  /**
   * Reads and parses a persona SKILL.md file into structured rubric sections.
   */
  private static parsePersonaSkill(filePath: string): ParsedPersonaSkill | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const rawContent = fs.readFileSync(filePath, 'utf8');

      // Strip YAML frontmatter
      const stripped = rawContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

      // Parse sections
      let staticAnalysis: string | undefined;
      let securityRubric: string | undefined;
      let correctnessRubric: string | undefined;
      let adversarialRubric: string | undefined;
      let regressionRubric: string | undefined;
      let antiPatterns: string | undefined;

      // 1. Static analysis
      const staticMatch = stripped.match(/## 1\.\s*Pre-Review Static Analysis Commands\r?\n([\s\S]*?)(?=\r?\n## 2|\r?\n## |$)/i);
      if (staticMatch) {
        staticAnalysis = staticMatch[1].trim();
      }

      // 2. Rubrics
      const secMatch = stripped.match(/### 2\.1\s*([^\r\n]+)\r?\n([\s\S]*?)(?=\r?\n### 2\.2|\r?\n## 3|\r?\n## 4|\r?\n## |$)/i);
      if (secMatch) {
        securityRubric = secMatch[2].trim();
      }

      const corrMatch = stripped.match(/### 2\.2\s*([^\r\n]+)\r?\n([\s\S]*?)(?=\r?\n### 2\.3|\r?\n## 3|\r?\n## 4|\r?\n## |$)/i);
      if (corrMatch) {
        correctnessRubric = corrMatch[2].trim();
      }

      const advMatch = stripped.match(/### 2\.3\s*([^\r\n]+)\r?\n([\s\S]*?)(?=\r?\n### 2\.4|\r?\n## 3|\r?\n## 4|\r?\n## |$)/i);
      if (advMatch) {
        adversarialRubric = advMatch[2].trim();
      }

      const regMatch = stripped.match(/### 2\.4\s*([^\r\n]+)\r?\n([\s\S]*?)(?=\r?\n## 3|\r?\n## 4|\r?\n## |$)/i);
      if (regMatch) {
        regressionRubric = regMatch[2].trim();
      }

      // 3. Anti-patterns
      const antiMatch = stripped.match(/## 3\.\s*Idiomatic Patterns vs\. Anti-Patterns\r?\n([\s\S]*?)(?=\r?\n## 4|\r?\n## |$)/i);
      if (antiMatch) {
        antiPatterns = antiMatch[1].trim();
      }

      return {
        name: path.basename(path.dirname(filePath)),
        description: '',
        staticAnalysis,
        securityRubric,
        correctnessRubric,
        adversarialRubric,
        regressionRubric,
        antiPatterns,
        rawContent
      };
    } catch {
      return null;
    }
  }

  /**
   * Finds the path to a persona skill file across candidate locations.
   */
  private static findPersonaSkillPath(persona: LanguagePersona | string, options: SpliceOptions): string | null {
    const canonical = LanguagePersonaResolver.canonicalize(persona);
    const folderName = canonical === 'generic' ? 'generic-reviewer' : `${canonical}-reviewer`;

    const candidates: string[] = [];

    if (options.skillsDir) {
      candidates.push(
        path.join(options.skillsDir, folderName, 'SKILL.md'),
        path.join(options.skillsDir, canonical, 'SKILL.md'),
        path.join(options.skillsDir, 'SKILL.md')
      );
    }

    if (options.projectRoot) {
      candidates.push(
        path.join(options.projectRoot, 'skills', 'personas', folderName, 'SKILL.md'),
        path.join(options.projectRoot, 'skills', 'personas', canonical, 'SKILL.md'),
        path.join(options.projectRoot, 'superconductor', 'skills', 'personas', folderName, 'SKILL.md')
      );
    }

    // Default repo / cwd locations
    const cwd = process.cwd();
    candidates.push(
      path.resolve(cwd, 'skills', 'personas', folderName, 'SKILL.md'),
      path.resolve(cwd, '..', '..', 'skills', 'personas', folderName, 'SKILL.md'),
      path.resolve(cwd, '..', '..', '..', 'skills', 'personas', folderName, 'SKILL.md')
    );

    try {
      if (typeof import.meta !== 'undefined' && import.meta.url) {
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        candidates.push(
          path.resolve(currentDir, '../../../../skills/personas', folderName, 'SKILL.md'),
          path.resolve(currentDir, '../../../skills/personas', folderName, 'SKILL.md')
        );
      }
    } catch {
      // ignore
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Splices domain-specific persona rubrics into a reviewer context prompt.
   */
  static spliceContext(options: SpliceOptions): string {
    // 1. Resolve personas list
    let personas: (LanguagePersona | string)[] = [];
    if (options.personas && options.personas.length > 0) {
      personas = options.personas;
    } else if (options.persona) {
      personas = [options.persona];
    } else if (options.changedFiles && options.changedFiles.length > 0) {
      personas = LanguagePersonaResolver.resolveFromDiff(options.changedFiles, options.projectRoot);
    } else if (options.projectRoot) {
      personas = LanguagePersonaResolver.resolveFromProject(options.projectRoot);
    } else {
      personas = ['generic'];
    }

    // Deduplicate personas
    const uniquePersonas = Array.from(
      new Set(personas.map(p => LanguagePersonaResolver.canonicalize(p)))
    );

    // 2. Extract rubrics for each persona
    const personaSections: string[] = [];

    for (const persona of uniquePersonas) {
      const folderName = persona === 'generic' ? 'generic-reviewer' : `${persona}-reviewer`;

      if (persona === 'generic') {
        personaSections.push(
          `### Stack-Specific Persona: generic-reviewer\n` +
            `#### General Invariants\n` +
            `- Verify type safety, boundary checking, and zero unhandled exceptions.\n` +
            `- Validate asynchronous control flow and error propagation.\n` +
            `- Maintain clean architectural separation and test coverage.`
        );
        continue;
      }

      const skillPath = this.findPersonaSkillPath(persona, options);
      if (!skillPath) {
        // Fallback for missing persona skill file
        personaSections.push(
          `### Stack-Specific Persona: ${folderName}\n` +
            `#### General Invariants\n` +
            `- Follow standard idioms and safety requirements for ${persona}.\n` +
            `- Ensure deterministic lifecycle, error propagation, and complete test verification.`
        );
        continue;
      }

      const parsed = this.parsePersonaSkill(skillPath);
      if (!parsed) {
        continue;
      }

      // Determine section based on role
      const role = (options.role || '').toLowerCase();
      let rubricTitle = '#### Domain Invariants';
      let rubricBody = '';

      if (role.includes('security')) {
        rubricTitle = '#### Security Rubric';
        rubricBody = parsed.securityRubric || '';
      } else if (role.includes('correctness')) {
        rubricTitle = '#### Correctness Rubric';
        rubricBody = parsed.correctnessRubric || '';
      } else if (role.includes('adversarial')) {
        rubricTitle = '#### Adversarial & Boundary Testing Rubric';
        rubricBody = parsed.adversarialRubric || '';
      } else if (role.includes('regression')) {
        rubricTitle = '#### Regression & Performance Rubric';
        rubricBody = parsed.regressionRubric || '';
      } else {
        // Full rubrics
        rubricTitle = '#### Universal Quorum Rubrics';
        rubricBody = [
          parsed.securityRubric && `##### Security\n${parsed.securityRubric}`,
          parsed.correctnessRubric && `##### Correctness\n${parsed.correctnessRubric}`,
          parsed.adversarialRubric && `##### Adversarial\n${parsed.adversarialRubric}`,
          parsed.regressionRubric && `##### Regression\n${parsed.regressionRubric}`
        ]
          .filter(Boolean)
          .join('\n\n');
      }

      let sectionContent = `### Stack-Specific Persona: ${folderName}\n${rubricTitle}\n${rubricBody}`;

      if (options.includeStaticAnalysis && parsed.staticAnalysis) {
        sectionContent += `\n\n#### Pre-Review Static Analysis Commands\n${parsed.staticAnalysis}`;
      }

      if (options.includeAntiPatterns && parsed.antiPatterns) {
        sectionContent += `\n\n#### Key Anti-Patterns\n${parsed.antiPatterns}`;
      }

      personaSections.push(sectionContent.trim());
    }

    let splicedContent = '';
    if (personaSections.length > 0) {
      splicedContent =
        `## Spliced Quorum Persona Guidelines\n\n` + personaSections.join('\n\n');
    }

    // Apply token budget if specified
    if (options.maxTokens && options.maxTokens > 0) {
      const maxChars = options.maxTokens * 4;
      if (splicedContent.length > maxChars) {
        const truncated = splicedContent.substring(0, maxChars);
        const lastNewline = truncated.lastIndexOf('\n');
        const cutPoint = lastNewline > maxChars * 0.7 ? lastNewline : maxChars;
        splicedContent =
          splicedContent.substring(0, cutPoint) + '\n\n[... truncated to fit token budget]';
      }
    }

    // Base prompt interpolation
    if (options.basePrompt) {
      if (options.basePrompt.includes('{{SPLICED_PERSONA_CONTEXT}}')) {
        return options.basePrompt.replace('{{SPLICED_PERSONA_CONTEXT}}', splicedContent);
      }
      if (splicedContent.trim().length > 0) {
        return `${options.basePrompt}\n\n---\n\n${splicedContent}`;
      }
      return options.basePrompt;
    }

    return splicedContent;
  }

  /**
   * Builds the complete set of 4 Quorum Reviewer prompt payloads with stack-specific rubrics.
   */
  static buildQuorumReviewerPrompts(
    options: QuorumSpliceOptions
  ): Record<ReviewerRole, string> {
    const roles: ReviewerRole[] = [
      'security-reviewer',
      'correctness-reviewer',
      'adversarial-reviewer',
      'regression-reviewer'
    ];

    // Determine personas upfront
    let personas: (LanguagePersona | string)[] = [];
    if (options.personas && options.personas.length > 0) {
      personas = options.personas;
    } else if (options.changedFiles && options.changedFiles.length > 0) {
      personas = LanguagePersonaResolver.resolveFromDiff(options.changedFiles, options.projectRoot);
    } else if (options.projectRoot) {
      personas = LanguagePersonaResolver.resolveFromProject(options.projectRoot);
    } else {
      personas = ['generic'];
    }

    const result: Partial<Record<ReviewerRole, string>> = {};

    for (const role of roles) {
      const basePrompt = options.basePrompts?.[role] || DEFAULT_REVIEWER_BASE_PROMPTS[role];
      result[role] = this.spliceContext({
        personas,
        role,
        projectRoot: options.projectRoot,
        skillsDir: options.skillsDir,
        maxTokens: options.maxTokensPerPrompt,
        basePrompt,
        includeStaticAnalysis: options.includeStaticAnalysis,
        includeAntiPatterns: options.includeAntiPatterns
      });
    }

    return result as Record<ReviewerRole, string>;
  }
}
