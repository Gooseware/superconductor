import { expect, describe, it } from 'vitest';
import { LanguageAdapter } from '../../src/swarm/LanguageAdapter.js';
import { RemediatorPromptBuilder } from '../../src/swarm/RemediatorPromptBuilder.js';

describe('RemediatorPromptBuilder', () => {
  it('should build prompt for typescript correctness', () => {
    const profile = LanguageAdapter.getProfile('typescript');
    const prompt = RemediatorPromptBuilder.build(profile, 'correctness', 'Fix bug', '.');
    
    expect(prompt.TASK).toBe('Fix bug');
    expect(prompt.SCOPE).toBe('.');
    expect(prompt.ANTI_PATTERNS).toContain('any');
    expect(prompt.EVIDENCE_REQUIRED).toContain('npm test');
    expect(prompt.EXCLUDED).toContain('node_modules/');
  });

  it('should include test theatre anti-patterns for adversarial', () => {
    const profile = LanguageAdapter.getProfile('typescript');
    const prompt = RemediatorPromptBuilder.build(profile, 'adversarial', 'Fix test', '.');
    
    expect(prompt.ANTI_PATTERNS).toContain('echo "no tests yet"');
  });
});
