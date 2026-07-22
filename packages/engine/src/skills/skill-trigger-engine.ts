import * as fs from 'fs';
import * as path from 'path';
import minimatchPkg from 'minimatch';
const minimatch = typeof minimatchPkg === 'function' ? minimatchPkg : (minimatchPkg as any).minimatch;
import { DagNode } from '../types/dag.types.js';

export interface SkillManifest {
  version: string;
  triggers: {
    keywords?: string[];
    fileGlobs?: string[];
    intentPatterns?: string[];
    executionEvents?: string[];
  };
  metadata: {
    name: string;
    marketplace: string;
    version: string;
  };
  skillDir?: string;
}

export interface SkillMatch {
  manifest: SkillManifest;
  matchedBy: 'keyword' | 'glob' | 'intent' | 'event';
}

export class SkillTriggerEngine {
  private manifests: SkillManifest[] = [];
  private scanned = false;
  private regexCache = new Map<string, RegExp[]>();

  constructor(private skillsDir?: string) {}

  public scan(): SkillManifest[] {
    if (this.scanned) return this.manifests;
    this.scanned = true;
    this.manifests = [];

    if (!this.skillsDir || !fs.existsSync(this.skillsDir)) {
      return this.manifests;
    }

    try {
      const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(this.skillsDir, entry.name, 'skill-rules.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const content = fs.readFileSync(manifestPath, 'utf8');
              const parsed: SkillManifest = JSON.parse(content);
              parsed.skillDir = path.join(this.skillsDir, entry.name);
              this.manifests.push(parsed);

              // Pre-compile intent regexes
              if (parsed.triggers?.intentPatterns) {
                const compiled = parsed.triggers.intentPatterns
                  .map(p => {
                    try { return new RegExp(p, 'i'); } catch { return null; }
                  })
                  .filter((r): r is RegExp => r !== null);
                this.regexCache.set(parsed.metadata.name, compiled);
              }
            } catch {
              console.warn(`[SkillTriggerEngine] Warning: Malformed manifest at ${manifestPath}`);
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[SkillTriggerEngine] Warning: Failed to scan skills directory: ${e}`);
    }

    return this.manifests;
  }

  public match(task: DagNode): SkillMatch[] {
    const manifests = this.scan();
    const matches: SkillMatch[] = [];

    for (const manifest of manifests) {
      const triggers = manifest.triggers;
      if (!triggers) continue;

      // 1. Execution Events (TrackInitialization if task has no dependencies)
      if (triggers.executionEvents?.includes('TrackInitialization') && (!task.dependsOn || task.dependsOn.length === 0)) {
        matches.push({ manifest, matchedBy: 'event' });
        continue;
      }

      // 2. File Globs
      if (triggers.fileGlobs && task.contextFiles && task.contextFiles.length > 0) {
        let matched = false;
        for (const glob of triggers.fileGlobs) {
          for (const file of task.contextFiles) {
            if (minimatch(file, glob)) {
              matches.push({ manifest, matchedBy: 'glob' });
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
        if (matched) continue;
      }

      // 3. Keywords
      if (triggers.keywords && task.prompt) {
        const promptLower = task.prompt.toLowerCase();
        let matched = false;
        for (const kw of triggers.keywords) {
          if (promptLower.includes(kw.toLowerCase())) {
            matches.push({ manifest, matchedBy: 'keyword' });
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }

      // 4. Intent Patterns
      if (task.prompt) {
        const regexes = this.regexCache.get(manifest.metadata.name) || [];
        let matched = false;
        for (const regex of regexes) {
          if (regex.test(task.prompt)) {
            matches.push({ manifest, matchedBy: 'intent' });
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }
    }

    return matches;
  }

  public buildSkillContext(matches: SkillMatch[], headLines = 100): string {
    if (!matches || matches.length === 0) return '';

    const parts: string[] = [];
    let totalChars = 0;
    const MAX_CHARS = 8000;

    for (const match of matches) {
      if (!match.manifest.skillDir) continue;
      const skillMdPath = path.join(match.manifest.skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      try {
        const content = fs.readFileSync(skillMdPath, 'utf8');
        const lines = content.split('\n').slice(0, headLines).join('\n');
        const header = `--- Skill: ${match.manifest.metadata.name} ---\n`;
        const section = header + lines + '\n';

        if (totalChars + section.length > MAX_CHARS) {
          const suffix = '\n... [truncated]';
          const remaining = MAX_CHARS - totalChars - header.length - suffix.length;
          if (remaining > 50) {
            parts.push(header + lines.substring(0, remaining) + suffix);
          }
          break;
        }

        parts.push(section);
        totalChars += section.length;
      } catch {
        // Skip unreadable SKILL.md
      }
    }

    return parts.join('\n');
  }
}
