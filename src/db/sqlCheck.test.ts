import { describe, expect, test } from 'bun:test';
import { isAdditiveSql, isDestructiveSql, isReadOnlySql, stripSqlNoise } from './sqlCheck.js';

describe('stripSqlNoise', () => {
  test('strips line comments', () => {
    const sql = 'SELECT * FROM users -- inline comment\nWHERE id = 1';
    expect(stripSqlNoise(sql)).toBe('SELECT * FROM users  \nWHERE id = 1');
  });

  test('strips block comments', () => {
    const sql = 'SELECT /* ignore this */ id FROM users';
    expect(stripSqlNoise(sql)).toBe('SELECT   id FROM users');
  });

  test('strips string literals', () => {
    const sql = "SELECT * FROM logs WHERE action = 'INSERT' AND detail = 'DELETE'";
    expect(stripSqlNoise(sql)).toBe("SELECT * FROM logs WHERE action = '' AND detail = ''");
  });

  test('handles escaped single quotes in literals', () => {
    const sql = "SELECT * FROM tbl WHERE msg = 'don''t delete'";
    expect(stripSqlNoise(sql)).toBe("SELECT * FROM tbl WHERE msg = ''");
  });
});

describe('isReadOnlySql', () => {
  test('returns false for empty or non-string input', () => {
    expect(isReadOnlySql('')).toBe(false);
    expect(isReadOnlySql('   ')).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isReadOnlySql(null as any)).toBe(false);
  });

  test('returns true for simple SELECT query', () => {
    expect(isReadOnlySql('SELECT * FROM users')).toBe(true);
    expect(isReadOnlySql('select id, name from tb_pelanggan where no = @no')).toBe(true);
  });

  test('returns true for CTE (WITH ... SELECT)', () => {
    const query = `
      WITH cte AS (
        SELECT id, name FROM users WHERE active = 1
      )
      SELECT * FROM cte WHERE id = @id
    `;
    expect(isReadOnlySql(query)).toBe(true);
  });

  test('returns true for multi-definition CTE', () => {
    const query = `
      WITH active_users AS (
        SELECT id, username FROM users WHERE is_active = 1
      ),
      orders_summary AS (
        SELECT user_id, COUNT(*) AS cnt FROM orders GROUP BY user_id
      )
      SELECT u.username, o.cnt
      FROM active_users u
      JOIN orders_summary o ON u.id = o.user_id
    `;
    expect(isReadOnlySql(query)).toBe(true);
  });

  test('returns true for session SET commands followed by SELECT', () => {
    expect(isReadOnlySql('SET NOCOUNT ON; SELECT 1;')).toBe(true);
    expect(isReadOnlySql('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\nSELECT * FROM tb_pelanggan;')).toBe(true);
  });

  test('returns true when mutation keywords appear only inside string literals or comments', () => {
    expect(isReadOnlySql("SELECT * FROM audit WHERE action = 'DELETE'")).toBe(true);
    expect(isReadOnlySql("SELECT * FROM history WHERE command = 'DROP TABLE foo'")).toBe(true);
    expect(isReadOnlySql('-- DELETE FROM users\nSELECT * FROM users')).toBe(true);
    expect(isReadOnlySql('/* DROP TABLE x */ SELECT * FROM x')).toBe(true);
    expect(isReadOnlySql("SELECT * FROM status WHERE val = 'TRUNCATE TABLE users'")).toBe(true);
  });

  test('allows temporary table (#temp and ##temp) creation, staging, and cleanup as read-only', () => {
    expect(isReadOnlySql('CREATE TABLE #temp (id INT, name VARCHAR(100))')).toBe(true);
    expect(isReadOnlySql('CREATE TABLE ##global_temp (id INT)')).toBe(true);
    expect(isReadOnlySql('CREATE TABLE [#temp] (id INT)')).toBe(true);
    expect(isReadOnlySql('SELECT id, name INTO #temp_users FROM users')).toBe(true);
    expect(isReadOnlySql('SELECT id, name INTO [#temp_users] FROM users')).toBe(true);
    expect(isReadOnlySql('INSERT INTO #temp (id) VALUES (1)')).toBe(true);
    expect(isReadOnlySql('INSERT #temp (id) VALUES (1)')).toBe(true);
    expect(isReadOnlySql('UPDATE #temp SET name = @name WHERE id = 1')).toBe(true);
    expect(isReadOnlySql('UPDATE TOP (10) #temp SET name = @name')).toBe(true);
    expect(isReadOnlySql('DELETE FROM #temp WHERE id = 1')).toBe(true);
    expect(isReadOnlySql('DELETE #temp WHERE id = 1')).toBe(true);
    expect(isReadOnlySql('TRUNCATE TABLE #temp')).toBe(true);
    expect(isReadOnlySql('DROP TABLE #temp')).toBe(true);
    expect(isReadOnlySql('DROP TABLE IF EXISTS #temp')).toBe(true);
    expect(isReadOnlySql('DROP TABLE IF EXISTS [#temp]')).toBe(true);
  });

  test('allows table variable (@table) operations as read-only staging', () => {
    const script = `
      DECLARE @result TABLE (id INT, total DECIMAL(18,2));
      INSERT INTO @result (id, total) VALUES (1, 100.0);
      UPDATE @result SET total = 150.0 WHERE id = 1;
      DELETE FROM @result WHERE id = 2;
      SELECT * FROM @result;
    `;
    expect(isReadOnlySql(script)).toBe(true);
  });

  test('returns false for permanent INSERT, UPDATE, DELETE statements', () => {
    expect(isReadOnlySql('INSERT INTO users (name) VALUES (@name)')).toBe(false);
    expect(isReadOnlySql('INSERT users (name) VALUES (@name)')).toBe(false);
    expect(isReadOnlySql('UPDATE users SET name = @name WHERE id = @id')).toBe(false);
    expect(isReadOnlySql('DELETE FROM users WHERE id = @id')).toBe(false);
    expect(isReadOnlySql('DELETE users WHERE id = @id')).toBe(false);
  });

  test('returns false for permanent DDL statements (DROP, CREATE, ALTER, TRUNCATE)', () => {
    expect(isReadOnlySql('DROP TABLE users')).toBe(false);
    expect(isReadOnlySql('DROP TABLE IF EXISTS users')).toBe(false);
    expect(isReadOnlySql('CREATE TABLE temp (id INT)')).toBe(false);
    expect(isReadOnlySql('CREATE VIEW v_users AS SELECT * FROM users')).toBe(false);
    expect(isReadOnlySql('ALTER TABLE users ADD col INT')).toBe(false);
    expect(isReadOnlySql('TRUNCATE TABLE logs')).toBe(false);
  });

  test('returns false for SELECT ... INTO permanent table', () => {
    expect(isReadOnlySql('SELECT * INTO backup_users FROM users')).toBe(false);
    expect(isReadOnlySql('SELECT id, name INTO users_archive FROM users')).toBe(false);
  });

  test('returns false for EXEC / EXECUTE calls', () => {
    expect(isReadOnlySql('EXEC sp_some_proc @param = 1')).toBe(false);
    expect(isReadOnlySql('EXECUTE sp_another_proc')).toBe(false);
  });

  test('returns false for multi-statement queries containing permanent mutations', () => {
    expect(isReadOnlySql('SELECT 1; DROP TABLE users;')).toBe(false);
    expect(isReadOnlySql('CREATE TABLE #temp (id INT); DELETE FROM users;')).toBe(false);
  });
});

