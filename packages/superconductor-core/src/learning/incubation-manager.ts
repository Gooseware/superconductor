/**
 * SkillIncubationManager
 *
 * Manages staging storage and quarantine lifecycle for newly distilled candidate skills.
 *
 * Invariant: Incubating skills MUST be written only to .agents/skills/incubating/
 * and excluded from active discovery.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import {
  DistilledSkill,
  IncubatingSkillInfo,
  IncubatingLearningMetadata,
  SkillIncubationOptions,
  VettingStatus,
} from './types.js';

export class SkillIncubationManager {
  public static readonly DEFAULT_RELATIVE_STAGING_DIR = path.join(
    '.agents',
    'skills',
    'incubating'
  );

  /**
   * Resolve the absolute path to the staging directory.
   */
  public static resolveStagingDir(options?: SkillIncubationOptions): string {
    if (options?.stagingDir) {
      return path.resolve(options.stagingDir);
    }
    const root =
      options?.projectRoot || process.env.SUPERCONDUCTOR_ROOT || process.cwd();
    return path.resolve(root, this.DEFAULT_RELATIVE_STAGING_DIR);
  }

  /**
   * Asserts that a skill name is non-empty and does not contain directory traversal characters.
   */
  private static assertSafeSkillName(skillName: string): void {
    if (!skillName || typeof skillName !== 'string' || !skillName.trim()) {
      throw new Error('Invalid skill name: skill name must be a non-empty string.');
    }
    if (
      skillName === '.' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(skillName) ||
      skillName.includes('..') ||
      skillName.includes('/') ||
      skillName.includes('\\')
    ) {
      throw new Error(
        `Security error: Skill name "${skillName}" contains prohibited path traversal characters.`
      );
    }
  }

  /**
   * Asserts that a target directory is strictly located inside the staging directory.
   */
  private static assertInsideStaging(targetPath: string, stagingDir: string): void {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedStaging = path.resolve(stagingDir);

    if (
      resolvedTarget === resolvedStaging ||
      !resolvedTarget.startsWith(resolvedStaging + path.sep)
    ) {
      throw new Error(
        `Security error: Target path "${targetPath}" is outside staging directory "${stagingDir}".`
      );
    }
  }

  /**
   * Parse a SKILL.md file content into YAML frontmatter and markdown body.
   */
  private static parseSkillMarkdown(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
    hasFrontmatter: boolean;
  } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
      return {
        frontmatter: {},
        body: content,
        hasFrontmatter: false,
      };
    }

    try {
      const rawYaml = match[1];
      const body = match[2];
      const parsed = yaml.load(rawYaml);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          frontmatter: parsed as Record<string, unknown>,
          body,
          hasFrontmatter: true,
        };
      }
      return {
        frontmatter: {},
        body,
        hasFrontmatter: false,
      };
    } catch {
      // Malformed YAML frontmatter: treat gracefully
      return {
        frontmatter: {},
        body: match[2] || content,
        hasFrontmatter: false,
      };
    }
  }

  /**
   * Serializes YAML frontmatter and markdown body into standard SKILL.md content.
   */
  private static serializeSkillMarkdown(
    frontmatter: Record<string, unknown>,
    body: string
  ): string {
    const yamlString = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true });
    const cleanBody = body ? body.replace(/^\r?\n+/, '') : '';
    return `---\n${yamlString}---\n\n${cleanBody}\n`;
  }

  /**
   * Stage a candidate distilled skill into the staging storage.
   *
   * Creates folder `.agents/skills/incubating/<skill.name>/`
   * Writes `SKILL.md`
   * Returns path to the created `SKILL.md` file.
   */
  public static async stageSkill(
    skill: DistilledSkill,
    options?: SkillIncubationOptions
  ): Promise<string> {
    this.assertSafeSkillName(skill.name);

    const stagingDir = this.resolveStagingDir(options);
    const skillDir = path.resolve(stagingDir, skill.name);
    this.assertInsideStaging(skillDir, stagingDir);

    await fs.mkdir(skillDir, { recursive: true });
    const filePath = path.join(skillDir, 'SKILL.md');

    let frontmatter: Record<string, unknown> = {};
    let bodyText = skill.body ?? skill.content ?? `# ${skill.name}\n\n${skill.description}\n`;

    if (skill.content && skill.content.startsWith('---')) {
      const parsed = this.parseSkillMarkdown(skill.content);
      frontmatter = { ...parsed.frontmatter };
      if (!skill.body) {
        bodyText = parsed.body;
      }
    }

    // Set or preserve primary frontmatter fields
    frontmatter.name = frontmatter.name ?? skill.name;
    frontmatter.description = frontmatter.description ?? skill.description;

    // Merge superconductor_learning incubation metadata
    const existingLearning =
      (frontmatter.superconductor_learning as Record<string, unknown>) || {};

    const effectiveSourceTrack =
      skill.sourceTrack ?? skill.sourceTrackId ?? existingLearning.source_track ?? 'unknown';

    const learningMetadata: Record<string, unknown> = {
      status: 'incubating',
      source_track: effectiveSourceTrack,
      harvest_timestamp:
        existingLearning.harvest_timestamp ?? new Date().toISOString(),
      confidence_score:
        skill.confidenceScore ?? existingLearning.confidence_score ?? 0.8,
      vetting_status:
        skill.learningMetadata?.vetting_status ??
        existingLearning.vetting_status ??
        'pending',
      ...(skill.learningMetadata || {}),
      ...existingLearning,
    };

    // Ensure skill-level overrides take precedence if explicitly provided
    if (skill.sourceTrack || skill.sourceTrackId) {
      learningMetadata.source_track = skill.sourceTrack ?? skill.sourceTrackId;
    }
    if (typeof skill.confidenceScore === 'number') {
      learningMetadata.confidence_score = skill.confidenceScore;
    }
    if (skill.learningMetadata?.vetting_status) {
      learningMetadata.vetting_status = skill.learningMetadata.vetting_status;
    }

    frontmatter.superconductor_learning = learningMetadata;

    if (skill.metadata) {
      Object.assign(frontmatter, skill.metadata);
    }

    const fileContent = this.serializeSkillMarkdown(frontmatter, bodyText);
    await fs.writeFile(filePath, fileContent, 'utf8');

    return filePath;
  }

  /**
   * List all incubating skills in the staging directory.
   */
  public static async listIncubating(
    options?: SkillIncubationOptions
  ): Promise<IncubatingSkillInfo[]> {
    const stagingDir = this.resolveStagingDir(options);

    let entries: import('fs').Dirent[];
    try {
      entries = (await fs.readdir(stagingDir, {
        withFileTypes: true,
      })) as import('fs').Dirent[];
    } catch {
      return [];
    }

    const skills: IncubatingSkillInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillDir = path.join(stagingDir, entry.name);
      const filePath = path.join(skillDir, 'SKILL.md');

      let rawContent: string;
      try {
        rawContent = await fs.readFile(filePath, 'utf8');
      } catch {
        // Missing SKILL.md in subfolder: skip gracefully
        continue;
      }

      const parsed = this.parseSkillMarkdown(rawContent);
      const frontmatter = parsed.frontmatter;
      const rawLearning =
        (frontmatter.superconductor_learning as Record<string, unknown>) || {};

      const name =
        typeof frontmatter.name === 'string' && frontmatter.name
          ? frontmatter.name
          : entry.name;
      const description =
        typeof frontmatter.description === 'string'
          ? frontmatter.description
          : '';

      const vettingStatus: VettingStatus = (
        rawLearning.vetting_status ||
        rawLearning.vettingStatus ||
        'pending'
      ) as VettingStatus;

      const confidenceScore =
        typeof rawLearning.confidence_score === 'number'
          ? rawLearning.confidence_score
          : typeof rawLearning.confidenceScore === 'number'
          ? rawLearning.confidenceScore
          : undefined;

      const sourceTrack =
        typeof rawLearning.source_track === 'string'
          ? rawLearning.source_track
          : typeof rawLearning.sourceTrack === 'string'
          ? rawLearning.sourceTrack
          : undefined;

      const harvestTimestamp =
        typeof rawLearning.harvest_timestamp === 'string'
          ? rawLearning.harvest_timestamp
          : typeof rawLearning.harvestTimestamp === 'string'
          ? rawLearning.harvestTimestamp
          : undefined;

      const vettingReport =
        rawLearning.vetting_report ?? rawLearning.vettingReport;

      skills.push({
        name,
        description,
        path: filePath,
        filePath,
        skillDir,
        directoryPath: skillDir,
        content: rawContent,
        body: parsed.body,
        frontmatter,
        learningMetadata: rawLearning as IncubatingLearningMetadata,
        vettingStatus,
        confidenceScore,
        sourceTrack,
        harvestTimestamp,
        vettingReport,
      });
    }

    return skills;
  }

  /**
   * Retrieve an incubating skill by name.
   */
  public static async getIncubatingSkill(
    skillName: string,
    options?: SkillIncubationOptions
  ): Promise<IncubatingSkillInfo | null> {
    if (!skillName || typeof skillName !== 'string' || !skillName.trim()) {
      return null;
    }

    if (
      skillName === '.' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(skillName) ||
      skillName.includes('..') ||
      skillName.includes('/') ||
      skillName.includes('\\')
    ) {
      return null;
    }

    const stagingDir = this.resolveStagingDir(options);

    // 1. Direct check by directory name
    const directPath = path.join(stagingDir, skillName, 'SKILL.md');
    try {
      const rawContent = await fs.readFile(directPath, 'utf8');
      const skillDir = path.join(stagingDir, skillName);
      const parsed = this.parseSkillMarkdown(rawContent);
      const frontmatter = parsed.frontmatter;
      const rawLearning =
        (frontmatter.superconductor_learning as Record<string, unknown>) || {};

      const name =
        typeof frontmatter.name === 'string' && frontmatter.name
          ? frontmatter.name
          : skillName;
      const description =
        typeof frontmatter.description === 'string'
          ? frontmatter.description
          : '';

      const vettingStatus: VettingStatus = (
        rawLearning.vetting_status ||
        rawLearning.vettingStatus ||
        'pending'
      ) as VettingStatus;

      const confidenceScore =
        typeof rawLearning.confidence_score === 'number'
          ? rawLearning.confidence_score
          : typeof rawLearning.confidenceScore === 'number'
          ? rawLearning.confidenceScore
          : undefined;

      const sourceTrack =
        typeof rawLearning.source_track === 'string'
          ? rawLearning.source_track
          : typeof rawLearning.sourceTrack === 'string'
          ? rawLearning.sourceTrack
          : undefined;

      const harvestTimestamp =
        typeof rawLearning.harvest_timestamp === 'string'
          ? rawLearning.harvest_timestamp
          : typeof rawLearning.harvestTimestamp === 'string'
          ? rawLearning.harvestTimestamp
          : undefined;

      const vettingReport =
        rawLearning.vetting_report ?? rawLearning.vettingReport;

      return {
        name,
        description,
        path: directPath,
        filePath: directPath,
        skillDir,
        directoryPath: skillDir,
        content: rawContent,
        body: parsed.body,
        frontmatter,
        learningMetadata: rawLearning as IncubatingLearningMetadata,
        vettingStatus,
        confidenceScore,
        sourceTrack,
        harvestTimestamp,
        vettingReport,
      };
    } catch {
      // Not found directly: search all incubating skills in case folder name differs
    }

    const all = await this.listIncubating(options);
    const found = all.find(
      (s) =>
        s.name.toLowerCase() === skillName.toLowerCase() ||
        path.basename(s.skillDir).toLowerCase() === skillName.toLowerCase()
    );

    return found || null;
  }

  /**
   * Discard an incubating skill by removing its directory.
   */
  public static async discardSkill(
    skillName: string,
    options?: SkillIncubationOptions
  ): Promise<boolean> {
    this.assertSafeSkillName(skillName);

    const stagingDir = this.resolveStagingDir(options);
    const existing = await this.getIncubatingSkill(skillName, options);

    let targetDir: string;
    if (existing) {
      targetDir = existing.skillDir;
    } else {
      targetDir = path.resolve(stagingDir, skillName);
    }

    this.assertInsideStaging(targetDir, stagingDir);

    try {
      const stat = await fs.stat(targetDir);
      if (!stat.isDirectory()) {
        return false;
      }
      await fs.rm(targetDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update the automated vetting status and optional vetting report of an incubating skill.
   */
  public static async updateVettingStatus(
    skillName: string,
    status: VettingStatus,
    report?: unknown,
    options?: SkillIncubationOptions
  ): Promise<boolean> {
    this.assertSafeSkillName(skillName);

    const existing = await this.getIncubatingSkill(skillName, options);
    if (!existing) {
      return false;
    }

    const filePath = existing.filePath;
    let rawContent: string;
    try {
      rawContent = await fs.readFile(filePath, 'utf8');
    } catch {
      return false;
    }

    const parsed = this.parseSkillMarkdown(rawContent);
    const frontmatter = { ...parsed.frontmatter };
    const learningBlock =
      (frontmatter.superconductor_learning as Record<string, unknown>) || {};

    learningBlock.vetting_status = status;
    if (report !== undefined) {
      learningBlock.vetting_report = report;
    }
    learningBlock.updated_at = new Date().toISOString();

    frontmatter.superconductor_learning = learningBlock;

    const updatedContent = this.serializeSkillMarkdown(frontmatter, parsed.body);
    await fs.writeFile(filePath, updatedContent, 'utf8');

    return true;
  }
}

export type {
  DistilledSkill,
  IncubatingSkillInfo,
  IncubatingLearningMetadata,
  SkillIncubationOptions,
  VettingStatus,
};
