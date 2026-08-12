import { Client, createClient } from '@libsql/client';

export class LibSQLDatabaseManager {
  private connections: Map<string, Client> = new Map();

  public getConnection(dbPath: string): Client {
    let client = this.connections.get(dbPath);
    if (!client) {
      // In a real environment we might configure auth token or different URL scheme
      client = createClient({ url: `file:${dbPath}` });
      this.connections.set(dbPath, client);
    }
    return client;
  }

  public async runMigration(client: Client, sql: string): Promise<void> {
    await client.executeMultiple(sql);
  }

  public async close(dbPath: string): Promise<void> {
    const client = this.connections.get(dbPath);
    if (client) {
      client.close();
      this.connections.delete(dbPath);
    }
  }

  public async closeAll(): Promise<void> {
    for (const [dbPath, client] of this.connections.entries()) {
      client.close();
      this.connections.delete(dbPath);
    }
  }
}
