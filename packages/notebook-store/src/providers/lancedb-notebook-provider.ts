import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import {
  INotebookProvider,
  NotebookEntry,
  NotebookQuery,
  NotebookSummary,
  WriteAck,
  NOTE_STORE,
  NoteType,
} from '../types.js';
import { NotebookValidator, ValidationOptions } from '../validation/notebook-validator.js';

export interface LanceDBProviderOptions {
  globalPath?: string;
  projectPath?: string;
  projectRoot?: string;
}

export class LanceDBNotebookProvider implements INotebookProvider {
  private globalPath: string;
  private projectPath: string;
  private pipeline: any = null;
  private connections: Map<string, any> = new Map();

  constructor(optionsOrProjectRoot?: string | LanceDBProviderOptions) {
    if (typeof optionsOrProjectRoot === 'string') {
      this.projectPath = path.join(optionsOrProjectRoot, 'superconductor', 'notebook');
      this.globalPath = path.join(os.homedir(), '.superconductor', 'notebook');
    } else if (optionsOrProjectRoot) {
      if (optionsOrProjectRoot.projectRoot) {
        this.projectPath = path.join(optionsOrProjectRoot.projectRoot, 'superconductor', 'notebook');
      } else {
        this.projectPath = optionsOrProjectRoot.projectPath || path.join(process.cwd(), 'superconductor', 'notebook');
      }
      this.globalPath = optionsOrProjectRoot.globalPath || path.join(os.homedir(), '.superconductor', 'notebook');
    } else {
      this.projectPath = path.join(process.cwd(), 'superconductor', 'notebook');
      this.globalPath = path.join(os.homedir(), '.superconductor', 'notebook');
    }
  }

  public async init(): Promise<void> {
    // Lazy initialization
  }

