import { createClient, Client } from '@libsql/client';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { TaskResult, InvariantResult, OverrideResult } from '../types.js';

export class LibSQLTaskProvider {
  private client: Client;
  private initialized = false;

  constructor(workspacePath: string) {
    const dbDir = path.join(workspacePath, '.superconductor');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'tasks.db');
    
    this.client = createClient({
      url: `file:${dbPath}`,
    });
  }

  async init() {
    if (this.initialized) return;

    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        creates TEXT, 
        protected TEXT, 
        invariant_after TEXT,
        dependencies TEXT, 
        status TEXT DEFAULT 'pending', 
        tier TEXT,
        agent TEXT,
        committed_sha TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_track ON tasks(track_id);`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`);

    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS invariants (
        id TEXT PRIMARY KEY,
        capability TEXT NOT NULL,
        path TEXT NOT NULL,
        rationale TEXT,
        track_id TEXT,
        task_id TEXT,
        removable_if TEXT,
        status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_invariants_path ON invariants(path);`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_invariants_status ON invariants(status);`);

    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS invariant_overrides (
        id TEXT PRIMARY KEY,
        invariant_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL,
        FOREIGN KEY(invariant_id) REFERENCES invariants(id)
      );
    `);
    
    this.initialized = true;
  }

  async close() {
    this.client.close();
  }

  async createTask(args: {
    track_id: string; title: string; description: string;
    creates?: string[]; protected?: string[]; invariant_after?: string;
    dependencies?: string[]; tier?: string; agent?: string;
  }): Promise<{ id: string }> {
    const id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO tasks (
        id, track_id, title, description, creates, protected, invariant_after, 
        dependencies, tier, agent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, args.track_id, args.title, args.description || null,
        args.creates ? JSON.stringify(args.creates) : null,
        args.protected ? JSON.stringify(args.protected) : null,
        args.invariant_after || null,
        args.dependencies ? JSON.stringify(args.dependencies) : null,
        args.tier || null, args.agent || null, now, now
      ]
    });
    return { id };
  }

  async updateTask(args: {
    id: string; status?: 'pending'|'in_progress'|'completed'|'blocked'; committed_sha?: string;
  }): Promise<{ success: boolean }> {
    const sets = [];
    const sqlArgs: any[] = [];
    if (args.status) {
      sets.push('status = ?');
      sqlArgs.push(args.status);
    }
    if (args.committed_sha !== undefined) {
      sets.push('committed_sha = ?');
      sqlArgs.push(args.committed_sha);
    }
    if (sets.length === 0) return { success: true };
    sets.push('updated_at = ?');
    sqlArgs.push(Date.now());
    sqlArgs.push(args.id);
    
    await this.client.execute({
      sql: `UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`,
      args: sqlArgs
    });
    return { success: true };
  }

  async queryTasks(args: {
    track_id?: string; status?: string; agent?: string; limit?: number;
  }): Promise<Array<TaskResult>> {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const sqlArgs: any[] = [];
    if (args.track_id) {
      sql += ' AND track_id = ?';
      sqlArgs.push(args.track_id);
    }
    if (args.status) {
      sql += ' AND status = ?';
      sqlArgs.push(args.status);
    }
    if (args.agent) {
      sql += ' AND agent = ?';
      sqlArgs.push(args.agent);
    }
    if (args.limit) {
      sql += ' LIMIT ?';
      sqlArgs.push(args.limit);
    }

    const result = await this.client.execute({ sql, args: sqlArgs });
    return result.rows.map(row => ({
      ...row,
      creates: row.creates ? JSON.parse(row.creates as string) : undefined,
      protected: row.protected ? JSON.parse(row.protected as string) : undefined,
      dependencies: row.dependencies ? JSON.parse(row.dependencies as string) : undefined
    })) as unknown as TaskResult[];
  }

  async createInvariant(args: {
    capability: string; path: string; rationale?: string; track_id?: string;
    task_id?: string; removable_if?: string; status?: 'active'|'overridden'|'untriaged';
  }): Promise<{ id: string }> {
    const id = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO invariants (
        id, capability, path, rationale, track_id, task_id, removable_if, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, args.capability, args.path, args.rationale || null, args.track_id || null,
        args.task_id || null, args.removable_if || null, args.status || 'active', now, now
      ]
    });
    return { id };
  }

  async queryInvariants(args: {
    status?: 'active'|'overridden'|'untriaged'; path?: string; capability?: string; track_id?: string;
  }): Promise<Array<InvariantResult>> {
    let sql = 'SELECT * FROM invariants WHERE 1=1';
    const sqlArgs: any[] = [];
    if (args.status) {
      sql += ' AND status = ?';
      sqlArgs.push(args.status);
    }
    if (args.path) {
      sql += ' AND path = ?';
      sqlArgs.push(args.path);
    }
    if (args.capability) {
      sql += ' AND capability = ?';
      sqlArgs.push(args.capability);
    }
    if (args.track_id) {
      sql += ' AND track_id = ?';
      sqlArgs.push(args.track_id);
    }

    const result = await this.client.execute({ sql, args: sqlArgs });
    return result.rows as unknown as InvariantResult[];
  }

  async createOverride(args: {
    invariant_id: string; track_id: string; reason: string;
  }): Promise<{ override_id: string }> {
    const id = `ovr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    // start transaction if possible, or just two statements
    await this.client.execute({
      sql: `INSERT INTO invariant_overrides (id, invariant_id, track_id, reason, status, created_at)
            VALUES (?, ?, ?, ?, 'active', ?)`,
      args: [id, args.invariant_id, args.track_id, args.reason, now]
    });
    
    await this.client.execute({
      sql: `UPDATE invariants SET status = 'overridden', updated_at = ? WHERE id = ?`,
      args: [now, args.invariant_id]
    });

    return { override_id: id };
  }
}
