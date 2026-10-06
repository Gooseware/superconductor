import { describe, it, expect, afterEach } from 'vitest';
import { InMemorySQLiteSandbox } from './in-memory-sqlite-sandbox.js';

describe('InMemorySQLiteSandbox', () => {
  let sandbox: InMemorySQLiteSandbox | null = null;

  afterEach(async () => {
    if (sandbox) {
      await sandbox.close();
      sandbox = null;
    }
  });

  it('initializes in-memory sqlite and enables foreign keys by default', async () => {
    sandbox = await InMemorySQLiteSandbox.create();
    const fkEnabled = await sandbox.isForeignKeysEnabled();
    expect(fkEnabled).toBe(true);
  });

  it('enforces foreign key constraints strictly', async () => {
    const schema = `
      CREATE TABLE parent (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES parent(id)
      );
    `;

    sandbox = await InMemorySQLiteSandbox.create({ schema });

    // Inserting valid parent then child should succeed
    await sandbox.execute({
      sql: 'INSERT INTO parent (id, name) VALUES (?, ?);',
      args: [1, 'parent1'],
    });
    await sandbox.execute({
      sql: 'INSERT INTO child (id, parent_id) VALUES (?, ?);',
      args: [10, 1],
    });

    // Inserting child referencing nonexistent parent should throw foreign key error
    await expect(
      sandbox.execute({
        sql: 'INSERT INTO child (id, parent_id) VALUES (?, ?);',
        args: [20, 999],
      })
    ).rejects.toThrow();
  });

  it('enforces CHECK constraints and column constraints', async () => {
    const schema = `
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        balance INTEGER NOT NULL CHECK (balance >= 0)
      );
    `;

    sandbox = await InMemorySQLiteSandbox.create({ schema });

    // Positive balance succeeds
    await sandbox.execute({
      sql: 'INSERT INTO accounts (id, balance) VALUES (?, ?);',
      args: [1, 100],
    });

    // Negative balance violates CHECK constraint
    await expect(
      sandbox.execute({
        sql: 'INSERT INTO accounts (id, balance) VALUES (?, ?);',
        args: [2, -50],
      })
    ).rejects.toThrow();
  });

  it('applies multiple schemas and supports batch operations', async () => {
    sandbox = await InMemorySQLiteSandbox.create({
      schema: [
        'CREATE TABLE t1 (id INTEGER PRIMARY KEY, v TEXT);',
        'CREATE TABLE t2 (id INTEGER PRIMARY KEY, v TEXT);',
      ],
    });

    await sandbox.batch([
      { sql: 'INSERT INTO t1 (id, v) VALUES (?, ?);', args: [1, 'a'] },
      { sql: 'INSERT INTO t2 (id, v) VALUES (?, ?);', args: [1, 'b'] },
    ]);

    const r1 = await sandbox.execute('SELECT * FROM t1;');
    expect(r1.rows.length).toBe(1);
    expect(r1.rows[0].v).toBe('a');

    const r2 = await sandbox.execute('SELECT * FROM t2;');
    expect(r2.rows.length).toBe(1);
    expect(r2.rows[0].v).toBe('b');
  });

  it('disallows queries after close', async () => {
    sandbox = await InMemorySQLiteSandbox.create();
    await sandbox.close();

    await expect(sandbox.execute('SELECT 1;')).rejects.toThrow(/closed/);
  });
});
