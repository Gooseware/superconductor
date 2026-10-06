import { describe, it, expect } from 'vitest';
import {
  INVARIANT_REMEDIATION_DOGMA,
  DOMAIN_INCEPTION_HINTS,
  getDomainInceptionHint,
  buildRemediationSystemPrompt,
} from './invariant-remediation-dogma.js';

describe('Invariant Remediation Dogma', () => {
  it('defines INVARIANT_REMEDIATION_DOGMA with all 5 mandatory invariants', () => {
    // 1. Inception Mandate
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('INCEPTION MANDATE');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('?? 0');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('|| []');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('empty catch {}');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('inception point');

    // 2. Atomic Dual-Write / SSOT
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('ATOMIC DUAL-WRITE');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('SINGLE SOURCE OF TRUTH');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('fatal defect');

    // 3. Execution Fidelity
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('EXECUTION FIDELITY');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('SQLite CHECK constraints');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('foreign keys');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('ctx.waitUntil');

    // 4. Strict Sequence Monotonicity
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('STRICT SEQUENCE MONOTONICITY');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('headSeq > current.lastSeq');

    // 5. Zero Test Weakening
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('ZERO TEST WEAKENING');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('writeFileSync');
    expect(INVARIANT_REMEDIATION_DOGMA).toContain('algorithmic operation counters');
  });

  it('buildRemediationSystemPrompt combines base prompt with dogma', () => {
    const base = 'You are a remediator subagent.';
    const result = buildRemediationSystemPrompt(base);

    expect(result).toContain(base);
    expect(result).toContain(INVARIANT_REMEDIATION_DOGMA);
  });

  it('buildRemediationSystemPrompt handles empty base prompt cleanly', () => {
    const result = buildRemediationSystemPrompt('');
    expect(result).toContain(INVARIANT_REMEDIATION_DOGMA);
    expect(result.startsWith('## INVARIANT-FIRST REMEDIATION PROTOCOL')).toBe(true);
  });

  it('buildRemediationSystemPrompt injects domain inception hints', () => {
    const resultData = buildRemediationSystemPrompt('Base prompt', 'data');
    expect(resultData).toContain('Domain Inception Guidance (data)');
    expect(resultData).toContain('database transactions');

    const resultLogic = buildRemediationSystemPrompt('Base prompt', 'logic-remediator');
    expect(resultLogic).toContain('Domain Inception Guidance (logic-remediator)');
    expect(resultLogic).toContain('lifecycle initializers');
  });

  it('buildRemediationSystemPrompt injects options with hints and findings', () => {
    const result = buildRemediationSystemPrompt('Base prompt', {
      domain: 'schema-remediator',
      hints: ['Remember SQLite WAL mode'],
      findings: [
        { file: 'src/db.ts', description: 'Missing check constraint', severity: 'HIGH', ruleId: 'SQL-01' },
      ],
    });

    expect(result).toContain('Domain Inception Guidance (schema-remediator)');
    expect(result).toContain('Remember SQLite WAL mode');
    expect(result).toContain('Missing check constraint');
    expect(result).toContain('SQL-01');
  });

  it('getDomainInceptionHint resolves correctly for domains and normalizations', () => {
    expect(getDomainInceptionHint('data')).toBeDefined();
    expect(getDomainInceptionHint('DATA')).toBeDefined();
    expect(getDomainInceptionHint('logic')).toBeDefined();
    expect(getDomainInceptionHint('logic-remediator')).toBeDefined();
    expect(getDomainInceptionHint('security-remediator')).toBeDefined();
    expect(getDomainInceptionHint('unknown-xyz')).toBeUndefined();
    expect(getDomainInceptionHint(undefined)).toBeUndefined();
  });
});
