import Database from 'better-sqlite3';
import { EngineEventRecord, EventQuery, EventStoreConfig } from './event-store.types.js';
import { EngineEvent } from '../types/events.js';

export class EventStore {
  private db: Database.Database;

  constructor(config: EventStoreConfig) {
    this.db = new Database(config.dbPath);
    this.initializeSchema();
  }

  private initializeSchema() {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taskId TEXT,
        eventType TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_taskId ON events(taskId);
      CREATE INDEX IF NOT EXISTS idx_events_eventType ON events(eventType);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    `);
  }

  append(event: EngineEvent): number {
    const stmt = this.db.prepare(`
      INSERT INTO events (taskId, eventType, timestamp, payload)
      VALUES (?, ?, ?, ?)
    `);

    let taskId: string | null = null;
    
    if (event.detail && typeof event.detail === 'object' && 'taskId' in event.detail) {
      taskId = (event.detail as any).taskId;
    }

    const info = stmt.run(
      taskId,
      event.type,
      event.timestamp,
      JSON.stringify(event)
    );

    return info.lastInsertRowid as number;
  }

  getById(id: number): EngineEventRecord | undefined {
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      taskId: row.taskId,
      eventType: row.eventType,
      timestamp: row.timestamp,
      payload: JSON.parse(row.payload) as EngineEvent
    };
  }

  query(filter: EventQuery): EngineEventRecord[] {
    let sql = 'SELECT * FROM events WHERE 1=1';
    const params: any[] = [];

    if (filter.taskId) {
      sql += ' AND taskId = ?';
      params.push(filter.taskId);
    }
    if (filter.eventType) {
      sql += ' AND eventType = ?';
      params.push(filter.eventType);
    }
    if (filter.since !== undefined) {
      sql += ' AND timestamp >= ?';
      params.push(filter.since);
    }
    if (filter.until !== undefined) {
      sql += ' AND timestamp <= ?';
      params.push(filter.until);
    }

    sql += ' ORDER BY timestamp ASC, id ASC';

    const rows = this.db.prepare(sql).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      taskId: row.taskId,
      eventType: row.eventType,
      timestamp: row.timestamp,
      payload: JSON.parse(row.payload) as EngineEvent
    }));
  }

  reconstruct(toTimestamp?: number): any {
    let filter: EventQuery = {};
    if (toTimestamp !== undefined) {
      filter.until = toTimestamp;
    }
    
    const events = this.query(filter);
    
    const state = {
      tasks: new Set<string>()
    };

    for (const record of events) {
      const payload = record.payload;
      if (payload.type === 'scheduler') {
        const detail = payload.detail as any;
        if (detail.action === 'start' && detail.taskId) {
          state.tasks.add(detail.taskId);
        } else if (detail.action === 'end' && detail.taskId) {
          state.tasks.add(detail.taskId);
        }
      }
    }

    return state;
  }

  materializePlan(): string {
    const state = this.reconstruct();
    let plan = '# Generated Plan\n\n';
    
    for (const taskId of state.tasks) {
      plan += `- Task: ${taskId}\n`;
    }
    
    return plan;
  }

  close() {
    this.db.close();
  }
}
