import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { LibSQLDatabaseManager } from '@superconductor/core';
import { Client } from '@libsql/client';
import {
  INotebookProvider,
  NotebookEntry,
  NotebookQuery,
  NotebookSummary,
  WriteAck,
  NoteType,
} from '../types.js';
import { NotebookValidator, ValidationOptions } from '../validation/notebook-validator.js';

export class LibSQLNotebookProvider implements INotebookProvider {
  private dbManager: LibSQLDatabaseManager;
  private dbPath: string;
  private client: Client | null = null;

  constructor(projectRootOrDbPath: string) {
    this.dbManager = new LibSQLDatabaseManager();
    let targetPath: string;
    if (projectRootOrDbPath.endsWith('.db')) {
      targetPath = path.resolve(projectRootOrDbPath);
    } else {
      targetPath = path.resolve(projectRootOrDbPath, 'superconductor', 'notebook', 'notebook_fts.db');
    }

    const workspaceBoundary = path.resolve(process.cwd());
    if (!targetPath.startsWith(workspaceBoundary + path.sep)) {
      throw new Error(`Database path escapes workspace boundary: ${targetPath}`);
    }

    if (projectRootOrDbPath.endsWith('.db')) {
      this.dbPath = targetPath;
    } else {
      const dir = path.dirname(targetPath);
      fs.mkdirSync(dir, { recursive: true });
      this.dbPath = targetPath;
    }
  }

  public async init(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.client = this.dbManager.getConnection(this.dbPath);
    const sql = `CREATE VIRTUAL TABLE IF NOT EXISTS notebook_fts USING fts5(
      id,
      content,
      note_type,
      domain,
      files,
      severity,
      track_id,
      session_id,
      agent_role,
      timestamp UNINDEXED,
      reviewer_token UNINDEXED,
      content_sha256 UNINDEXED
    );`;
    await this.dbManager.runMigration(this.client, sql);
    
    const sqlMeta = `CREATE TABLE IF NOT EXISTS notebook_metadata (
      id TEXT PRIMARY KEY,
      content_sha256 TEXT UNIQUE
    );`;
    await this.dbManager.runMigration(this.client, sqlMeta);
    await this.dbManager.runMigration(this.client, `CREATE INDEX IF NOT EXISTS idx_notebook_metadata_sha256 ON notebook_metadata(content_sha256);`);
  }