describe('isDestructiveSql', () => {
  test('returns false for non-string, empty, or pure SELECT queries', () => {
    expect(isDestructiveSql('')).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isDestructiveSql(null as any)).toBe(false);
    expect(isDestructiveSql('SELECT * FROM users')).toBe(false);
    expect(isDestructiveSql('UPDATE users SET name = @name WHERE id = @id')).toBe(false);
  });

  test('flags permanent DROP, TRUNCATE, DELETE as destructive', () => {
    expect(isDestructiveSql('DROP TABLE users')).toBe(true);
    expect(isDestructiveSql('DROP TABLE IF EXISTS users')).toBe(true);
    expect(isDestructiveSql('TRUNCATE TABLE audit_log')).toBe(true);
    expect(isDestructiveSql('DELETE FROM users WHERE id = 1')).toBe(true);
    expect(isDestructiveSql('DELETE users WHERE active = 0')).toBe(true);
  });

  test('does not flag temporary table cleanup as destructive', () => {
    expect(isDestructiveSql('DROP TABLE #temp')).toBe(false);
    expect(isDestructiveSql('DROP TABLE IF EXISTS #temp')).toBe(false);
    expect(isDestructiveSql('TRUNCATE TABLE #temp')).toBe(false);
    expect(isDestructiveSql('DELETE FROM #temp')).toBe(false);
    expect(isDestructiveSql('DELETE #temp')).toBe(false);
  });
});

