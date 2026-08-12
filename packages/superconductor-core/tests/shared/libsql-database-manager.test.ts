import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LibSQLDatabaseManager } from '../../src/shared/libsql-database-manager';
import * as libsql from '@libsql/client';
import { InMemoryLibSQLClient } from '../../src/test-utils/in-memory-libsql-client';

vi.mock('@libsql/client', () => ({
  createClient: vi.fn(() => new InMemoryLibSQLClient())
}));

describe('LibSQLDatabaseManager', () => {
  let manager: LibSQLDatabaseManager;

  beforeEach(() => {
    manager = new LibSQLDatabaseManager();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Close any connections we might have created
    await manager.closeAll();
  });

  it('should create a new connection if it does not exist', () => {
    const client = manager.getConnection('test.db');
    expect(client).toBeDefined();
    expect(libsql.createClient).toHaveBeenCalledWith({ url: 'file:test.db' });
  });

  it('should reuse an existing connection for the same dbPath', () => {
    const client1 = manager.getConnection('test.db');
    const client2 = manager.getConnection('test.db');
    
    expect(client1).toBe(client2);
    expect(libsql.createClient).toHaveBeenCalledTimes(1);
  });

  it('should run a migration on the client', async () => {
    const client = manager.getConnection('test.db') as InMemoryLibSQLClient;
    const migrationSql = 'CREATE TABLE test (id INTEGER PRIMARY KEY);';
    
    await manager.runMigration(client, migrationSql);
    
    expect(client.queries).toContainEqual(migrationSql);
  });

  it('should close a specific connection and remove it from the pool', async () => {
    const client = manager.getConnection('test.db');
    expect(libsql.createClient).toHaveBeenCalledTimes(1);
    
    await manager.close('test.db');
    
    expect((client as InMemoryLibSQLClient).closed).toBe(true);
    
    // Getting again should create a new connection
    const client2 = manager.getConnection('test.db');
    expect(client2).not.toBe(client);
    expect(libsql.createClient).toHaveBeenCalledTimes(2);
  });

  it('should ignore closing a non-existent connection', async () => {
    await expect(manager.close('non-existent.db')).resolves.not.toThrow();
  });
});
