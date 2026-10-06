import { createClient, type Client, type InStatement, type ResultSet } from '@libsql/client';
import * as fs from 'node:fs';

export interface InMemorySQLiteSandboxOptions {
  /**
   * One or more SQL DDL statements or migration scripts to apply upon initialization.
   */
  schema?: string | string[];

  /**
   * File paths to SQL files to read and execute upon initialization.
   */
  schemaFiles?: string[];

  /**
   * Whether to enforce PRAGMA foreign_keys = ON; (default: true).
   */
  pragmaForeignKeys?: boolean;
}

/**
 * InMemorySQLiteSandbox sets up an isolated, in-memory SQLite database (`:memory:`)
 * configured with strict relational invariants: PRAGMA foreign_keys = ON, CHECK constraints,
 * and pre-applied schema/DDL migrations.
 */
export class InMemorySQLiteSandbox {
  private client: Client;
  private closed = false;

  private constructor(client: Client) {
    this.client = client;
  }

  /**
   * Creates and initializes a new InMemorySQLiteSandbox.
   */
  public static async create(
    options: InMemorySQLiteSandboxOptions = {}
  ): Promise<InMemorySQLiteSandbox> {
    const client = createClient({ url: ':memory:' });
    const sandbox = new InMemorySQLiteSandbox(client);
    await sandbox.initialize(options);
    return sandbox;
  }

  private async initialize(options: InMemorySQLiteSandboxOptions): Promise<void> {
    const foreignKeys = options.pragmaForeignKeys !== false;
    if (foreignKeys) {
      await this.client.execute('PRAGMA foreign_keys = ON;');
    }

    if (options.schema) {
      if (Array.isArray(options.schema)) {
        for (const stmt of options.schema) {
          if (stmt && stmt.trim()) {
            await this.client.executeMultiple(stmt);
          }
        }
      } else if (options.schema.trim()) {
        await this.client.executeMultiple(options.schema);
      }
    }

    if (options.schemaFiles && options.schemaFiles.length > 0) {
      for (const filePath of options.schemaFiles) {
        if (fs.existsSync(filePath)) {
          const sql = fs.readFileSync(filePath, 'utf-8');
          if (sql && sql.trim()) {
            await this.client.executeMultiple(sql);
          }
        } else {
          throw new Error(`Schema file not found: ${filePath}`);
        }
      }
    }
  }

  /**
   * Returns the underlying LibSQL client.
   */
  public getClient(): Client {
    this.assertOpen();
    return this.client;
  }

  /**
   * Executes a single SQL statement.
   */
  public async execute(stmt: InStatement): Promise<ResultSet> {
    this.assertOpen();
    return this.client.execute(stmt);
  }

  /**
   * Executes multiple SQL statements separated by semicolons.
   */
  public async executeMultiple(sql: string): Promise<void> {
    this.assertOpen();
    await this.client.executeMultiple(sql);
  }

  /**
   * Executes a batch of statements.
   */
  public async batch(
    stmts: InStatement[],
    mode?: 'write' | 'read' | 'deferred'
  ): Promise<ResultSet[]> {
    this.assertOpen();
    return this.client.batch(stmts, mode);
  }

  /**
   * Verifies whether foreign keys are currently enabled in the SQLite database.
   */
  public async isForeignKeysEnabled(): Promise<boolean> {
    this.assertOpen();
    const result = await this.client.execute('PRAGMA foreign_keys;');
    if (result.rows && result.rows.length > 0) {
      const val = Object.values(result.rows[0])[0];
      return val === 1 || val === '1' || val === BigInt(1);
    }
    return false;
  }

  /**
   * Applies additional schema migrations to the in-memory database.
   */
  public async applySchema(schema: string | string[]): Promise<void> {
    this.assertOpen();
    if (Array.isArray(schema)) {
      for (const stmt of schema) {
        if (stmt && stmt.trim()) {
          await this.client.executeMultiple(stmt);
        }
      }
    } else if (schema.trim()) {
      await this.client.executeMultiple(schema);
    }
  }

  /**
   * Closes the in-memory database connection.
   */
  public async close(): Promise<void> {
    if (!this.closed) {
      this.client.close();
      this.closed = true;
    }
  }

  /**
   * Supports ES explicit resource management (using syntax).
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('InMemorySQLiteSandbox is closed');
    }
  }
}
