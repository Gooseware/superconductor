/**
 * SkillPromoter
 *
 * Promotes vetted incubating candidate skills from staging (.agents/skills/incubating/)
 * into active skill execution libraries (project-local or global).
 *
 * Invariant: Promoter MUST refuse promotion if vetting gate status is not PASSED.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { SkillIncubationManager } from './incubation-manager.js';
import { SkillDogmaValidator } from './dogma-validator.js';
import { CanaryHarness } from './canary-harness.js';
import { NoteWriter } from '../notebook/note-writer.js';
import {
  PromotionOptions,
  PromotionResult,
  VettingStatus,
} from './types.js';

export type { PromotionOptions, PromotionResult };

export class SkillPromoter {
  public static readonly DEFAULT_PROJECT_SKILLS_DIR = path.join('.agents', 'skills');
  public static readonly DEFAULT_GLOBAL_SKILLS_DIR = path.join(
    os.homedir(),
    '.agents',
    'extensions',
    'superconductor',
    'skills'
  );

  /**
   * Resolves the target destination directory for the promoted skill.
   */
  public static resolveTargetDir(
    skillName: string,
    options?: PromotionOptions
  ): string {
    const scope = options?.scope || 'project';
    if (scope === 'global') {
      const base =
        options?.globalSkillsDir || options?.globalDir || this.DEFAULT_GLOBAL_SKILLS_DIR;
      return path.resolve(base, skillName);
    }
    const projectRoot =
      options?.projectRoot || process.env.SUPERCONDUCTOR_ROOT || process.cwd();
    return path.resolve(projectRoot, this.DEFAULT_PROJECT_SKILLS_DIR, skillName);
  }

  /**
   * Promotes an incubating candidate skill to active status.
   *
   * Invariant: Promoter MUST refuse promotion if vetting gate status is not PASSED.
   */
  public static async promoteSkill(
    skillName: string,
    options?: PromotionOptions
  ): Promise<PromotionResult> {
    const scope: 'project' | 'global' = options?.scope || 'project';

    // 1. Guard against empty name or path traversal
    if (!skillName || typeof skillName !== 'string' || !skillName.trim()) {
      const errMsg = 'Invalid skill name: skill name must be a non-empty string.';
      return {
        success: false,
        skillName: skillName || '',
        destinationPath: '',
        targetPath: '',
        scope,
        reason: errMsg,
        error: errMsg,
      };
    }

    if (
      skillName.includes('..') ||
      skillName.includes('/') ||
      skillName.includes('\\')
    ) {
      const errMsg = `Security error: Skill name "${skillName}" contains prohibited path traversal characters.`;
      return {
        success: false,
        skillName,
        destinationPath: '',
        targetPath: '',
        scope,
        reason: errMsg,
        error: errMsg,
      };
    }

    if (scope !== 'project' && scope !== 'global') {
      const errMsg = `Invalid promotion scope: "${scope}". Must be "project" or "global".`;
      return {
        success: false,
        skillName,
        destinationPath: '',
        targetPath: '',
        scope,
        reason: errMsg,
        error: errMsg,
      };
    }

    // 2. Retrieve candidate skill from incubation staging
    const candidate = await SkillIncubationManager.getIncubatingSkill(skillName, {
      projectRoot: options?.projectRoot,
      stagingDir: options?.stagingDir,
    });

    if (!candidate) {
      const errMsg = `Skill "${skillName}" not found in incubation staging.`;
      return {
        success: false,
        skillName,
        destinationPath: '',
        targetPath: '',
        scope,
        reason: errMsg,
        error: errMsg,
      };
    }

    // 3. Automated Vetting Gate evaluation if status is pending
    let vettingStatus: VettingStatus = candidate.vettingStatus || 'pending';

    if (vettingStatus === 'pending') {
      const dogmaReport = SkillDogmaValidator.validate(
        candidate.content,
        options?.dogmaOptions
      );
      const canaryReport = await CanaryHarness.evaluateSkill(
        candidate,
        options?.canaryOptions
      );

      if (!dogmaReport.valid || dogmaReport.status === 'rejected' || !canaryReport.passed) {
        vettingStatus = 'rejected';
      } else if (
        dogmaReport.status === 'flagged' ||
        (canaryReport.warnings && canaryReport.warnings.length > 0)
      ) {
        vettingStatus = 'flagged';
      } else {
        vettingStatus = 'passed';
      }

      await SkillIncubationManager.updateVettingStatus(
        skillName,
        vettingStatus,
        { dogma: dogmaReport, canary: canaryReport },
        {
          projectRoot: options?.projectRoot,
          stagingDir: options?.stagingDir,
        }
      );
    }

    // 4. INVARIANT GATE: Promoter MUST refuse promotion if vetting gate status is rejected
    if (vettingStatus === 'rejected') {
      const reason = 'Vetting gate status is rejected. Cannot promote rejected skill even with force.';
      return {
        success: false,
        skillName,
        destinationPath: '',
        targetPath: '',
        scope,
        reason,
        error: `Cannot promote skill "${skillName}": vetting status is "rejected". Invariant requires status "passed".`,
      };
    }

    const isPassed =
      vettingStatus === 'passed' ||
      (vettingStatus === 'flagged' && Boolean(options?.allowWarnings));

    if (!isPassed && !options?.force) {
      const reason = `Vetting gate status is ${vettingStatus}`;
      const error = `Cannot promote skill "${skillName}": vetting status is "${vettingStatus}". Invariant requires status "passed".`;
      return {
        success: false,
        skillName,
        destinationPath: '',
        targetPath: '',
        scope,
        reason,
        error,
      };
    }

    // 5. Resolve destination directory
    const targetDir = this.resolveTargetDir(skillName, options);
    const destinationPath = path.join(targetDir, 'SKILL.md');

    try {
      await fs.mkdir(targetDir, { recursive: true });

      // 6. Parse frontmatter & update metadata
      let frontmatter: Record<string, unknown> = {};
      let body = candidate.content;

      const match = candidate.content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (match) {
        try {
          const parsed = yaml.load(match[1]);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            frontmatter = parsed as Record<string, unknown>;
            body = match[2];
          }
        } catch {
          frontmatter = { ...candidate.frontmatter };
          body = candidate.body || candidate.content;
        }
      } else {
        frontmatter = { ...candidate.frontmatter };
        body = candidate.body || candidate.content;
      }

      frontmatter.name = frontmatter.name || candidate.name || skillName;
      frontmatter.description = frontmatter.description || candidate.description || '';

      const existingLearning =
        (frontmatter.superconductor_learning as Record<string, unknown>) || {};
      const promotedAt = new Date().toISOString();

      frontmatter.superconductor_learning = {
        ...existingLearning,
        status: 'active',
        promoted_at: promotedAt,
        promotion_scope: scope,
      };

      const updatedYaml = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true });
      const cleanBody = body ? body.replace(/^\r?\n+/, '') : '';
      const updatedContent = `---\n${updatedYaml}---\n\n${cleanBody}\n`;

      // 7. Copy companion resources and write updated SKILL.md
      try {
        const entries = await fs.readdir(candidate.skillDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name !== 'SKILL.md') {
            const srcPath = path.join(candidate.skillDir, entry.name);
            const dstPath = path.join(targetDir, entry.name);
            if (entry.isDirectory()) {
              await fs.cp(srcPath, dstPath, { recursive: true });
            } else {
              await fs.copyFile(srcPath, dstPath);
            }
          }
        }
      } catch {
        // Ignore missing or unreadable companion entries
      }

      await fs.writeFile(destinationPath, updatedContent, 'utf8');

      // 8. Remove candidate from incubation staging
      await SkillIncubationManager.discardSkill(skillName, {
        projectRoot: options?.projectRoot,
        stagingDir: options?.stagingDir,
      });

      // 9. Record procedure note via NoteWriter
      const sourceTrackId =
        options?.trackId ||
        candidate.sourceTrack ||
        (candidate.learningMetadata?.source_track as string) ||
        (candidate.learningMetadata?.sourceTrack as string) ||
        (frontmatter.superconductor_learning as Record<string, unknown>)?.source_track as string ||
        'unknown';

      try {
        await NoteWriter.writeProcedureNote(
          `[LEARN] Promoted skill ${skillName} to ${scope} scope from source track ${sourceTrackId}`,
          {
            track_id: sourceTrackId,
            domain: 'learning',
          }
        );
      } catch {
        // Non-critical logging fallback
      }

      return {
        success: true,
        destinationPath,
        targetPath: destinationPath,
        scope,
        skillName,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        reason: `Failed to promote skill "${skillName}": ${message}`,
        error: `Failed to promote skill "${skillName}": ${message}`,
        destinationPath: '',
        targetPath: '',
        scope,
        skillName,
      };
    }
  }
}
