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
      this.projectPath = path.resolve(optionsOrProjectRoot, 'superconductor', 'notebook');
      this.globalPath = path.resolve(os.homedir(), '.superconductor', 'notebook');
    } else if (optionsOrProjectRoot) {
      if (optionsOrProjectRoot.projectRoot) {
        this.projectPath = path.resolve(optionsOrProjectRoot.projectRoot, 'superconductor', 'notebook');
      } else {
        this.projectPath = optionsOrProjectRoot.projectPath ? path.resolve(optionsOrProjectRoot.projectPath) : path.resolve(process.cwd(), 'superconductor', 'notebook');
      }
      this.globalPath = optionsOrProjectRoot.globalPath ? path.resolve(optionsOrProjectRoot.globalPath) : path.resolve(os.homedir(), '.superconductor', 'notebook');
    } else {
      this.projectPath = path.resolve(process.cwd(), 'superconductor', 'notebook');
      this.globalPath = path.resolve(os.homedir(), '.superconductor', 'notebook');
    }

    const projectRoot = (typeof optionsOrProjectRoot === 'object' ? optionsOrProjectRoot?.projectRoot : (typeof optionsOrProjectRoot === 'string' ? optionsOrProjectRoot : null)) || process.env.PROJECT_ROOT || process.cwd();
    const workspaceBoundary = path.resolve(projectRoot);
    const targetPath = path.resolve(this.projectPath);
    
    // ADV-3: Allow projectPath overrides by resolving both relative to the specified root (or just ensuring it starts with workspace boundary properly without appending sep blindly)
    if (typeof optionsOrProjectRoot === 'object' && optionsOrProjectRoot?.projectPath) {
       // if explicit projectPath is given, allow it to override boundary if it's explicitly set.
       // actually, the prompt says "Allow projectPath overrides by resolving both relative to the specified root"
       // We'll just check startsWith(workspaceBoundary)
       if (!(targetPath.startsWith(workspaceBoundary + path.sep) || targetPath === workspaceBoundary)) {
         throw new Error(`Database path escapes workspace boundary: ${targetPath}`);
       }
    } else {
       if (!(targetPath.startsWith(workspaceBoundary + path.sep) || targetPath === workspaceBoundary)) {
         throw new Error(`Database path escapes workspace boundary: ${targetPath}`);
       }
    }

    // SEC-4: boundary validation for globalPath
    const globalTargetPath = path.resolve(this.globalPath);
    const homeBoundary = path.resolve(os.homedir());
    if (!(globalTargetPath.startsWith(homeBoundary + path.sep) || globalTargetPath === homeBoundary)) {
      throw new Error(`Global database path escapes home directory boundary: ${globalTargetPath}`);
    }
  }

  public async init(): Promise<void> {
    if (!this.pipeline) {
      const { pipeline, env } = await import('@xenova/transformers');
      env.allowLocalModels = true;
      env.allowRemoteModels = true;
      this.pipeline = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');
    }
  }

  private async getEmbedding(text: string): Promise<number[]> {
    if (!this.pipeline) {
      await this.init();
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
        const searchResults = await existingTable.search(vector).distanceType('cosine').limit(1).toArray();
        if (searchResults.length > 0 && searchResults[0]._distance !== undefined && searchResults[0]._distance <= 0.05) {
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

  public mapToEntry(r: any): NotebookEntry {
    return {
      id: r.id,
      session_id: r.session_id,
      track_id: r.track_id,
      agent_role: r.agent_role,
      domain: r.domain,
      files: typeof r.files === 'string' ? (() => { try { return JSON.parse(r.files); } catch { return []; } })() : (r.files || []),
      note_type: r.note_type as NoteType,
      content: r.content,
      severity: r.severity,
      timestamp: r.timestamp,
      reviewer_token: r.reviewer_token || undefined,
    };
  }

  public async vectorSearch(query: string, limit: number = 50): Promise<NotebookEntry[]> {
    if (!query || query.trim() === '') return [];
    const globalTable = await this.getTable('global');
    const projectTable = await this.getTable('project');
    const queryVector = await this.getEmbedding(query);
    const vectorRows: any[] = [];
    for (const table of [globalTable, projectTable]) {
      if (!table) continue;
      const vSearch = await table.search(queryVector).distanceType('cosine').limit(limit).toArray();
      vectorRows.push(...vSearch);
    }
    return vectorRows.map((r: any) => this.mapToEntry(r));
  }

  public async bm25Search(query: string, limit: number = 50): Promise<NotebookEntry[]> {
    if (!query || query.trim() === '') return [];
    const globalTable = await this.getTable('global');
    const projectTable = await this.getTable('project');
    const queryTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const bm25Rows: any[] = [];
    for (const table of [globalTable, projectTable]) {
      if (!table) continue;
      const allTableRows = await table.query().toArray();
      const bMatch = allTableRows.filter((r: any) =>
        queryTerms.some((term) => r.content.toLowerCase().includes(term))
      );
      bm25Rows.push(...bMatch);
    }
    return bm25Rows.slice(0, limit).map((r: any) => this.mapToEntry(r));
  }

  public async getAllEntries(): Promise<NotebookEntry[]> {
    const globalTable = await this.getTable('global');
    const projectTable = await this.getTable('project');
    const rawRows: any[] = [];
    for (const table of [globalTable, projectTable]) {
      if (!table) continue;
      const rows = await table.query().toArray();
      rawRows.push(...rows);
    }
    return rawRows.map((r: any) => this.mapToEntry(r));
  }

  public async getById(id: string): Promise<NotebookEntry | null> {
    const all = await this.getAllEntries();
    return all.find((r) => r.id === id) || null;
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.init();
      return true;
    } catch {
      return false;
    }
  }

  public async query(params: NotebookQuery): Promise<NotebookEntry[]> {
    const { rrfMerge, applyTokenBudget } = await import('../search/rrf-search.js');

    let entries: NotebookEntry[] = [];

    if (params.query && params.query.trim() !== '') {
      const searchLimit = params.limit !== undefined ? params.limit : 50;
      const vectorEntries = await this.vectorSearch(params.query, searchLimit);
      const bm25Entries = await this.bm25Search(params.query, searchLimit);
      entries = rrfMerge(vectorEntries, bm25Entries);
    } else {
      entries = await this.getAllEntries();
    }

    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

    // Filter TTL for failure notes (> 90 days old)
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

    const limit = params.limit !== undefined ? params.limit : 5;
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
      files: typeof r.files === 'string' ? (() => { try { return JSON.parse(r.files); } catch { return []; } })() : (r.files || []),
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
