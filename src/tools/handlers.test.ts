import { describe, expect, mock, test } from 'bun:test';
import { ToolHandlers } from './handlers.js';
import type SqlServerConnectionManager from '../db/connection.js';
import type { Logger } from '../types/index.js';

function createMockDb(): SqlServerConnectionManager {
  return {
    query: mock(async () => ({
      recordset: [{ id: 1, name: 'Test User' }],
      rowsAffected: [1],
    })),
    execute: mock(async () => ({
      rowsAffected: [1],
    })),
  } as unknown as SqlServerConnectionManager;
}

const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('ToolHandlers - handleQuery', () => {
  test('rejects empty or whitespace query', async () => {
    const handlers = new ToolHandlers(createMockDb(), mockLogger, false);
    const result = await handlers.handleQuery({ query: '   ' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('non-empty string');
  });

  test('allows standard SELECT queries when allowMutations is false', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, false);
    const result = await handlers.handleQuery({ query: 'SELECT id, name FROM users WHERE id = 1' });
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.columns).toEqual(['id', 'name']);
  });

  test('allows CTE (WITH ... SELECT) queries without false positives when allowMutations is false', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, false);
    const query = `
      WITH active_users AS (
        SELECT id, name FROM users WHERE active = 1
      )
      SELECT * FROM active_users;
    `;
    const result = await handlers.handleQuery({ query });
    expect(result.success).toBe(true);
  });

  test('allows queries with leading comments without false positives', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, false);
    const query = `
      -- Inisialisasi pengecekan
      /* Multi-line
         comment describing query */
      SELECT * FROM audit_log WHERE action = 'INSERT';
    `;
    const result = await handlers.handleQuery({ query });
    expect(result.success).toBe(true);
  });

  test('allows temporary table staging queries as read-only', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, false);
    const query = `
      SELECT id, name INTO #temp_users FROM users WHERE active = 1;
      SELECT * FROM #temp_users;
      DROP TABLE #temp_users;
    `;
    const result = await handlers.handleQuery({ query });
    expect(result.success).toBe(true);
  });

  test('blocks permanent mutation (INSERT/UPDATE/DELETE/DROP) when allowMutations is false', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, false);
    const result = await handlers.handleQuery({ query: 'DELETE FROM users WHERE id = 1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Mutations are disabled');
  });

  test('redirects permanent mutations to execute-statement even when allowMutations is true', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, true);
    const result = await handlers.handleQuery({ query: 'UPDATE users SET active = 0 WHERE id = 1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Use execute-statement');
  });
});

