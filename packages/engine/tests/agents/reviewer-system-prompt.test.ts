import { describe, it, expect } from 'vitest';
import {
  SHENANIGAN_CHECKLIST,
  buildReviewerSystemPrompt,
  REVIEWER_FULL_SYSTEM_PROMPT,
} from '../../src/agents/reviewer-system-prompt.js';

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
