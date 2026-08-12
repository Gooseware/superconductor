import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { LibSQLDatabaseManager } from '@superconductor/core';
import { Client } from '@libsql/client';
import { QuorumState } from '../fsm/quorum-fsm.js';

export interface QuorumStateRecord {
  track_id: string;
  session_id: string;
  state: QuorumState;
  cycle_count: number;
  last_diff_hash: string | null;
  reviewer_session_id: string | null;
  timestamp: number;
  sha256_checksum: string;
  sign_off_record?: string | null;
  metadata?: string | null;
}

export class StateIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateIntegrityError';
  }
}

export function computeStateChecksum(
  record: Omit<QuorumStateRecord, 'sha256_checksum'> | QuorumStateRecord
): string {
  const payload = JSON.stringify({
    track_id: record.track_id,
    session_id: record.session_id,
    state: record.state,
    cycle_count: record.cycle_count,
    last_diff_hash: record.last_diff_hash ?? null,
    reviewer_session_id: record.reviewer_session_id ?? null,
    timestamp: record.timestamp,
    sign_off_record: record.sign_off_record ?? null,
    metadata: record.metadata ?? null,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export class QuorumStateStore {
  private dbManager: LibSQLDatabaseManager;
  private dbPath: string;
  private client: Client | null = null;

  constructor(dbPath?: string) {
    this.dbManager = new LibSQLDatabaseManager();
    if (dbPath) {
      this.dbPath = dbPath;
    } else {
      const dir = path.join(process.cwd(), 'superconductor', 'quorum');
      fs.mkdirSync(dir, { recursive: true });
      this.dbPath = path.join(dir, 'quorum_state.db');
    }
  }

  public async init(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.client = this.dbManager.getConnection(this.dbPath);
    const sql = `CREATE TABLE IF NOT EXISTS quorum_state (
      track_id TEXT,
      session_id TEXT,
      state TEXT,
      cycle_count INT,
      last_diff_hash TEXT,
      reviewer_session_id TEXT,
      timestamp INT,
      sha256_checksum TEXT,
      sign_off_record TEXT,
      metadata TEXT,
      PRIMARY KEY(track_id, session_id)
    );`;
    await this.dbManager.runMigration(this.client, sql);
  }

  public async save(record: QuorumStateRecord): Promise<void> {
    record.sha256_checksum = computeStateChecksum(record);
    await this.saveRawRecord(record);
  }

  public async saveRawRecord(record: QuorumStateRecord): Promise<void> {
    if (!this.client) await this.init();

    await this.client!.execute({
      sql: `INSERT OR REPLACE INTO quorum_state (
        track_id, session_id, state, cycle_count, last_diff_hash, reviewer_session_id, timestamp, sha256_checksum, sign_off_record, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        record.track_id,
        record.session_id,
        record.state,
        record.cycle_count,
        record.last_diff_hash,
        record.reviewer_session_id,
        record.timestamp,
        record.sha256_checksum,
        record.sign_off_record || null,
        record.metadata || null,
      ],
    });
  }

  public async load(track_id: string, session_id: string): Promise<QuorumStateRecord | null> {
    if (!this.client) await this.init();

    const resultSet = await this.client!.execute({
      sql: `SELECT * FROM quorum_state WHERE track_id = ? AND session_id = ?`,
      args: [track_id, session_id],
    });

    if (resultSet.rows.length === 0) {
      return null;
    }

    const row = resultSet.rows[0];
    const record: QuorumStateRecord = {
      track_id: String(row.track_id),
      session_id: String(row.session_id),
      state: String(row.state) as QuorumState,
      cycle_count: Number(row.cycle_count),
      last_diff_hash: row.last_diff_hash ? String(row.last_diff_hash) : null,
      reviewer_session_id: row.reviewer_session_id ? String(row.reviewer_session_id) : null,
      timestamp: Number(row.timestamp),
      sha256_checksum: String(row.sha256_checksum),
      sign_off_record: row.sign_off_record ? String(row.sign_off_record) : null,
      metadata: row.metadata ? String(row.metadata) : null,
    };

    const expectedChecksum = computeStateChecksum(record);
    if (record.sha256_checksum !== expectedChecksum) {
      throw new StateIntegrityError(
        `State integrity error: checksum mismatch for track '${track_id}', session '${session_id}'`
      );
    }

    return record;
  }

  public async saveSignOffRecord(trackId: string, sessionId: string, record: any): Promise<void> {
    if (!this.client) await this.init();
    const signOffString = typeof record === 'string' ? record : JSON.stringify(record);
    
    const existing = await this.load(trackId, sessionId);
    if (existing) {
      existing.sign_off_record = signOffString;
      await this.save(existing);
    } else {
      const stubRecord: QuorumStateRecord = {
        track_id: trackId,
        session_id: sessionId,
        state: 'INIT',
        cycle_count: 0,
        last_diff_hash: null,
        reviewer_session_id: null,
        timestamp: Date.now(),
        sha256_checksum: '',
        sign_off_record: signOffString,
      };
      await this.save(stubRecord);
    }
  }

  public async getSignOffRecord(trackId: string, sessionId: string): Promise<string | null> {
    if (!this.client) await this.init();
    const resultSet = await this.client!.execute({
      sql: `SELECT sign_off_record FROM quorum_state WHERE track_id = ? AND session_id = ?`,
      args: [trackId, sessionId],
    });
    if (resultSet.rows.length === 0) return null;
    const row = resultSet.rows[0];
    return row.sign_off_record ? String(row.sign_off_record) : null;
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.dbManager.close(this.dbPath);
      this.client = null;
    }
  }
}
