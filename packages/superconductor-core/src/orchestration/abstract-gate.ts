import fs from 'fs';
import path from 'path';

export interface GateContext {
  trackId: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

export interface GateResult {
  passed: boolean;
  reason?: string;
}

export class GateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GateError';
  }
}

export abstract class AbstractGate {
  public abstract readonly gateName: string;

  protected abstract createError(message: string): GateError;
  
  public abstract check(context: GateContext): Promise<GateResult>;

  public async assert(context: GateContext): Promise<void> {
    let result: GateResult;
    try {
      result = await this.check(context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const fullReason = `Unexpected error in ${this.gateName}: ${errorMessage}`;
      this.logAudit(context.trackId, 'FAIL', fullReason);
      throw this.createError(fullReason);
    }
      
    if (result.passed) {
      this.logAudit(context.trackId, 'PASS');
    } else {
      const reason = result.reason || 'Unknown reason';
      this.logAudit(context.trackId, 'FAIL', reason);
      throw this.createError(reason);
    }
  }

  private logAudit(trackId: string, result: 'PASS' | 'FAIL', reason?: string): void {
    const timestamp = new Date().toISOString();
    let message = `[${timestamp}] [${this.gateName}] trackId=${trackId} result=${result}`;
    if (reason) {
      message += ` reason=${reason}`;
    }
    message += '\n';

    try {
      const logDir = path.resolve(process.env.PROJECT_ROOT || process.cwd(), 'superconductor/logs');
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, 'gate-audit.log'), message);
    } catch (e) {
      // In production we might use a proper logger that doesn't throw, but we ignore for now
      console.error('Failed to write to audit log', e);
    }
  }
}
