import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AbstractGate, GateContext, GateResult, GateError } from './abstract-gate.js';

export class SignOffRequiredError extends GateError {
  constructor(message = 'User sign-off required before merge') {
    super(message);
    this.name = 'SignOffRequiredError';
  }
}

export interface SignOffRecord {
  approved_by: 'user';
  timestamp: number;
  oracle_conv_id: string | null;
  sign_key: string;
}

export class SignOffGate extends AbstractGate {
  public readonly gateName = 'SignOffGate';

  private static inMemorySignOffs = new Map<string, SignOffRecord>();

  static clearInMemory(): void {
    SignOffGate.inMemorySignOffs.clear();
  }

  constructor(protected stateStore?: any) {
    super();
  }

  protected createError(message: string): GateError {
    return new SignOffRequiredError(message);
  }

  static generateSignKey(sessionId: string, trackId: string, oracleTs: number): string {
    return crypto
      .createHash('sha256')
      .update(`${sessionId}:${trackId}:${oracleTs}`)
      .digest('hex');
  }

  static async recordSignOff(
    trackId: string,
    sessionId: string,
    oracleTs: number,
    oracleConvId: string | null = null,
    stateStore?: any
  ): Promise<SignOffRecord> {
    const signKey = SignOffGate.generateSignKey(sessionId, trackId, oracleTs);
    const record: SignOffRecord = {
      approved_by: 'user',
      timestamp: oracleTs,
      oracle_conv_id: oracleConvId,
      sign_key: signKey,
    };

    if (stateStore && typeof stateStore.saveSignOffRecord === 'function') {
      await stateStore.saveSignOffRecord(trackId, sessionId, record);
    }

    try {
      const dir = path.resolve('superconductor/quorum');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `signoff_${trackId}.json`),
        JSON.stringify({ ...record, track_id: trackId, session_id: sessionId })
      );
    } catch {
      // Ignore if filesystem is read-only
    }

    SignOffGate.inMemorySignOffs.set(`${trackId}:${sessionId}`, record);
    SignOffGate.inMemorySignOffs.set(trackId, record);
    return record;
  }

  static async isApproved(trackId: string, sessionId: string, stateStore?: any): Promise<boolean> {
    let record: SignOffRecord | null = null;

    if (stateStore && typeof stateStore.getSignOffRecord === 'function') {
      try {
        record = await stateStore.getSignOffRecord(trackId, sessionId);
      } catch {
        record = null;
      }
    }

    if (!record && stateStore && typeof stateStore.load === 'function') {
      try {
        const stateRecord = await stateStore.load(trackId, sessionId);
        if (stateRecord) {
          record = stateRecord.sign_off_record || stateRecord.metadata?.sign_off_record || null;
        }
      } catch {
        record = null;
      }
    }

    if (!record) {
      record =
        SignOffGate.inMemorySignOffs.get(`${trackId}:${sessionId}`) ||
        SignOffGate.inMemorySignOffs.get(trackId) ||
        null;
    }

    if (!record) {
      const filePath = path.resolve(`superconductor/quorum/signoff_${trackId}.json`);
      if (fs.existsSync(filePath)) {
        try {
          record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
          record = null;
        }
      }
    }

    if (!record || !record.sign_key) {
      return false;
    }

    const expectedKey = SignOffGate.generateSignKey(sessionId, trackId, record.timestamp);
    return record.sign_key === expectedKey;
  }

  async check(context: GateContext): Promise<GateResult> {
    const approved = await SignOffGate.isApproved(context.trackId, context.sessionId, this.stateStore);
    return { passed: approved, reason: approved ? undefined : 'Sign-off not yet recorded' };
  }
}
