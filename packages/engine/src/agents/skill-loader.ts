/**
 * skill-loader.ts
 *
 * Loads role-specific skill files from the bundled skills directory.
 * Skills are injected into reviewer agent prompts at spawn time so agents
 * have their operational guidelines baked in rather than needing to find them.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, 'skills');

/** Maps reviewer role names to their bundled skill file */
const ROLE_SKILL_MAP: Readonly<Record<string, string>> = {
  'security-reviewer': 'security-and-hardening.md',
  'adversarial-reviewer': 'code-simplification.md',
  'regression-reviewer': 'test-driven-development.md',
  'correctness-reviewer': 'code-review-and-quality.md',
};

/** Cache to avoid re-reading files on every prompt build */
const skillCache = new Map<string, string>();

/**
 * Loads the skill content for a given reviewer role.
 * Returns empty string if no skill is mapped or file can't be read.
 */
export function loadRoleSkill(role: string): string {
  const fileName = ROLE_SKILL_MAP[role];
  if (!fileName) return '';

  if (skillCache.has(fileName)) return skillCache.get(fileName)!;

  try {
    const content = readFileSync(join(SKILLS_DIR, fileName), 'utf8');
    // Strip the YAML frontmatter block (--- ... ---)
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, '').trim();
    skillCache.set(fileName, withoutFrontmatter);
    return withoutFrontmatter;
  } catch {
    return '';
  }
}

/** Returns all role-to-skill mappings for introspection/testing */
export function getRoleSkillMap(): Readonly<Record<string, string>> {
  return ROLE_SKILL_MAP;
}
