/**
 * QuorumEnforcer — hard invariant: exactly these 4 agent types MUST be present
 * for every review cycle. This is NOT overridable via topography or config.
 */

/** The fixed set of required quorum agent types. Non-negotiable. */
export const REQUIRED_QUORUM_AGENTS: readonly string[] = [
    'security-reviewer',
    'correctness-reviewer',
    'adversarial-reviewer',
    'regression-reviewer',
] as const;

/**
 * Thrown when the 4-agent quorum invariant is violated — either because fewer
 * than 4 distinct required agent types are registered, or because one or more
 * agents failed to spawn successfully.
 */
export class QuorumViolationError extends Error {
    public readonly missingAgents: readonly string[];

    constructor(missingAgents: string[], context?: string) {
        const contextPrefix = context ? `[${context}] ` : '';
        const missingList = missingAgents.join(', ');
        super(
            `${contextPrefix}QuorumViolationError: quorum invariant violated. ` +
            `Missing required agent type(s): ${missingList}. ` +
            `All 4 of [${REQUIRED_QUORUM_AGENTS.join(', ')}] must be present.`
        );
        this.name = 'QuorumViolationError';
        this.missingAgents = missingAgents;
        // Maintain prototype chain for instanceof checks
        Object.setPrototypeOf(this, QuorumViolationError.prototype);
    }
}

export interface SpawnResult {
    agentType: string;
    success: boolean;
}

/**
 * QuorumEnforcer validates that all 4 required reviewer agent types are present
 * and successfully spawned before allowing a state transition.
 *
 * This enforcer is a hard invariant — it cannot be bypassed through topography
 * configuration or any other external mechanism.
 */
export class QuorumEnforcer {
    /**
     * Validates that all 4 required agent types are present in the provided list.
     * Duplicates are collapsed — only distinct types are counted.
     *
     * @throws {QuorumViolationError} if any required agent type is missing.
     */
    validate(registeredAgentTypes: string[]): void {
        const distinctTypes = new Set(registeredAgentTypes);
        const missing = REQUIRED_QUORUM_AGENTS.filter(
            required => !distinctTypes.has(required)
        );

        if (missing.length > 0) {
            throw new QuorumViolationError(missing);
        }
    }

    /**
     * Validates that all 4 required agent types were both registered AND
     * successfully spawned. Called by the CLI before allowing state transition.
     *
     * @throws {QuorumViolationError} if any required agent type is missing or
     *   failed to spawn.
     */
    assertQuorumSpawned(results: SpawnResult[]): void {
        // First, check that all 4 required types are even present in the list
        const presentTypes = results.map(r => r.agentType);
        this.validate(presentTypes);

        // Then check that all required types spawned successfully
        const failedRequired = REQUIRED_QUORUM_AGENTS.filter(required => {
            const result = results.find(r => r.agentType === required);
            return !result || !result.success;
        });

        if (failedRequired.length > 0) {
            throw new QuorumViolationError(
                failedRequired,
                'spawn-failure'
            );
        }
    }
}
