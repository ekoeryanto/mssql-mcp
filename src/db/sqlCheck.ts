/**
 * SQL analysis and sanitization helpers for mutation detection and
 * read-only classification.
 *
 * Distinguishes permanent database mutations from session-local temporary
 * tables (#temp, ##temp) and table variables (@table), which do not mutate
 * persistent data or schema.
 */

// SELECT ... INTO permanent table (excluding temporary tables #temp or [#temp])
export const SELECT_INTO_PERMANENT_PATTERN = /\bSELECT\b[^;]*?\bINTO\s+(?!#|\[#)/i;

// Permanent CREATE (excludes CREATE TABLE #temp and CREATE TABLE [#temp])
export const CREATE_PERMANENT_PATTERN = /\bCREATE\s+(?!TABLE\s+(?:#|\[#))\w+/i;

// Permanent DROP (excludes DROP TABLE #temp and DROP TABLE IF EXISTS #temp)
export const DROP_PERMANENT_PATTERN =
  /\bDROP\s+TABLE\s+IF\s+EXISTS\s+(?!#|\[#)|\bDROP\s+TABLE\s+(?!IF\s+EXISTS\s|#|\[#)|\bDROP\s+(?!TABLE\s)\w+/i;

// Permanent TRUNCATE (excludes TRUNCATE TABLE #temp)
export const TRUNCATE_PERMANENT_PATTERN = /\bTRUNCATE\s+TABLE\s+(?!#|\[#)|\bTRUNCATE\s+(?!TABLE\s)\w+/i;

// Permanent INSERT (excludes INSERT INTO #temp, INSERT #temp, INSERT INTO @table)
export const INSERT_PERMANENT_PATTERN =
  /\bINSERT\s+(?:TOP\s*\([^)]*\)(?:\s*PERCENT)?\s+)?INTO\s+(?!#|\[#|@)|\bINSERT\s+TOP\s*\([^)]*\)(?:\s*PERCENT)?\s+(?!INTO\b|#|\[#|@)|\bINSERT\s+(?!TOP\b|INTO\b|#|\[#|@)/i;

// Permanent DELETE (excludes DELETE FROM #temp, DELETE #temp, DELETE FROM @table)
export const DELETE_PERMANENT_PATTERN =
  /\bDELETE\s+(?:TOP\s*\([^)]*\)(?:\s*PERCENT)?\s+)?FROM\s+(?!#|\[#|@)|\bDELETE\s+TOP\s*\([^)]*\)(?:\s*PERCENT)?\s+(?!FROM\b|#|\[#|@)|\bDELETE\s+(?!TOP\b|FROM\b|#|\[#|@)/i;

// Permanent UPDATE (excludes UPDATE #temp, UPDATE @table)
export const UPDATE_PERMANENT_PATTERN =
  /\bUPDATE\s+TOP\s*\([^)]*\)(?:\s*PERCENT)?\s+(?!#|\[#|@)|\bUPDATE\s+(?!TOP\b|#|\[#|@)/i;

// Permanent ALTER (excludes ALTER TABLE #temp)
export const ALTER_PERMANENT_PATTERN = /\bALTER\s+(?!TABLE\s+(?:#|\[#))\w+/i;

// Permanent MERGE (excludes MERGE INTO #temp)
export const MERGE_PERMANENT_PATTERN = /\bMERGE\s+INTO\s+(?!#|\[#|@)|\bMERGE\s+(?!INTO\s|#|\[#|@)/i;

// Server, security, and administrative mutation commands (always permanent)
export const SERVER_MUTATION_KEYWORDS =
  /\b(GRANT|REVOKE|DENY|BACKUP|RESTORE|RECONFIGURE|DBCC|IDENTITY_INSERT|sp_rename|sp_configure|xp_cmdshell)\b/i;

// Kept for backward compatibility
export const DIRECT_MUTATION_KEYWORDS = SERVER_MUTATION_KEYWORDS;
export const SELECT_INTO_PATTERN = SELECT_INTO_PERMANENT_PATTERN;

// Matches an EXEC/EXECUTE call site
export const EXEC_PATTERN = /\bEXEC(?:UTE)?\b/i;
export const EXEC_PREFIX_PATTERN = /\bEXEC(?:UTE)?\s+(?:@\w+\s*=\s*)?/gi;
export const CALLEE_TOKEN_PATTERN = /^(\(|@\w+|sp_executesql\b|(?:\[[^\]]+\]|\w+)(?:\.(?:\[[^\]]+\]|\w+)){0,2})/i;

/**
 * Strips `--` line comments, `/* *\/` block comments, and quoted string
 * literals from a T-SQL body before it's scanned for mutation keywords or
 * EXEC call sites. Without this, a keyword split across a comment or inside
 * a string literal (e.g. `status = 'DELETED'`) would cause false positives.
 */
export function stripSqlNoise(sqlText: string): string {
  return sqlText
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

/**
 * Evaluates whether a cleaned SQL string performs permanent mutations to
 * persistent data or schema.
 */
export function hasPermanentMutation(cleanSql: string): boolean {
  if (SELECT_INTO_PERMANENT_PATTERN.test(cleanSql)) return true;
  if (CREATE_PERMANENT_PATTERN.test(cleanSql)) return true;
  if (DROP_PERMANENT_PATTERN.test(cleanSql)) return true;
  if (TRUNCATE_PERMANENT_PATTERN.test(cleanSql)) return true;
  if (INSERT_PERMANENT_PATTERN.test(cleanSql)) return true;
  if (DELETE_PERMANENT_PATTERN.test(cleanSql)) return true;
  if (UPDATE_PERMANENT_PATTERN.test(cleanSql)) return true;
  if (ALTER_PERMANENT_PATTERN.test(cleanSql)) return true;
  if (MERGE_PERMANENT_PATTERN.test(cleanSql)) return true;
  if (SERVER_MUTATION_KEYWORDS.test(cleanSql)) return true;
  if (EXEC_PATTERN.test(cleanSql)) return true;
  return false;
}

/**
 * Evaluates whether a SQL query string is read-only with respect to permanent
 * database tables and schema. Operations on temporary tables (#temp, ##temp)
 * and table variables (@table) are permitted as read-only staging.
 */
export function isReadOnlySql(sqlText: string): boolean {
  if (!sqlText || typeof sqlText !== 'string') {
    return false;
  }
  const clean = stripSqlNoise(sqlText).trim();
  if (clean.length === 0) {
    return false;
  }
  return !hasPermanentMutation(clean);
}

/**
 * Evaluates whether a SQL string performs permanent destructive updates
 * (DROP permanent table/view/proc, TRUNCATE permanent table, DELETE permanent table).
 * Temporary table cleanup (DROP TABLE #temp) is NOT destructive.
 */
export function isDestructiveSql(sqlText: string): boolean {
  if (!sqlText || typeof sqlText !== 'string') {
    return false;
  }
  const clean = stripSqlNoise(sqlText).trim();
  if (clean.length === 0) {
    return false;
  }
  if (DROP_PERMANENT_PATTERN.test(clean)) return true;
  if (TRUNCATE_PERMANENT_PATTERN.test(clean)) return true;
  if (DELETE_PERMANENT_PATTERN.test(clean)) return true;
  return false;
}

/**
 * Evaluates whether a SQL query string is additive (read-only queries and INSERT
 * into permanent or temporary tables).
 *
 * In accordance with strict additive security policies:
 * - INSERT statements are permitted.
 * - Temporary table operations and read-only SELECT/CTE queries are permitted.
 * - UPDATE statements are STRICTLY DISALLOWED ("aditif ga boleh update").
 * - Destructive and schema-altering statements (DELETE, DROP, TRUNCATE, ALTER,
 *   CREATE permanent table, MERGE, administrative/exec) are DISALLOWED.
 */
export function isAdditiveSql(sqlText: string): boolean {
  if (!sqlText || typeof sqlText !== 'string') {
    return false;
  }
  const clean = stripSqlNoise(sqlText).trim();
  if (clean.length === 0) {
    return false;
  }
  // UPDATE is strictly prohibited in additive mode
  if (UPDATE_PERMANENT_PATTERN.test(clean)) return false;
  // Destructive, schema, and server mutations are prohibited
  if (DELETE_PERMANENT_PATTERN.test(clean)) return false;
  if (DROP_PERMANENT_PATTERN.test(clean)) return false;
  if (TRUNCATE_PERMANENT_PATTERN.test(clean)) return false;
  if (ALTER_PERMANENT_PATTERN.test(clean)) return false;
  if (CREATE_PERMANENT_PATTERN.test(clean)) return false;
  if (SELECT_INTO_PERMANENT_PATTERN.test(clean)) return false;
  if (MERGE_PERMANENT_PATTERN.test(clean)) return false;
  if (SERVER_MUTATION_KEYWORDS.test(clean)) return false;
  if (EXEC_PATTERN.test(clean)) return false;
  return true;
}
