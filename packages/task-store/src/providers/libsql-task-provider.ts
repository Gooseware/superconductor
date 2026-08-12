import { createClient, Client } from '@libsql/client';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { TaskResult, InvariantResult, OverrideResult } from '../types.js';

export class LibSQLTaskProvider {
  private client: Client;
  private initialized = false;

  constructor(workspacePath: string) {
    const resolvedWorkspace = path.resolve(workspacePath);
    const dbDir = path.join(resolvedWorkspace, '.superconductor');
    const targetPath = path.join(dbDir, 'tasks.db');

    if (!targetPath.startsWith(resolvedWorkspace)) {
      throw new Error(`Target path ${targetPath} is outside workspace boundary ${resolvedWorkspace}`);
    }

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.client = createClient({
      url: `file:${targetPath}`,
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
    track_id: string; title: string; description?: string;
    creates?: string[]; protected?: string[]; invariant_after?: string;
    dependencies?: string[]; tier?: string; agent?: string;
  }): Promise<{ id: string }> {
    if (!this.initialized) await this.init();
    const id = `task-${randomUUID()}`;
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

    let createdAnyInvariant = false;

    if (args.protected && args.protected.length > 0) {
      for (const p of args.protected) {
        await this.createInvariant({
          capability: args.invariant_after || args.title,
          path: p,
          rationale: args.description,
          track_id: args.track_id,
          task_id: id,
          status: 'active'
        });
      }
      createdAnyInvariant = true;
    }

    if (args.invariant_after) {
      if (args.creates && args.creates.length > 0) {
        for (const p of args.creates) {
          await this.createInvariant({
            capability: args.invariant_after,
            path: p,
            rationale: args.description,
            track_id: args.track_id,
            task_id: id,
            status: 'active'
          });
        }
      } else if (!createdAnyInvariant) {
        await this.createInvariant({
          capability: args.invariant_after,
          path: '*',
          rationale: args.description,
          track_id: args.track_id,
          task_id: id,
          status: 'active'
        });
      }
    }

    return { id };
  }

  async updateTask(args: {
    id: string; status?: 'pending'|'in_progress'|'completed'|'blocked'; committed_sha?: string;
  }): Promise<{ success: boolean }> {
    if (!this.initialized) await this.init();
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
    
    const result = await this.client.execute({
      sql: `UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`,
      args: sqlArgs
    });
    return { success: result.rowsAffected > 0 };
  }

  async deleteTask(id: string): Promise<void> {
    if (!this.initialized) await this.init();
    await this.client.batch([
      {
        sql: `DELETE FROM invariants WHERE task_id = ?`,
        args: [id]
      },
      {
        sql: `DELETE FROM tasks WHERE id = ?`,
        args: [id]
      }
    ], 'write');
  }


  async queryTasks(args: {
    track_id?: string; status?: string; agent?: string; limit?: number;
  }): Promise<Array<TaskResult>> {
    if (!this.initialized) await this.init();
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
    if (args.limit !== undefined) {
      sql += ' LIMIT ?';
      sqlArgs.push(args.limit);
    }

    const safeParse = (val: unknown): string[] | undefined => {
      if (typeof val !== 'string' || !val) return undefined;
      try {
        return JSON.parse(val);
      } catch (err) {
        console.error('Error parsing task field:', err);
        return undefined;
      }
    };

    const result = await this.client.execute({ sql, args: sqlArgs });
    return result.rows.map(row => ({
      ...row,
      creates: safeParse(row.creates),
      protected: safeParse(row.protected),
      dependencies: safeParse(row.dependencies)
    })) as unknown as TaskResult[];
  }

  async createInvariant(args: {
    capability: string; path: string; rationale?: string; track_id?: string;
    task_id?: string; removable_if?: string; status?: 'active'|'overridden'|'untriaged';
  }): Promise<{ id: string }> {
    if (!this.initialized) await this.init();
    const id = `inv-${randomUUID()}`;
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
    if (!this.initialized) await this.init();
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
    if (!this.initialized) await this.init();
    const id = `ovr-${randomUUID()}`;
    const now = Date.now();
    
    await this.client.batch([
      {
        sql: `INSERT INTO invariant_overrides (id, invariant_id, track_id, reason, status, created_at)
              VALUES (?, ?, ?, ?, 'active', ?)`,
        args: [id, args.invariant_id, args.track_id, args.reason, now]
      },
      {
        sql: `UPDATE invariants SET status = 'overridden', updated_at = ? WHERE id = ?`,
        args: [now, args.invariant_id]
      }
    ], 'write');

    return { override_id: id };
  }

  async queryOverrides(args: {
    invariant_id?: string;
    track_id?: string;
    status?: 'active' | 'revoked';
  }): Promise<Array<OverrideResult>> {
    if (!this.initialized) await this.init();
    let sql = 'SELECT * FROM invariant_overrides WHERE 1=1';
    const sqlArgs: any[] = [];
    if (args.invariant_id) {
      sql += ' AND invariant_id = ?';
      sqlArgs.push(args.invariant_id);
    }
    if (args.track_id) {
      sql += ' AND track_id = ?';
      sqlArgs.push(args.track_id);
    }
    if (args.status) {
      sql += ' AND status = ?';
      sqlArgs.push(args.status);
    }

    const result = await this.client.execute({ sql, args: sqlArgs });
    return result.rows as unknown as OverrideResult[];
  }
}

