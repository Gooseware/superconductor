import { AbstractGate, GateContext, GateResult, GateError } from './abstract-gate.js';

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

export class QuorumValidator extends AbstractGate {
  public readonly gateName = 'QuorumValidator';

  private requiredRoles = [
    'security-reviewer',
    'correctness-reviewer',
    'adversarial-reviewer',
    'regression-reviewer',
  ];

  protected createError(message: string): GateError {
    return new GateError(message);
  }

  async check(context: GateContext): Promise<GateResult> {
    if (Array.isArray(context.metadata?.panel)) {
      try {
        this.validate(context.metadata.panel as string[]);
        return { passed: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { passed: false, reason: msg };
      }
    }

    if (context.metadata?.quorumPassed !== undefined) {
      if (context.metadata.quorumPassed) {
        return { passed: true };
      } else {
        return { passed: false, reason: 'Oracle gate blocked: quorum has not passed' };
      }
    }

    return { passed: true };
  }

  static gateOracle(state: { quorumPassed: boolean }): boolean {
    if (!state.quorumPassed) {
      throw new OracleGateError();
    }
    return true;
  }

  validate(panel: string[]): { valid: true; panelComplete: true } {
    const present = new Set(panel);
    const missingRoles = this.requiredRoles.filter((role) => !present.has(role));

    if (missingRoles.length > 0) {
      throw new QuorumInsufficientError(missingRoles);
    }

    return { valid: true, panelComplete: true };
  }

  gateOracle(state: { quorumPassed: boolean }): boolean {
    return QuorumValidator.gateOracle(state);
  }
}
