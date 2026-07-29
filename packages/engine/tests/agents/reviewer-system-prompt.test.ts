import { describe, it, expect } from 'vitest';
import {
  SHENANIGAN_CHECKLIST,
  buildReviewerSystemPrompt,
  REVIEWER_FULL_SYSTEM_PROMPT,
  REVIEWER_ROLES,
} from '../../src/agents/reviewer-system-prompt.js';
import { loadRoleSkill, getRoleSkillMap } from '../../src/agents/skill-loader.js';

describe('SHENANIGAN_CHECKLIST', () => {
  it('has exactly 8 items', () => {
    expect(SHENANIGAN_CHECKLIST).toHaveLength(8);
  });

  it('contains the canonical 8 shenanigan names', () => {
    const names = [
      'Phantom Implementation',
      'Test Theatre',
      'Scope Creep',
      'Confidence Washing',
      'Semantic Drift',
      'Coverage Map Gaming',
      'Silent Degradation',
      'Dependency Laundering',
    ];
    for (const name of names) {
      expect(SHENANIGAN_CHECKLIST.some((item) => item.includes(name))).toBe(true);
    }
  });
});

describe('buildReviewerSystemPrompt', () => {
  it('includes the base prompt in output', () => {
    const basePrompt = 'You are a strict code reviewer.';
    expect(buildReviewerSystemPrompt(basePrompt)).toContain(basePrompt);
  });

  it('includes the SHENANIGAN CHECKLIST section header', () => {
    expect(buildReviewerSystemPrompt('any base')).toContain('SHENANIGAN CHECKLIST');
  });

  it('includes the MANDATORY INSPECTION label', () => {
    expect(buildReviewerSystemPrompt('any base')).toContain('MANDATORY INSPECTION');
  });

  it('includes ALL 8 checklist items in output', () => {
    const output = buildReviewerSystemPrompt('any base');
    for (const item of SHENANIGAN_CHECKLIST) {
      expect(output).toContain(item);
    }
  });

  it('includes "Failure to check all 8 items is itself a Critical finding"', () => {
    expect(buildReviewerSystemPrompt('any base')).toContain(
      'Failure to check all 8 items is itself a Critical finding'
    );
  });

  it('numbers all 8 items (1. through 8.)', () => {
    const output = buildReviewerSystemPrompt('any base');
    for (let i = 1; i <= 8; i++) {
      expect(output).toContain(`${i}.`);
    }
  });

  it('without role — no ROLE SKILL section', () => {
    const output = buildReviewerSystemPrompt('base prompt');
    expect(output).not.toContain('ROLE SKILL');
  });

  it('with security-reviewer role — includes ROLE SKILL section', () => {
    const output = buildReviewerSystemPrompt('base prompt', 'security-reviewer');
    expect(output).toContain('ROLE SKILL — ACTIVE GUIDELINES');
  });

  it('with security-reviewer role — includes OWASP or STRIDE content', () => {
    const output = buildReviewerSystemPrompt('base prompt', 'security-reviewer');
    const hasOwasp = output.includes('OWASP') || output.includes('STRIDE');
    expect(hasOwasp).toBe(true);
  });

  it('with adversarial-reviewer role — includes ROLE SKILL section', () => {
    const output = buildReviewerSystemPrompt('base prompt', 'adversarial-reviewer');
    expect(output).toContain('ROLE SKILL — ACTIVE GUIDELINES');
  });

  it('with correctness-reviewer role — includes ROLE SKILL section', () => {
    const output = buildReviewerSystemPrompt('base prompt', 'correctness-reviewer');
    expect(output).toContain('ROLE SKILL — ACTIVE GUIDELINES');
  });

  it('with regression-reviewer role — includes ROLE SKILL section', () => {
    const output = buildReviewerSystemPrompt('base prompt', 'regression-reviewer');
    expect(output).toContain('ROLE SKILL — ACTIVE GUIDELINES');
  });
});

describe('REVIEWER_FULL_SYSTEM_PROMPT', () => {
  it('contains all 8 checklist items (was built with the checklist)', () => {
    for (const item of SHENANIGAN_CHECKLIST) {
      expect(REVIEWER_FULL_SYSTEM_PROMPT).toContain(item);
    }
  });

  it('contains the SHENANIGAN CHECKLIST section header', () => {
    expect(REVIEWER_FULL_SYSTEM_PROMPT).toContain('SHENANIGAN CHECKLIST');
  });

  it('contains the failure-to-check warning', () => {
    expect(REVIEWER_FULL_SYSTEM_PROMPT).toContain(
      'Failure to check all 8 items is itself a Critical finding'
    );
  });
});

describe('REVIEWER_ROLES', () => {
  it('defines all four reviewer roles', () => {
    const roles = ['security-reviewer', 'correctness-reviewer', 'adversarial-reviewer', 'regression-reviewer'];
    for (const role of roles) {
      expect(REVIEWER_ROLES[role]).toBeTruthy();
    }
  });
});

describe('loadRoleSkill', () => {
  it('returns non-empty string for security-reviewer', () => {
    const content = loadRoleSkill('security-reviewer');
    expect(content.length).toBeGreaterThan(0);
  });

  it('returns non-empty string for adversarial-reviewer', () => {
    const content = loadRoleSkill('adversarial-reviewer');
    expect(content.length).toBeGreaterThan(0);
  });

  it('returns non-empty string for regression-reviewer', () => {
    const content = loadRoleSkill('regression-reviewer');
    expect(content.length).toBeGreaterThan(0);
  });

  it('returns non-empty string for correctness-reviewer', () => {
    const content = loadRoleSkill('correctness-reviewer');
    expect(content.length).toBeGreaterThan(0);
  });

  it('returns empty string for unknown-role', () => {
    expect(loadRoleSkill('unknown-role')).toBe('');
  });

  it('strips YAML frontmatter from loaded skill content', () => {
    const content = loadRoleSkill('security-reviewer');
    // After stripping, should not start with ---
    expect(content.startsWith('---')).toBe(false);
  });
});

describe('getRoleSkillMap', () => {
  it('returns the role-to-filename mapping with all 4 roles', () => {
    const map = getRoleSkillMap();
    expect(map['security-reviewer']).toBe('security-and-hardening.md');
    expect(map['adversarial-reviewer']).toBe('code-simplification.md');
    expect(map['regression-reviewer']).toBe('test-driven-development.md');
    expect(map['correctness-reviewer']).toBe('code-review-and-quality.md');
  });
});