  public async write(
    entry: Omit<NotebookEntry, 'id' | 'timestamp'>,
    options?: ValidationOptions
  ): Promise<WriteAck> {
    NotebookValidator.validate(entry, options);
    if (!this.client) await this.init();

    const normalizedContent = entry.content.trim().toLowerCase();
    const sha256 = crypto.createHash('sha256').update(normalizedContent).digest('hex');

    // Check for exact SHA-256 match
    const existing = await this.client!.execute({
      sql: `SELECT id FROM notebook_metadata WHERE content_sha256 = ?`,
      args: [sha256],
    });

    if (existing.rows.length > 0) {
      const matchId = String(existing.rows[0].id);
      const now = Date.now();
      await this.client!.execute({
        sql: `UPDATE notebook_fts SET timestamp = ? WHERE id = ?`,
        args: [now, matchId],
      });
      return { id: matchId, deduplicated: true };
    }

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const filesJson = JSON.stringify(entry.files || []);

    await this.client!.execute({
      sql: `INSERT INTO notebook_fts (
        id, content, note_type, domain, files, severity, track_id, session_id, agent_role, timestamp, reviewer_token, content_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        entry.content,
        entry.note_type,
        entry.domain,
        filesJson,
        entry.severity,
        entry.track_id,
        entry.session_id,
        entry.agent_role,
        timestamp,
        entry.reviewer_token || '',
        sha256,
      ],
    });

    await this.client!.execute({
      sql: `INSERT OR IGNORE INTO notebook_metadata (id, content_sha256) VALUES (?, ?)`,
      args: [id, sha256]
    });

    return { id, deduplicated: false };
  }

  public async query(params: NotebookQuery): Promise<NotebookEntry[]> {
    if (!this.client) await this.init();

    let resultSet;
    if (params.query && params.query.trim() !== '') {
      try {
        const terms = params.query.trim().split(/\\s+/).map(t => `"${t.replace(/"/g, '""')}"`);
        const sanitizedQuery = terms.join(' AND ');
        resultSet = await this.client!.execute({
          sql: `SELECT *, bm25(notebook_fts) as rank FROM notebook_fts WHERE notebook_fts MATCH ? ORDER BY rank`,
          args: [sanitizedQuery],
        });
      } catch (e) {
        console.error('FTS5 query failed:', e);
        throw e;
      }
    } else {
      resultSet = await this.client!.execute({
        sql: `SELECT * FROM notebook_fts ORDER BY timestamp DESC`,
        args: [],
      });
    }

    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    let entries: NotebookEntry[] = resultSet.rows.map((r: any) => ({
      id: String(r.id),
      session_id: String(r.session_id),
      track_id: String(r.track_id),
      agent_role: String(r.agent_role),
      domain: String(r.domain),
      files: typeof r.files === 'string' ? (() => { try { return JSON.parse(r.files); } catch { return []; } })() : (r.files || []),
      note_type: String(r.note_type) as NoteType,
      content: String(r.content),
      severity: String(r.severity) as any,
      timestamp: Number(r.timestamp),
      reviewer_token: r.reviewer_token ? String(r.reviewer_token) : undefined,
    }));

    // Filter TTL
    entries = entries.filter((e) => {
      if (e.note_type === 'failure' && now - e.timestamp > ninetyDaysMs) {
        return false;
      }
      if (params.max_age_days !== undefined) {
        const maxAgeMs = params.max_age_days * 24 * 60 * 60 * 1000;
        if (now - e.timestamp > maxAgeMs) {
          return false;
        }
      }
      return true;
    });

    if (params.domain) {
      entries = entries.filter((e) => e.domain === params.domain);
    }
    if (params.files && params.files.length > 0) {
      entries = entries.filter((e) =>
        e.files.some((f) => params.files!.includes(f))
      );
    }
    if (params.note_types && params.note_types.length > 0) {
      entries = entries.filter((e) => params.note_types!.includes(e.note_type));
    }
    if (params.severity) {
      entries = entries.filter((e) => e.severity === params.severity);
    }

    const limit = params.limit !== undefined ? params.limit : 5;
    return entries.slice(0, limit);
  }

  public async summary(track_id?: string): Promise<NotebookSummary> {
    if (!this.client) await this.init();

    const resultSet = await this.client!.execute({
      sql: `SELECT * FROM notebook_fts ORDER BY timestamp DESC`,
      args: [],
    });

    let entries: NotebookEntry[] = resultSet.rows.map((r: any) => ({
      id: String(r.id),
      session_id: String(r.session_id),
      track_id: String(r.track_id),
      agent_role: String(r.agent_role),
      domain: String(r.domain),
      files: typeof r.files === 'string' ? (() => { try { return JSON.parse(r.files); } catch { return []; } })() : (r.files || []),
      note_type: String(r.note_type) as NoteType,
      content: String(r.content),
      severity: String(r.severity) as any,
      timestamp: Number(r.timestamp),
      reviewer_token: r.reviewer_token ? String(r.reviewer_token) : undefined,
    }));

    if (track_id) {
      entries = entries.filter((e) => e.track_id === track_id);
    }

    const by_type: Partial<Record<NoteType, NotebookEntry[]>> = {};
    for (const entry of entries) {
      if (!by_type[entry.note_type]) {
        by_type[entry.note_type] = [];
      }
      by_type[entry.note_type]!.push(entry);
    }

    return {
      by_type,
      total: entries.length,
    };
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.dbManager.close(this.dbPath);
      this.client = null;
    }
  }
}
