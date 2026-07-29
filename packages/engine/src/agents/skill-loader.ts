/**
 * skill-loader.ts
 *
 * Loads role-specific skill files from the bundled skills directory.
 * Skills are injected into reviewer agent prompts at spawn time so agents
 * have their operational guidelines baked in rather than needing to find them.
 */
import { readFileSync, accessSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Candidate directories for skill files, tried in order.
 * - dist/agents/skills  → production (tsc output + postbuild copy)
 * - src/agents/skills   → dev/test fallback when dist/ does not exist
 */
const SKILLS_DIR_CANDIDATES = [
  join(__dirname, 'skills'),                              // dist/agents/skills (production)
  join(__dirname, '..', '..', 'src', 'agents', 'skills'), // src/agents/skills (dev fallback)
];

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
 * Resolves the absolute path for a skill file by walking the candidate
 * directories and returning the first path that is readable.
 * Returns null if the file is not found in any candidate directory.
 */
function resolveSkillPath(fileName: string): string | null {
  for (const dir of SKILLS_DIR_CANDIDATES) {
    const fullPath = join(dir, fileName);
    try {
      accessSync(fullPath);
      return fullPath;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Loads the skill content for a given reviewer role.
 * Returns empty string if no skill is mapped or file can't be read.
 */
export function loadRoleSkill(role: string): string {
  const fileName = ROLE_SKILL_MAP[role];
  if (!fileName) return '';

  if (skillCache.has(fileName)) return skillCache.get(fileName)!;

  const filePath = resolveSkillPath(fileName);
  if (!filePath) return '';

  try {
    const content = readFileSync(filePath, 'utf8');
    // Strip the YAML frontmatter block (--- ... ---)
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, '').trim();
    skillCache.set(fileName, withoutFrontmatter);
    return withoutFrontmatter;
  } catch {
    return '';
  }
}

/**
 * Clears the in-memory skill cache.
 * Primarily used for test isolation so that cache state from one test does
 * not leak into subsequent tests.
 */
export function clearSkillCache(): void {
  skillCache.clear();
}

/** Returns all role-to-skill mappings for introspection/testing */
export function getRoleSkillMap(): Readonly<Record<string, string>> {
  return ROLE_SKILL_MAP;
}
