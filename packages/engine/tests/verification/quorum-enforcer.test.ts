import { describe, it, expect } from 'vitest';
import { QuorumEnforcer, QuorumViolationError, REQUIRED_QUORUM_AGENTS } from '../../src/verification/quorum-enforcer';

describe('QuorumEnforcer', () => {
    describe('REQUIRED_QUORUM_AGENTS constant', () => {
        it('should define exactly the 4 required agent types', () => {
            expect(REQUIRED_QUORUM_AGENTS).toHaveLength(4);
            expect(REQUIRED_QUORUM_AGENTS).toContain('security-reviewer');
            expect(REQUIRED_QUORUM_AGENTS).toContain('correctness-reviewer');
            expect(REQUIRED_QUORUM_AGENTS).toContain('adversarial-reviewer');
            expect(REQUIRED_QUORUM_AGENTS).toContain('regression-reviewer');
        });
    });

    describe('validate()', () => {
        it('should pass when exactly 4 distinct required agent types are registered', () => {
            const enforcer = new QuorumEnforcer();
            expect(() =>
                enforcer.validate([
                    'security-reviewer',
                    'correctness-reviewer',
                    'adversarial-reviewer',
                    'regression-reviewer',
                ])
            ).not.toThrow();
        });

        it('should throw QuorumViolationError when only 3 agent types are present (missing one)', () => {
            const enforcer = new QuorumEnforcer();
            expect(() =>
                enforcer.validate([
                    'security-reviewer',
                    'correctness-reviewer',
                    'adversarial-reviewer',
                    // regression-reviewer missing
                ])
            ).toThrow(QuorumViolationError);
        });

        it('should throw QuorumViolationError with a message listing missing agents', () => {
            const enforcer = new QuorumEnforcer();
            try {
                enforcer.validate([
                    'security-reviewer',
                    'correctness-reviewer',
                    'adversarial-reviewer',
                ]);
                expect.fail('Expected QuorumViolationError to be thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(QuorumViolationError);
                expect((err as QuorumViolationError).message).toContain('regression-reviewer');
                expect((err as QuorumViolationError).missingAgents).toContain('regression-reviewer');
            }
        });

        it('should throw QuorumViolationError when duplicate agent types are present (e.g. 2x security-reviewer)', () => {
            const enforcer = new QuorumEnforcer();
            // Two security-reviewers + correctness + adversarial = 4 items but only 3 distinct types
            expect(() =>
                enforcer.validate([
                    'security-reviewer',
                    'security-reviewer',
                    'correctness-reviewer',
                    'adversarial-reviewer',
                ])
            ).toThrow(QuorumViolationError);
        });

        it('should throw QuorumViolationError when duplicate types make up a set of 4 but with only 3 unique required types', () => {
            const enforcer = new QuorumEnforcer();
            // Superficially 4 items but regression-reviewer is missing — duplicated adversarial-reviewer
            expect(() =>
                enforcer.validate([
                    'security-reviewer',
                    'correctness-reviewer',
                    'adversarial-reviewer',
                    'adversarial-reviewer',
                ])
            ).toThrow(QuorumViolationError);
        });

        it('should throw QuorumViolationError with missing agents listed in the error', () => {
            const enforcer = new QuorumEnforcer();
            let caught: QuorumViolationError | null = null;
            try {
                enforcer.validate(['security-reviewer']);
            } catch (err) {
                caught = err as QuorumViolationError;
            }
            expect(caught).toBeInstanceOf(QuorumViolationError);
            expect(caught!.missingAgents).toContain('correctness-reviewer');
            expect(caught!.missingAgents).toContain('adversarial-reviewer');
            expect(caught!.missingAgents).toContain('regression-reviewer');
        });

        it('should throw QuorumViolationError for an empty agent list', () => {
            const enforcer = new QuorumEnforcer();
            expect(() => enforcer.validate([])).toThrow(QuorumViolationError);
        });

        it('should throw QuorumViolationError when unknown agent types are mixed in but required ones are missing', () => {
            const enforcer = new QuorumEnforcer();
            // even with extra unknown agents, all 4 required must be present
            expect(() =>
                enforcer.validate([
                    'security-reviewer',
                    'correctness-reviewer',
                    'adversarial-reviewer',
                    'unknown-agent',
                ])
            ).toThrow(QuorumViolationError);
        });

        it('should pass when all 4 required agent types are present alongside extra agents', () => {
            const enforcer = new QuorumEnforcer();
            expect(() =>
                enforcer.validate([
                    'security-reviewer',
                    'correctness-reviewer',
                    'adversarial-reviewer',
                    'regression-reviewer',
                    'extra-reviewer',
                ])
            ).not.toThrow();
        });
    });

    describe('CLI fault guard: assertQuorumSpawned()', () => {
        it('should throw QuorumViolationError when quorum agents were not all successfully spawned', () => {
            const enforcer = new QuorumEnforcer();
            // Simulate CLI where only 2 spawned
            expect(() =>
                enforcer.assertQuorumSpawned([
                    { agentType: 'security-reviewer', success: true },
                    { agentType: 'correctness-reviewer', success: false },
                    { agentType: 'adversarial-reviewer', success: true },
                    { agentType: 'regression-reviewer', success: false },
                ])
            ).toThrow(QuorumViolationError);
        });

        it('should throw QuorumViolationError when quorum agents list is incomplete (< 4 types)', () => {
            const enforcer = new QuorumEnforcer();
            expect(() =>
                enforcer.assertQuorumSpawned([
                    { agentType: 'security-reviewer', success: true },
                    { agentType: 'correctness-reviewer', success: true },
                    { agentType: 'adversarial-reviewer', success: true },
                    // regression-reviewer never attempted
                ])
            ).toThrow(QuorumViolationError);
        });

        it('should pass when all 4 quorum agents spawned successfully', () => {
            const enforcer = new QuorumEnforcer();
            expect(() =>
                enforcer.assertQuorumSpawned([
                    { agentType: 'security-reviewer', success: true },
                    { agentType: 'correctness-reviewer', success: true },
                    { agentType: 'adversarial-reviewer', success: true },
                    { agentType: 'regression-reviewer', success: true },
                ])
            ).not.toThrow();
        });
    });
});
