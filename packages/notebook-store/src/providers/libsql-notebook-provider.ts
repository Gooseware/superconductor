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
  NOTE_AUTHORITY,
} from '../types.js';
import {
  NotebookValidator,
  ValidationOptions,
  RateLimitError,
} from '../validation/notebook-validator.js';


function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

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

    const projectRoot = process.env.PROJECT_ROOT || (projectRootOrDbPath.endsWith('.db') ? process.cwd() : projectRootOrDbPath);
    const workspaceBoundary = path.resolve(projectRoot);
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
      content_sha256 TEXT NOT NULL,
      track_id TEXT
    );`;
    await this.dbManager.runMigration(this.client, sqlMeta);
    try {
      await this.dbManager.runMigration(this.client, `ALTER TABLE notebook_metadata ADD COLUMN track_id TEXT;`);
    } catch {
      // Column may already exist
    }
    await this.dbManager.runMigration(this.client, `CREATE INDEX IF NOT EXISTS idx_notebook_metadata_sha256 ON notebook_metadata(content_sha256);`);
    await this.dbManager.runMigration(this.client, `CREATE INDEX IF NOT EXISTS idx_notebook_metadata_track_id ON notebook_metadata(track_id);`);

    const sqlRateLimits = `CREATE TABLE IF NOT EXISTS rate_limits (
      invocation_id TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );`;
    await this.dbManager.runMigration(this.client, sqlRateLimits);
  }

  public async write(
    entry: Omit<NotebookEntry, 'id' | 'timestamp'>,
    options?: ValidationOptions
  ): Promise<WriteAck> {
    NotebookValidator.validate(entry, { ...options, skipRateLimit: true });
    if (!this.client) await this.init();

    const normalizedContent = entry.content.trim().toLowerCase();
    const sha256 = crypto.createHash('sha256').update(normalizedContent).digest('hex');

    // Check for exact SHA-256 match
    const existing = await this.client!.execute({
      sql: `SELECT id FROM notebook_fts WHERE content_sha256 = ? AND track_id = ?`,
      args: [sha256, entry.track_id],
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


    // Check for near-duplicates via Jaccard similarity fallback (COR-3)
    const allRows = await this.client!.execute({
      sql: `SELECT id, content FROM notebook_fts WHERE track_id = ? ORDER BY rowid DESC LIMIT 100`,
      args: [entry.track_id],
    });
    
    for (const row of allRows.rows) {
      if (typeof row.content === 'string') {
        const sim = stringSimilarity(normalizedContent, row.content.trim().toLowerCase());
        if (sim > 0.85) {
          const matchId = String(row.id);
          const now = Date.now();
          await this.client!.execute({
            sql: `UPDATE notebook_fts SET timestamp = ? WHERE id = ?`,
            args: [now, matchId],
          });
          return { id: matchId, deduplicated: true };
        }
      }
    }

    // Atomic SQLite rate-limiting for AGENT-authority writes (REV-3, REV-4)
    const authority = NOTE_AUTHORITY[entry.note_type] ?? 'agent';
    if (authority === 'agent') {
      const invId = options?.invocation_id || `anon_${entry.session_id}`;
      const rateLimitResult = await this.client!.execute({
        sql: `INSERT INTO rate_limits (invocation_id, count) VALUES (?, 1)
              ON CONFLICT(invocation_id) DO UPDATE SET count = count + 1
              RETURNING count`,
        args: [invId],
      });
      const count = Number(rateLimitResult.rows[0]?.count ?? rateLimitResult.rows[0]?.[0] ?? 0);
      if (count > 3) {
        throw new RateLimitError(
          `Invocation '${invId}' has reached maximum rate limit of 3 agent-authority notes`
        );
      }
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
      sql: `INSERT OR IGNORE INTO notebook_metadata (id, content_sha256, track_id) VALUES (?, ?, ?)`,
      args: [id, sha256, entry.track_id]
    });

    return { id, deduplicated: false };
  }

  public async query(params: NotebookQuery): Promise<NotebookEntry[]> {
    if (!this.client) await this.init();

    let resultSet;
    if (params.query && params.query.trim() !== '') {
      try {
        const terms = params.query.trim().split(/\s+/).map(t => `"${t.replace(/"/g, '""')}"`);
        const sanitizedQuery = terms.join(' AND ');
        resultSet = await this.client!.execute({
          sql: `SELECT *, bm25(notebook_fts) as rank FROM notebook_fts WHERE notebook_fts MATCH ? ORDER BY rank`,
          args: [sanitizedQuery],
        });
      } catch (e) {
        console.error('FTS5 query failed:', e);
        return [];
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

  public async summary(track_id?: string, limit: number = 20): Promise<NotebookSummary> {
    if (!this.client) await this.init();

    const effectiveLimit = Math.min(Math.max(1, limit || 20), 100);

    let resultSet;
    if (track_id) {
      resultSet = await this.client!.execute({
        sql: `SELECT * FROM notebook_fts WHERE track_id = ? ORDER BY timestamp DESC LIMIT ?`,
        args: [track_id, effectiveLimit],
      });
    } else {
      resultSet = await this.client!.execute({
        sql: `SELECT * FROM notebook_fts ORDER BY timestamp DESC LIMIT ?`,
        args: [effectiveLimit],
      });
    }

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