  private async getEmbedding(text: string): Promise<number[]> {
    if (!this.pipeline) {
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  private async getTable(storeType: 'global' | 'project'): Promise<any | null> {
    const dbPath = storeType === 'global' ? this.globalPath : this.projectPath;
    if (!fs.existsSync(dbPath)) {
      return null;
    }
    const lancedb = await import('@lancedb/lancedb');
    let conn = this.connections.get(dbPath);
    if (!conn) {
      conn = await lancedb.connect(dbPath);
      this.connections.set(dbPath, conn);
    }
    const tables = await conn.tableNames();
    if (!tables.includes('notebook')) {
      return null;
    }
    return await conn.openTable('notebook');
  }

  private async getOrCreateTable(storeType: 'global' | 'project', sampleRecord: any): Promise<any> {
    const dbPath = storeType === 'global' ? this.globalPath : this.projectPath;
    fs.mkdirSync(dbPath, { recursive: true });
    const lancedb = await import('@lancedb/lancedb');
    let conn = this.connections.get(dbPath);
    if (!conn) {
      conn = await lancedb.connect(dbPath);
      this.connections.set(dbPath, conn);
    }
    const tables = await conn.tableNames();
    if (tables.includes('notebook')) {
      return await conn.openTable('notebook');
    }
    return await conn.createTable('notebook', [sampleRecord]);
  }

  public async write(
    entry: Omit<NotebookEntry, 'id' | 'timestamp'>,
    options?: ValidationOptions
  ): Promise<WriteAck> {
    // 1. Run validation engine BEFORE writing
    NotebookValidator.validate(entry, options);

    // 2. Compute SHA-256 hash
    const normalizedContent = entry.content.trim().toLowerCase();
    const sha256 = crypto.createHash('sha256').update(normalizedContent).digest('hex');

    // 3. Determine target store
    const storeType = NOTE_STORE[entry.note_type] || 'project';
    const existingTable = await this.getTable(storeType);

    // 4. Compute vector embedding
    const vector = await this.getEmbedding(entry.content);

    if (existingTable) {
      // Check existing rows for exact SHA-256 match
      const allRows = await existingTable.query().toArray();
      const shaMatch = allRows.find((r: any) => r.content_sha256 === sha256);
      if (shaMatch) {
        await existingTable.update({
          where: `id = '${shaMatch.id}'`,
          values: { timestamp: Date.now() },
        });
        return { id: shaMatch.id, deduplicated: true };
      }

      // Check vector cosine similarity
      if (allRows.length > 0) {
        const searchResults = await existingTable.search(vector).metricType('cosine').limit(1).toArray();
        if (searchResults.length > 0 && searchResults[0]._distance !== undefined && searchResults[0]._distance < 0.05) {
          const match = searchResults[0];
          await existingTable.update({
            where: `id = '${match.id}'`,
            values: { timestamp: Date.now() },
          });
          return { id: match.id, deduplicated: true };
        }
      }
    }

    // 5. New entry
    const id = crypto.randomUUID();
    const now = Date.now();
    const record = {
      id,
      session_id: entry.session_id,
      track_id: entry.track_id,
      agent_role: entry.agent_role,
      domain: entry.domain,
      files: JSON.stringify(entry.files || []),
      note_type: entry.note_type,
      content: entry.content,
      severity: entry.severity,
      timestamp: now,
      reviewer_token: entry.reviewer_token || '',
      content_sha256: sha256,
      vector,
    };

    if (existingTable) {
      await existingTable.add([record]);
    } else {
      await this.getOrCreateTable(storeType, record);
    }

    return { id, deduplicated: false };
  }

  public async query(params: NotebookQuery): Promise<NotebookEntry[]> {
    const globalTable = await this.getTable('global');
    const projectTable = await this.getTable('project');

    import('../search/rrf-search.js').then();
    const { rrfMerge, applyTokenBudget } = await import('../search/rrf-search.js');

    let entries: NotebookEntry[] = [];

    if (params.query && params.query.trim() !== '') {
      const queryVector = await this.getEmbedding(params.query);
      const queryTerms = params.query.toLowerCase().split(/\s+/);

      let vectorRows: any[] = [];
      let bm25Rows: any[] = [];

      for (const table of [globalTable, projectTable]) {
        if (!table) continue;
        const vSearch = await table.search(queryVector).metricType('cosine').limit(params.limit || 50).toArray();
        vectorRows.push(...vSearch);

        const allTableRows = await table.query().toArray();
        const bMatch = allTableRows.filter((r: any) =>
          queryTerms.some((term) => r.content.toLowerCase().includes(term))
        );
        bm25Rows.push(...bMatch);
      }

      const mapToEntry = (r: any): NotebookEntry => ({
        id: r.id,
        session_id: r.session_id,
        track_id: r.track_id,
        agent_role: r.agent_role,
        domain: r.domain,
        files: typeof r.files === 'string' ? JSON.parse(r.files) : r.files,
        note_type: r.note_type as NoteType,
        content: r.content,
        severity: r.severity,
        timestamp: r.timestamp,
        reviewer_token: r.reviewer_token || undefined,
      });

      const vectorEntries = vectorRows.map(mapToEntry);
      const bm25Entries = bm25Rows.map(mapToEntry);

      entries = rrfMerge(vectorEntries, bm25Entries);
    } else {
      let rawRows: any[] = [];
      for (const table of [globalTable, projectTable]) {
        if (!table) continue;
        const rows = await table.query().toArray();
        rawRows.push(...rows);
      }
      entries = rawRows.map((r: any) => ({
        id: r.id,
        session_id: r.session_id,
        track_id: r.track_id,
        agent_role: r.agent_role,
        domain: r.domain,
        files: typeof r.files === 'string' ? JSON.parse(r.files) : r.files,
        note_type: r.note_type as NoteType,
        content: r.content,
        severity: r.severity,
        timestamp: r.timestamp,
        reviewer_token: r.reviewer_token || undefined,
      }));
    }

    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    // Filter TTL for failure notes (> 90 days old)
    entries = entries.filter((e) => {
      if (e.note_type === 'failure' && now - e.timestamp > ninetyDaysMs) {
        return false;
      }
      if (params.max_age_days) {
        const maxAgeMs = params.max_age_days * 24 * 60 * 60 * 1000;
        if (now - e.timestamp > maxAgeMs) {
          return false;
        }
      }
      return true;
    });

    // Apply filtering
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

    entries = applyTokenBudget(entries);

    const limit = params.limit || 5;
    return entries.slice(0, limit);
  }

  public async summary(track_id?: string): Promise<NotebookSummary> {
    const globalTable = await this.getTable('global');
    const projectTable = await this.getTable('project');

    let rawRows: any[] = [];
    for (const table of [globalTable, projectTable]) {
      if (!table) continue;
      const rows = await table.query().toArray();
      rawRows.push(...rows);
    }

    let entries: NotebookEntry[] = rawRows.map((r: any) => ({
      id: r.id,
      session_id: r.session_id,
      track_id: r.track_id,
      agent_role: r.agent_role,
      domain: r.domain,
      files: typeof r.files === 'string' ? JSON.parse(r.files) : r.files,
      note_type: r.note_type as NoteType,
      content: r.content,
      severity: r.severity,
      timestamp: r.timestamp,
      reviewer_token: r.reviewer_token || undefined,
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
    this.connections.clear();
  }
}
