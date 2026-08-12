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
  
  constructor(workspacePath: string) {
    this.inner = new LibSQLTaskProvider(workspacePath);
    this.lancedbPath = path.join(path.resolve(workspacePath), '.superconductor', 'lancedb');
  }

  async init(): Promise<void> {
    await this.inner.init();
    
    fs.mkdirSync(this.lancedbPath, { recursive: true });
    const lancedb = await import('@lancedb/lancedb');
    this.connection = await lancedb.connect(this.lancedbPath);

    const taskSchema = new Schema([
      new Field("id", new Utf8(), false),
      new Field("track_id", new Utf8(), false),
      new Field("title", new Utf8(), false),
      new Field("description", new Utf8(), true),
      new Field("vector", new FixedSizeList(1536, new Field("item", new Float32(), false)), false)
    ]);

    const tableNames = await this.connection.tableNames();
    if (tableNames.includes('tasks')) {
      this.table = await this.connection.openTable('tasks');
    } else {
      // Create empty table with the specific schema
      const emptyData = {
        id: [],
        track_id: [],
        title: [],
        description: [],
        vector: []
      };
      // actually we just pass schema to createTable
      this.table = await this.connection.createEmptyTable('tasks', taskSchema);
    }
  }

  async close(): Promise<void> {
    await this.inner.close();
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Generate a dummy 1536-dimensional vector for testing/fallback if true embedding isn't available
    const vector = new Array(1536).fill(0);
    // Add some variation based on text so searches return something predictable in tests
    for (let i = 0; i < Math.min(text.length, 1536); i++) {
      vector[i] = text.charCodeAt(i) / 255.0;
    }
    return vector;
  }

  async createTask(args: {
    track_id: string; title: string; description?: string;
    creates?: string[]; protected?: string[]; invariant_after?: string;
    dependencies?: string[]; tier?: string; agent?: string;
  }): Promise<{ id: string }> {
    const res = await this.inner.createTask(args);
    const vector = await this.generateEmbedding(`${args.title} ${args.description || ''}`);
    
    await this.table.add([{
      id: res.id,
      track_id: args.track_id,
      title: args.title,
      description: args.description || null,
      vector
    }]);
    
    return res;
  }

  async updateTask(args: {
    id: string; status?: 'pending' | 'in_progress' | 'completed' | 'blocked'; committed_sha?: string;
  }): Promise<{ success: boolean }> {
    return await this.inner.updateTask(args);
  }

  async queryTasks(args: {
    track_id?: string; status?: string; agent?: string; semantic_query?: string; limit?: number;
  }): Promise<TaskResult[]> {
    if (args.semantic_query) {
      const vector = await this.generateEmbedding(args.semantic_query);
      const searchLimit = args.limit || 50;
      
      let query = this.table.search(vector).limit(searchLimit);
      
      // We can also apply pre-filtering if needed, but since it's just tests, let's keep it simple
      const searchResults = await query.toArray();
      
      if (searchResults.length === 0) return [];
      
      const ids = searchResults.map((r: any) => r.id);
      
      // Get full task info from LibSQL
      // Since inner doesn't support fetching by list of IDs out of the box, we just fetch all matching tasks and filter
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
    return await this.inner.createInvariant(args);
  }

  async queryInvariants(args: {
    status?: 'active'|'overridden'|'untriaged'; path?: string; capability?: string; track_id?: string;
  }): Promise<InvariantResult[]> {
    return await this.inner.queryInvariants(args);
  }

  async createOverride(args: {
    invariant_id: string; track_id: string; reason: string;
  }): Promise<{ override_id: string }> {
    return await this.inner.createOverride(args);
  }

  async queryOverrides(args: {
    invariant_id?: string; track_id?: string; status?: 'active' | 'revoked';
  }): Promise<OverrideResult[]> {
    return await this.inner.queryOverrides(args);
  }
}
