import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
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
    let secret = process.env.SIGN_OFF_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
        throw new Error('SIGN_OFF_SECRET must be set');
      }
      secret = 'dev-secret';
    }
    return crypto
      .createHmac('sha256', secret)
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
    trackId = path.basename(trackId);
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
    } catch (e) {
      console.warn(`[SignOffGate] Failed to write signoff for ${trackId}:`, e);
    }

    SignOffGate.inMemorySignOffs.set(`${trackId}:${sessionId}`, record);
    SignOffGate.inMemorySignOffs.set(trackId, record);
    return record;
  }

  static async isApproved(trackId: string, sessionId: string, stateStore?: any): Promise<boolean> {
    trackId = path.basename(trackId);
    let record: SignOffRecord | null = null;

    if (stateStore && typeof stateStore.getSignOffRecord === 'function') {
      try {
        let rawRecord = await stateStore.getSignOffRecord(trackId, sessionId);
        if (typeof rawRecord === 'string') {
          try {
            rawRecord = JSON.parse(rawRecord);
          } catch (e) {
            console.error('[SignOffGate] Failed to parse sign_off_record:', e);
            rawRecord = null;
          }
        }
        record = rawRecord;
      } catch (e) {
        console.warn(`[SignOffGate] stateStore.getSignOffRecord failed:`, e);
        record = null;
      }
    }

    if (!record && stateStore && typeof stateStore.load === 'function') {
      try {
        const stateRecord = await stateStore.load(trackId, sessionId);
        if (stateRecord) {
          record = stateRecord.sign_off_record || stateRecord.metadata?.sign_off_record || null;
          if (typeof record === 'string') {
            try {
              record = JSON.parse(record);
            } catch (e) {
              console.error('[SignOffGate] Failed to parse sign_off_record from stateRecord:', e);
              record = null;
            }
          }
        }
      } catch (e) {
        console.warn(`[SignOffGate] stateStore.load failed:`, e);
        record = null;
      }
    }


    if (!record) {
      const filePath = path.resolve(`superconductor/quorum/signoff_${trackId}.json`);
      if (fs.existsSync(filePath)) {
        try {
          record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
          console.warn(`[SignOffGate] failed to parse signoff from fs:`, e);
          record = null;
        }
      }
    }

    if (!record || !record.sign_key) {
      return false;
    }

    const expectedKey = SignOffGate.generateSignKey(sessionId, trackId, record.timestamp);
    if (record.sign_key.length !== expectedKey.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(record.sign_key), Buffer.from(expectedKey));
  }

  async askUser(context: GateContext): Promise<void> {
    console.log(`[SignOffGate] ask_user(): diff summary, test counts, quorum rounds, resolved findings, notebook notes written for ${context.trackId}`);
    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question(`Do you approve the merge for ${context.trackId}? (y/n) `, async (answer: string) => {
        rl.close();
        if (answer.trim().toLowerCase() === 'y') {
          await SignOffGate.recordSignOff(context.trackId, context.sessionId, Date.now(), null, this.stateStore);
          resolve();
        } else {
          reject(new SignOffRequiredError('User denied merge'));
        }
      });
    });
  }

  async check(context: GateContext): Promise<GateResult> {
    const flags = process.env.SUPERCONDUCTOR_FLAGS || '';

    if (flags.includes('--no-signoff')) {
      try {
        const logDir = path.resolve('superconductor/logs');
        fs.mkdirSync(logDir, { recursive: true });
        const logMsg = `[${new Date().toISOString()}] YOLO BYPASS: --no-signoff flag present for track ${context.trackId}\n`;
        fs.appendFileSync(path.join(logDir, 'yolo-audit.log'), logMsg);
      } catch (e) {
        // ignore
      }
      return { passed: true, reason: 'Bypassed via --no-signoff' };
    }

    if (process.env.SUPERCONDUCTOR_HEADLESS === 'true') {
      console.log(`[SignOffGate] Emitting report for headless mode...`);
      if (this.stateStore && typeof this.stateStore.saveSignOffRecord === 'function') {
        await this.stateStore.saveSignOffRecord(context.trackId, context.sessionId, { pending_merge: true } as any);
      }
      return { passed: false, reason: 'pending_merge: true' };
    }

    if (process.env.SUPERCONDUCTOR_INTERACTIVE === 'true') {
      try {
        await this.askUser(context);
        return { passed: true, reason: 'Approved interactively' };
      } catch (e: any) {
        return { passed: false, reason: e.message || 'ask_user failed' };
      }
    }

    const approved = await SignOffGate.isApproved(context.trackId, context.sessionId, this.stateStore);
    return { passed: approved, reason: approved ? undefined : 'Sign-off not yet recorded' };
  }
}