describe('ToolHandlers - handleExecute', () => {
  test('rejects empty statement', async () => {
    const handlers = new ToolHandlers(createMockDb(), mockLogger, false);
    const result = await handlers.handleExecute({ statement: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('non-empty string');
  });

  test('allows temporary table operations (CREATE #temp, INSERT #temp, DROP #temp) when allowMutations is false', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, false);

    const createTemp = await handlers.handleExecute({
      statement: 'CREATE TABLE #temp (id INT, label VARCHAR(50))',
    });
    expect(createTemp.success).toBe(true);

    const insertTemp = await handlers.handleExecute({
      statement: 'INSERT INTO #temp (id, label) VALUES (1, @val)',
      params: { val: 'test' },
    });
    expect(insertTemp.success).toBe(true);

    const dropTemp = await handlers.handleExecute({
      statement: 'DROP TABLE #temp',
    });
    expect(dropTemp.success).toBe(true);
  });

  test('allows session SET and DECLARE commands when allowMutations is false', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, false);

    const setNocount = await handlers.handleExecute({ statement: 'SET NOCOUNT ON;' });
    expect(setNocount.success).toBe(true);

    const declareTable = await handlers.handleExecute({
      statement: 'DECLARE @temp TABLE (id INT);',
    });
    expect(declareTable.success).toBe(true);
  });

  test('blocks permanent table mutations when allowMutations is false', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, false);

    const deleteResult = await handlers.handleExecute({ statement: 'DELETE FROM users WHERE id = 1' });
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.error).toContain('Mutations are disabled');

    const dropResult = await handlers.handleExecute({ statement: 'DROP TABLE users' });
    expect(dropResult.success).toBe(false);
    expect(dropResult.error).toContain('Mutations are disabled');
  });

  test('allows permanent table mutations when allowMutations is true', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, true);

    const updateResult = await handlers.handleExecute({
      statement: 'UPDATE users SET name = @name WHERE id = @id',
      params: { name: 'New Name', id: 1 },
    });
    expect(updateResult.success).toBe(true);
    expect(updateResult.rowsAffected).toBe(1);
  });

  test('allows statement with leading comments', async () => {
    const db = createMockDb();
    const handlers = new ToolHandlers(db, mockLogger, false);

    const result = await handlers.handleExecute({
      statement: '-- Set configuration\nSET NOCOUNT ON;',
    });
    expect(result.success).toBe(true);
  });

  describe('additive mode (allowAdditive = true, allowMutations = false)', () => {
    test('permits permanent INSERT statements', async () => {
      const db = createMockDb();
      const handlers = new ToolHandlers(db, mockLogger, { allowMutations: false, allowAdditive: true });

      const result = await handlers.handleExecute({
        statement: 'INSERT INTO audit_log (action, details) VALUES (@action, @details)',
        params: { action: 'LOGIN', details: 'User logged in' },
      });
      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(1);
    });

    test('STRICTLY BLOCKS UPDATE statements with specific error ("aditif ga boleh update")', async () => {
      const db = createMockDb();
      const handlers = new ToolHandlers(db, mockLogger, { allowMutations: false, allowAdditive: true });

      const result = await handlers.handleExecute({
        statement: 'UPDATE users SET is_active = 0 WHERE id = 1',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('UPDATE statements are not allowed in additive mode');
    });

    test('STRICTLY BLOCKS ALTER statements with specific error ("aditif ga boleh alter")', async () => {
      const db = createMockDb();
      const handlers = new ToolHandlers(db, mockLogger, { allowMutations: false, allowAdditive: true });

      const result = await handlers.handleExecute({
        statement: 'ALTER TABLE users ADD test_col INT',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('ALTER statements are not allowed in additive mode');
    });

    test('blocks destructive operations (DELETE, DROP, TRUNCATE)', async () => {
      const db = createMockDb();
      const handlers = new ToolHandlers(db, mockLogger, { allowMutations: false, allowAdditive: true });

      const del = await handlers.handleExecute({ statement: 'DELETE FROM users WHERE id = 1' });
      expect(del.success).toBe(false);
      expect(del.error).toContain('restricted to additive operations');

      const drop = await handlers.handleExecute({ statement: 'DROP TABLE users' });
      expect(drop.success).toBe(false);
      expect(drop.error).toContain('restricted to additive operations');
    });

    test('handleQuery redirects INSERT statements to execute-statement in additive mode', async () => {
      const db = createMockDb();
      const handlers = new ToolHandlers(db, mockLogger, { allowMutations: false, allowAdditive: true });

      const result = await handlers.handleQuery({
        query: 'INSERT INTO audit_log (msg) VALUES (\'test\')',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Use execute-statement for INSERT statements');
    });
  });
});

describe('ToolHandlers - handleQuery error hints', () => {
  function createFailingDb(message: string, metadata: Record<string, Record<string, unknown>[]>) {
    return {
      query: mock(async () => {
        throw new Error(message);
      }),
      getMetadata: mock(async (type: string) => metadata[type] ?? []),
    } as unknown as SqlServerConnectionManager;
  }

  test('suggests the closest real column when a column name is invalid', async () => {
    const db = createFailingDb("Invalid column name 'tgl_bayr'.", {
      columns: [{ name: 'tgl_bayar' }, { name: 'nama' }],
    });
    const handlers = new ToolHandlers(db, mockLogger, false);
    const result = await handlers.handleQuery({ query: 'SELECT tgl_bayr FROM pembayaran' });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid column name 'tgl_bayr'");
    expect(result.error).toContain('Did you mean: tgl_bayar');
  });

  test('suggests the closest real table when an object name is invalid', async () => {
    const db = createFailingDb("Invalid object name 'pelanggann'.", {
      tables: [{ name: 'pelanggan' }, { name: 'tagihan' }],
    });
    const handlers = new ToolHandlers(db, mockLogger, false);
    const result = await handlers.handleQuery({ query: 'SELECT * FROM pelanggann' });
    expect(result.error).toContain('Did you mean: pelanggan');
  });

  test('keeps the original error when the metadata lookup itself fails', async () => {
    const db = {
      query: mock(async () => {
        throw new Error("Invalid column name 'x'.");
      }),
      getMetadata: mock(async () => {
        throw new Error('metadata down');
      }),
    } as unknown as SqlServerConnectionManager;
    const handlers = new ToolHandlers(db, mockLogger, false);
    const result = await handlers.handleQuery({ query: 'SELECT x FROM t' });
    expect(result.error).toBe("Invalid column name 'x'.");
  });

  test('leaves unrelated errors untouched', async () => {
    const db = createFailingDb('Incorrect syntax near FROM.', {});
    const handlers = new ToolHandlers(db, mockLogger, false);
    const result = await handlers.handleQuery({ query: 'SELECT FROM' });
    expect(result.error).toBe('Incorrect syntax near FROM.');
  });
});

describe('ToolHandlers - handleExecute parameter hints', () => {
  test('explains a missing parameter using the parameters the SQL references', async () => {
    const db = {
      execute: mock(async () => {
        throw new Error('Must declare the scalar variable "@nilai".');
      }),
    } as unknown as SqlServerConnectionManager;
    const handlers = new ToolHandlers(db, mockLogger, true);
    const result = await handlers.handleExecute({
      statement: 'INSERT INTO t (a) VALUES (@nilai)',
      params: { value: 1 },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Parameter 'nilai' was not provided. Accepted: nilai. Received: value (unknown: value).");
  });
});
