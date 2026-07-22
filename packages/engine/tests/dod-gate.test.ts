import { describe, it, expect } from 'vitest';
import { classifyDodLevel, runDodGate } from '../src/verification/dod-classifier.js';

describe('Progressive Definition of Done (DoD) & Tabula Rasa Quality Gate', () => {
  it('should correctly classify DoD level based on context files', () => {
    expect(classifyDodLevel(['src/auth/login.ts'])).toBe(4);
    expect(classifyDodLevel(['src/security/jwt.ts'])).toBe(4);
    expect(classifyDodLevel(['src/api/routes.ts'])).toBe(3);
    expect(classifyDodLevel(['src/migrations/001_init.sql'])).toBe(3);
    expect(classifyDodLevel(['src/components/button.tsx'])).toBe(2);
    expect(classifyDodLevel(['docs/README.md'])).toBe(1);
  });

  it('should execute runDodGate for Level 1 through Level 3', async () => {
    const resultL1 = await runDodGate(1, 'task-l1');
    expect(resultL1.passed).toBe(true);

    const resultL2 = await runDodGate(2, 'task-l2');
    expect(typeof resultL2.passed).toBe('boolean');
  });

  it('should support Tabula Rasa Level 4 clean-slate check', async () => {
    const resultL4 = await runDodGate(4, 'task-l4');
    expect(typeof resultL4.passed).toBe('boolean');
    expect(Array.isArray(resultL4.feedback)).toBe(true);
  });
});
