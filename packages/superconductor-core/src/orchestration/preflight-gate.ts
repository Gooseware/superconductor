import { AbstractGate, GateContext, GateResult, GateError } from './abstract-gate.js';
import { PreflightASTChecker } from '../review/preflight-ast-checker.js';

export class PreflightSkippedError extends GateError {
  constructor(message = 'Intelligence preflight header block not found in quorum state') {
    super(message);
    this.name = 'PreflightSkippedError';
  }
}

export class PreflightGate extends AbstractGate {
  public readonly gateName = 'PreflightGate';
  public readonly astChecker: PreflightASTChecker;

  constructor(protected stateStore?: any, astChecker?: PreflightASTChecker) {
    super();
    this.astChecker = astChecker || new PreflightASTChecker();
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

    // AST Preflight Check
    const diff = (context as any).diff || (metadata && metadata.diff);
    if (diff && typeof diff === 'string') {
      const astResult = this.astChecker.scanDiff(diff);
      if (!astResult.valid) {
        const errorSummary = astResult.violations
          .map(v => `${v.file}:${v.line} [${v.rule}] ${v.message}`)
          .join('; ');
        return {
          passed: false,
          reason: `Preflight AST check failed with ${astResult.violations.length} violation(s): ${errorSummary}`,
        };
      }
    } else if (metadata && (metadata.checkGitPreflight || (context as any).checkGitPreflight)) {
      const projectDir = metadata.projectDir || (context as any).projectDir;
      const astResult = this.astChecker.scanGitDiff({ projectDir });
      if (!astResult.valid) {
        const errorSummary = astResult.violations
          .map(v => `${v.file}:${v.line} [${v.rule}] ${v.message}`)
          .join('; ');
        return {
          passed: false,
          reason: `Preflight AST check failed with ${astResult.violations.length} violation(s): ${errorSummary}`,
        };
      }
    }

    return { passed: true };
  }
}
