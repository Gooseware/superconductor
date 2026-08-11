import { describe, it, expect } from 'vitest';
import { QuorumValidator, QuorumInsufficientError, OracleGateError } from './quorum-validator.js';

describe('QuorumValidator', () => {
  const validator = new QuorumValidator();

  describe('validate', () => {
    it('throws QuorumInsufficientError with all 4 missing when panel is empty', () => {
      expect(() => validator.validate([])).toThrow(QuorumInsufficientError);
      try {
        validator.validate([]);
      } catch (err) {
        expect(err).toBeInstanceOf(QuorumInsufficientError);
        const error = err as QuorumInsufficientError;
        expect(error.missingRoles).toEqual([
          'security-reviewer',
          'correctness-reviewer',
          'adversarial-reviewer',
          'regression-reviewer'
        ]);
        expect(error.message).toBe(
          'Quorum incomplete. Missing: security-reviewer, correctness-reviewer, adversarial-reviewer, regression-reviewer'
        );
      }
    });

    it('throws QuorumInsufficientError listing missing role when panel is partial', () => {
      const panel = ['security-reviewer', 'correctness-reviewer', 'adversarial-reviewer'];
      expect(() => validator.validate(panel)).toThrow(QuorumInsufficientError);
      try {
        validator.validate(panel);
      } catch (err) {
        expect(err).toBeInstanceOf(QuorumInsufficientError);
        const error = err as QuorumInsufficientError;
        expect(error.missingRoles).toEqual(['regression-reviewer']);
        expect(error.message).toBe('Quorum incomplete. Missing: regression-reviewer');
      }
    });

    it('returns { valid: true, panelComplete: true } when all 4 required roles are present', () => {
      const panel = [
        'security-reviewer',
        'correctness-reviewer',
        'adversarial-reviewer',
        'regression-reviewer'
      ];
      const result = validator.validate(panel);
      expect(result).toEqual({ valid: true, panelComplete: true });
    });

    it('passes when all 4 required roles are present along with extra roles', () => {
      const panel = [
        'security-reviewer',
        'correctness-reviewer',
        'adversarial-reviewer',
        'regression-reviewer',
        'performance-reviewer',
        'ux-reviewer'
      ];
      const result = validator.validate(panel);
      expect(result).toEqual({ valid: true, panelComplete: true });
    });
  });

  describe('gateOracle', () => {
    it('throws OracleGateError when quorumPassed is false', () => {
      expect(() => validator.gateOracle({ quorumPassed: false })).toThrow(OracleGateError);
      try {
        validator.gateOracle({ quorumPassed: false });
      } catch (err) {
        expect(err).toBeInstanceOf(OracleGateError);
        const error = err as OracleGateError;
        expect(error.message).toBe('Oracle gate blocked: quorum has not passed');
      }
    });

    it('returns true when quorumPassed is true', () => {
      const result = validator.gateOracle({ quorumPassed: true });
      expect(result).toBe(true);
    });
  });

  describe('gateOracle (static)', () => {
    it('returns true when quorumPassed is true', () => {
      expect(QuorumValidator.gateOracle({ quorumPassed: true })).toBe(true);
    });
    it('throws OracleGateError when quorumPassed is false', () => {
      expect(() => QuorumValidator.gateOracle({ quorumPassed: false })).toThrow(OracleGateError);
    });
  });
});
