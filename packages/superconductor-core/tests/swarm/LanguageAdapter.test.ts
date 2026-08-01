import { expect, describe, it } from 'vitest';
import { LanguageAdapter } from '../../src/swarm/LanguageAdapter.js';

describe('LanguageAdapter', () => {
  it('should detect typescript from tech stack', () => {
    const profile = LanguageAdapter.getProfile('typescript');
    expect(profile.language).toBe('typescript');
    expect(profile.testCommand).toBe('npm test');
  });

  it('should return unknown for unknown language', () => {
    const profile = LanguageAdapter.getProfile('unknown');
    expect(profile.language).toBe('unknown');
  });
});