describe('isAdditiveSql', () => {
  test('returns false for empty, whitespace, or invalid inputs', () => {
    expect(isAdditiveSql('')).toBe(false);
    expect(isAdditiveSql('   ')).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isAdditiveSql(null as any)).toBe(false);
  });

  test('permits read-only queries (SELECT, CTE, session SET)', () => {
    expect(isAdditiveSql('SELECT * FROM users')).toBe(true);
    expect(isAdditiveSql('WITH cte AS (SELECT 1 AS val) SELECT * FROM cte')).toBe(true);
    expect(isAdditiveSql('SET NOCOUNT ON; SELECT * FROM tb_pelanggan;')).toBe(true);
  });

  test('permits temporary table and table variable operations', () => {
    expect(isAdditiveSql('CREATE TABLE #temp (id INT); INSERT INTO #temp VALUES (1); DROP TABLE #temp;')).toBe(true);
    expect(isAdditiveSql('UPDATE #temp SET id = 2;')).toBe(true);
    expect(isAdditiveSql('DELETE FROM #temp WHERE id = 1;')).toBe(true);
  });

  test('permits INSERT into permanent tables (strictly additive)', () => {
    expect(isAdditiveSql('INSERT INTO users (name) VALUES (@name)')).toBe(true);
    expect(isAdditiveSql('INSERT users (name) VALUES (@name)')).toBe(true);
    expect(isAdditiveSql('INSERT TOP (10) INTO audit_log (msg) VALUES (@msg)')).toBe(true);
    expect(isAdditiveSql('INSERT TOP (10) audit_log (msg) VALUES (@msg)')).toBe(true);
  });

  test('STRICTLY DISALLOWS UPDATE statements on permanent tables ("aditif ga boleh update")', () => {
    expect(isAdditiveSql('UPDATE users SET name = @name WHERE id = @id')).toBe(false);
    expect(isAdditiveSql('UPDATE TOP (1) users SET name = @name')).toBe(false);
    expect(isAdditiveSql('INSERT INTO audit_log (msg) VALUES (1); UPDATE users SET active = 0;')).toBe(false);
  });

  test('disallows destructive statements (DELETE, DROP, TRUNCATE) on permanent tables', () => {
    expect(isAdditiveSql('DELETE FROM users WHERE id = @id')).toBe(false);
    expect(isAdditiveSql('DELETE users WHERE id = @id')).toBe(false);
    expect(isAdditiveSql('DROP TABLE users')).toBe(false);
    expect(isAdditiveSql('DROP TABLE IF EXISTS users')).toBe(false);
    expect(isAdditiveSql('TRUNCATE TABLE users')).toBe(false);
  });

  test('disallows schema modifications (ALTER, CREATE permanent table, MERGE)', () => {
    expect(isAdditiveSql('ALTER TABLE users ADD email VARCHAR(255)')).toBe(false);
    expect(isAdditiveSql('CREATE TABLE new_users (id INT)')).toBe(false);
    expect(isAdditiveSql('MERGE INTO users ...')).toBe(false);
    expect(isAdditiveSql('SELECT * INTO permanent_backup FROM users')).toBe(false);
  });

  test('disallows server commands and EXEC calls', () => {
    expect(isAdditiveSql('EXEC sp_rename ...')).toBe(false);
    expect(isAdditiveSql('GRANT SELECT ON users TO public')).toBe(false);
  });

  test('allows keywords inside string literals or comments without false positives', () => {
    expect(isAdditiveSql("INSERT INTO audit_log (msg) VALUES ('User executed UPDATE and DELETE')")).toBe(true);
    expect(isAdditiveSql("-- UPDATE users SET x = 1\nINSERT INTO audit_log (msg) VALUES ('ok')")).toBe(true);
  });
});
