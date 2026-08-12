import { AbstractGate, GateContext, GateResult, GateError } from './abstract-gate.js';

export class PreflightSkippedError extends GateError {
  constructor(message = 'Intelligence preflight header block not found in quorum state') {
    super(message);
    this.name = 'PreflightSkippedError';
  }
}

export class PreflightGate extends AbstractGate {
  public readonly gateName = 'PreflightGate';

  constructor(protected stateStore?: any) {
    super();
  }

  protected createError(message: string): GateError {
    return new PreflightSkippedError(message);
  }

  async check(context: GateContext): Promise<GateResult> {
    let record: any = null;
    if (this.stateStore && typeof this.stateStore.load === 'function') {
      try {
        record = await this.stateStore.load(context.trackId, context.sessionId);
      } catch {
        record = null;
      }
    }
    let metadata = (record && record.metadata) || record || context.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        // ignore
      }
    }

    if (!metadata || !metadata.intelligenceStatusChecked) {
      return { passed: false, reason: 'Intelligence status MCP call not recorded in quorum state' };
    }
    if (!metadata.notebookQueried) {
      return { passed: false, reason: 'Notebook query MCP call not recorded in quorum state' };
    }
    return { passed: true };
  }
}
