import * as fs from 'node:fs';
import { AbstractGate, GateContext, GateResult, GateError } from './abstract-gate.js';
import { evaluateInvariantRules, RuleViolation } from '../review/rules/index.js';

export interface PreflightGateContext extends GateContext {
  files?: Array<{ path: string; content: string; diff?: string }>;
  diff?: string;
  changedFiles?: string[];
}

export interface PreflightGateResult extends GateResult {
  violations?: RuleViolation[];
}

export class PreflightSkippedError extends GateError {
  constructor(message = 'Intelligence preflight header block not found in quorum state') {
    super(message);
    this.name = 'PreflightSkippedError';
  }
}

function parseGitDiffToFiles(diff: string): Array<{ path: string; diff: string }> {
  const fileDiffs: Array<{ path: string; diff: string }> = [];
  const parts = diff.split(/^diff --git /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const headerMatch = /^(?:a\/)?([^\s]+)\s+(?:b\/)?([^\s\n]+)/.exec(part);
    const filePath = headerMatch ? headerMatch[2] : 'unknown';
    fileDiffs.push({ path: filePath, diff: 'diff --git ' + part });
  }
  if (fileDiffs.length === 0 && diff.trim()) {
    fileDiffs.push({ path: 'diff.patch', diff });
  }
  return fileDiffs;
}

function resolveEvaluationFiles(context: PreflightGateContext): Array<{ path: string; content: string; diff?: string }> {
  if (context.files && Array.isArray(context.files) && context.files.length > 0) {
    return context.files;
  }

  const resultFiles: Array<{ path: string; content: string; diff?: string }> = [];

  if (context.diff) {
    const diffFiles = parseGitDiffToFiles(context.diff);
    for (const df of diffFiles) {
      if (!/\.(?:[jt]sx?|[cm][jt]s)$/i.test(df.path)) {
        continue;
      }
      let content = '';
      if (fs.existsSync(df.path)) {
        try {
          content = fs.readFileSync(df.path, 'utf-8');
        } catch (err) {
          if (process.env.DEBUG) console.debug('PreflightGate: failed to read file from diff', err);
        }
      }
      resultFiles.push({
        path: df.path,
        content,
        diff: df.diff,
      });
    }
  }

  if (context.changedFiles && Array.isArray(context.changedFiles)) {
    for (const filePath of context.changedFiles) {
      if (!/\.(?:[jt]sx?|[cm][jt]s)$/i.test(filePath)) {
        continue;
      }
      if (!resultFiles.some(f => f.path === filePath)) {
        let content = '';
        if (fs.existsSync(filePath)) {
          try {
            content = fs.readFileSync(filePath, 'utf-8');
          } catch (err) {
            if (process.env.DEBUG) console.debug('PreflightGate: failed to read changed file', err);
          }
        }
        resultFiles.push({
          path: filePath,
          content,
        });
      }
    }
  }

  return resultFiles;
}

export class PreflightGate extends AbstractGate {
  public readonly gateName = 'PreflightGate';

  constructor(protected stateStore?: any) {
    super();
  }

  protected createError(message: string): GateError {
    return new PreflightSkippedError(message);
  }

  async check(context: PreflightGateContext): Promise<PreflightGateResult> {
    let record: any = null;
    if (this.stateStore && typeof this.stateStore.load === 'function') {
      try {
        record = await this.stateStore.load(context.trackId, context.sessionId);
      } catch (err) {
        if (process.env.DEBUG) console.debug('PreflightGate: stateStore.load failed', err);
        record = null;
      }
    }
    let metadata = (record && record.metadata) || record || context.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (err) {
        if (process.env.DEBUG) console.debug('PreflightGate: metadata JSON parse failed', err);
      }
    }

    if (!metadata || !metadata.intelligenceStatusChecked) {
      return { passed: false, reason: 'Intelligence status MCP call not recorded in quorum state' };
    }
    if (!metadata.notebookQueried) {
      return { passed: false, reason: 'Notebook query MCP call not recorded in quorum state' };
    }

    const filesToEvaluate = resolveEvaluationFiles(context);
    if (filesToEvaluate.length > 0) {
      const evalResult = evaluateInvariantRules({ files: filesToEvaluate });
      if (!evalResult.passed && evalResult.violations.length > 0) {
        return {
          passed: false,
          reason: `Invariant preflight failure: ${evalResult.violations[0].message}`,
          violations: evalResult.violations,
        };
      }
    }

    return { passed: true };
  }
}

