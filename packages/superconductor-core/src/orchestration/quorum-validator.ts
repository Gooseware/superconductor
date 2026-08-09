export class QuorumInsufficientError extends Error {
  constructor(public missingRoles: string[]) {
    super(`Quorum incomplete. Missing: ${missingRoles.join(', ')}`);
    this.name = 'QuorumInsufficientError';
  }
}

export class OracleGateError extends Error {
  constructor(message = 'Oracle gate blocked: quorum has not passed') {
    super(message);
    this.name = 'OracleGateError';
  }
}

export class QuorumValidator {
  private requiredRoles = [
    'security-reviewer',
    'correctness-reviewer',
    'adversarial-reviewer',
    'regression-reviewer'
  ];

  validate(panel: string[]): { valid: true; panelComplete: true } {
    const present = new Set(panel);
    const missingRoles = this.requiredRoles.filter(role => !present.has(role));

    if (missingRoles.length > 0) {
      throw new QuorumInsufficientError(missingRoles);
    }

    return { valid: true, panelComplete: true };
  }

  gateOracle(state: { quorumPassed: boolean }): boolean {
    if (!state.quorumPassed) {
      throw new OracleGateError();
    }
    return true;
  }
}
