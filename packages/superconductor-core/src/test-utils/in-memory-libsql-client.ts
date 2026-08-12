import { Client, ResultSet, InStatement, Transaction, IntMode } from "@libsql/client";

export class InMemoryLibSQLClient implements Client {
  public protocol: "http" | "ws" | "file" = "file";
  public closed = false;
  private db: any; // We could use better-sqlite3 internally or just mock it. Let's just mock responses.

  public queries: InStatement[] = [];

  constructor() {
    this.closed = false;
  }
  
  async execute(stmt: InStatement): Promise<ResultSet> {
    this.queries.push(stmt);
    return {
      columns: [],
      columnTypes: [],
      rows: [],
      rowsAffected: 0,
      lastInsertRowid: undefined,
      toJSON: () => ({
        columns: [],
        columnTypes: [],
        rows: [],
        rowsAffected: 0,
        lastInsertRowid: undefined
      })
    } as any;
  }
  
  async batch(stmts: InStatement[], mode?: "write" | "read" | "deferred"): Promise<ResultSet[]> {
    const results = [];
    for (const stmt of stmts) {
      results.push(await this.execute(stmt));
    }
    return results;
  }
  
  async transaction(mode?: "write" | "read" | "deferred"): Promise<Transaction> {
    throw new Error("Not implemented");
  }

  async executeMultiple(sql: string): Promise<void> {
    this.queries.push(sql);
  }

  async sync(): Promise<any> {
    return { frame_no: 0, frames_synced: 0 };
  }

  async migrate(stmts: InStatement[]): Promise<ResultSet[]> {
    return this.batch(stmts);
  }
  
  reconnect(): void {}
  
  close(): void {
    this.closed = true;
  }
}
