import * as path from 'node:path';
import * as fs from 'node:fs';
import { Schema, Field, Utf8, FixedSizeList, Float32 } from 'apache-arrow';
import { TaskProvider, TaskResult, InvariantResult, OverrideResult } from '../types.js';
import { LibSQLTaskProvider } from './libsql-task-provider.js';

export class LanceDBTaskProvider implements TaskProvider {
  private inner: LibSQLTaskProvider;
  private lancedbPath: string;
  private connection: any = null;
  private table: any = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  
  constructor(workspacePath: string) {
    const resolvedWorkspace = path.resolve(workspacePath);
    this.inner = new LibSQLTaskProvider(workspacePath);
    this.lancedbPath = path.join(resolvedWorkspace, '.superconductor', 'lancedb');
    if (!this.lancedbPath.startsWith(resolvedWorkspace)) {
      throw new Error(`Target path ${this.lancedbPath} is outside workspace boundary ${resolvedWorkspace}`);
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      await this.inner.init();
      
      fs.mkdirSync(this.lancedbPath, { recursive: true });
      const lancedb = await import('@lancedb/lancedb');
      this.connection = await lancedb.connect(this.lancedbPath);

      const taskSchema = new Schema([
        new Field("id", new Utf8(), false),
        new Field("track_id", new Utf8(), false),
        new Field("title", new Utf8(), false),
        new Field("description", new Utf8(), true),
        new Field("status", new Utf8(), true),
        new Field("agent", new Utf8(), true),
        new Field("vector", new FixedSizeList(1536, new Field("item", new Float32(), false)), false)
      ]);

      const tableNames = await this.connection.tableNames();
      if (tableNames.includes('tasks')) {
        this.table = await this.connection.openTable('tasks');
      } else {
        try {
          this.table = await this.connection.createEmptyTable('tasks', taskSchema);
        } catch (err: any) {
          if (err?.message?.includes('already exists')) {
            this.table = await this.connection.openTable('tasks');
          } else {
            throw err;
          }
        }
      }
      this.initialized = true;
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  async close(): Promise<void> {
    await this.inner.close();
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    this.table = null;
    this.initialized = false;
    this.initPromise = null;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const DIM = 1536;
    const vector = new Array(DIM).fill(0);
    const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
    
    if (tokens.length === 0) {
      return vector;
    }

    for (const token of tokens) {
      let hash = 5381;
      for (let i = 0; i < token.length; i++) {
        hash = ((hash << 5) + hash) + token.charCodeAt(i);
        hash = hash & hash;
      }
      const idx = Math.abs(hash) % DIM;
      vector[idx] += 1;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < DIM; i++) {
        vector[i] = vector[i] / magnitude;
      }
    }

    return vector;
  }

  async createTask(args: {
    track_id: string; title: string; description?: string;
    creates?: string[]; protected?: string[]; invariant_after?: string;
    dependencies?: string[]; tier?: string; agent?: string;
  }): Promise<{ id: string }> {
    if (!this.initialized) await this.init();
    const res = await this.inner.createTask(args);
    
    try {
      const vector = await this.generateEmbedding(`${args.title} ${args.description || ''}`);
      await this.table.add([{
        id: res.id,
        track_id: args.track_id,
        title: args.title,
        description: args.description || null,
        status: 'pending',
        agent: args.agent || null,
        vector
      }]);
    } catch (err) {
      try {
        await this.inner.deleteTask(res.id);
      } catch {
        // ignore rollback error
      }
      throw err;
    }
    
    return res;
  }

  async updateTask(args: {
    id: string; status?: 'pending' | 'in_progress' | 'completed' | 'blocked'; committed_sha?: string;
  }): Promise<{ success: boolean }> {
    if (!this.initialized) await this.init();

    const existingTasks = await this.inner.queryTasks({});
    const previousTask = existingTasks.find(t => t.id === args.id);

    const res = await this.inner.updateTask(args);
    if (res.success && args.status && this.table) {
      try {
        await this.table.update({
          where: `id = '${args.id.replace(/'/g, "''")}'`,
          values: { status: args.status }
        });
      } catch (err) {
        if (previousTask) {
          try {
            await this.inner.updateTask({
              id: args.id,
              status: previousTask.status,
              committed_sha: previousTask.committed_sha
            });
          } catch {
            // ignore rollback error
          }
        }
        throw err;
      }
    }
    return res;
  }

  async queryTasks(args: {
    track_id?: string; status?: string; agent?: string; semantic_query?: string; limit?: number;
  }): Promise<TaskResult[]> {
    if (!this.initialized) await this.init();

    if (args.semantic_query) {
      const vector = await this.generateEmbedding(args.semantic_query);
      const searchLimit = args.limit !== undefined ? args.limit : 50;
      
      let query = this.table.search(vector);

      const whereClauses: string[] = [];
      if (args.track_id) {
        whereClauses.push(`track_id = '${args.track_id.replace(/'/g, "''")}'`);
      }
      if (args.status) {
        whereClauses.push(`status = '${args.status.replace(/'/g, "''")}'`);
      }
      if (args.agent) {
        whereClauses.push(`agent = '${args.agent.replace(/'/g, "''")}'`);
      }

      if (whereClauses.length > 0) {
        query = query.where(whereClauses.join(' AND '));
      }

      query = query.limit(searchLimit);
      
      const searchResults = await query.toArray();
      
      if (searchResults.length === 0) return [];
      
      const ids = searchResults.map((r: any) => r.id);
      
      const innerResults = await this.inner.queryTasks({
        track_id: args.track_id,
        status: args.status,
        agent: args.agent
      });
      
      const idMap = new Map(innerResults.map(t => [t.id, t]));
      return ids.map((id: string) => idMap.get(id)).filter(Boolean) as TaskResult[];
    }
    
    return await this.inner.queryTasks({
      track_id: args.track_id,
      status: args.status,
      agent: args.agent,
      limit: args.limit
    });
  }

  async createInvariant(args: {
    capability: string; path: string; rationale?: string; track_id?: string;
    task_id?: string; removable_if?: string; status?: 'active'|'overridden'|'untriaged';
  }): Promise<{ id: string }> {
    if (!this.initialized) await this.init();
    return await this.inner.createInvariant(args);
  }

  async queryInvariants(args: {
    status?: 'active'|'overridden'|'untriaged'; path?: string; capability?: string; track_id?: string;
  }): Promise<InvariantResult[]> {
    if (!this.initialized) await this.init();
    return await this.inner.queryInvariants(args);
  }

  async createOverride(args: {
    invariant_id: string; track_id: string; reason: string;
  }): Promise<{ override_id: string }> {
    if (!this.initialized) await this.init();
    return await this.inner.createOverride(args);
  }

  async queryOverrides(args: {
    invariant_id?: string; track_id?: string; status?: 'active' | 'revoked';
  }): Promise<OverrideResult[]> {
    if (!this.initialized) await this.init();
    return await this.inner.queryOverrides(args);
  }
}
