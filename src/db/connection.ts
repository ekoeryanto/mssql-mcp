/**
 * SQL Server Connection Manager with pooling and error handling
 */

import sql from 'mssql';
import { quoteIdentifierPath } from './identifier.js';
import type {
  SqlServerConfig,
  Logger,
  SkillRow,
  SkillDefinition,
  SaveSkillInput,
  SkillSqlValidationResult,
  KnowledgeRow,
  SaveKnowledgeInput,
  DatabaseCapabilityMetadata,
} from '../types/index.js';
import {
  CALLEE_TOKEN_PATTERN,
  EXEC_PREFIX_PATTERN,
  hasPermanentMutation,
  isDestructiveSql,
  isReadOnlySql,
  stripSqlNoise,
} from './sqlCheck.js';

/**
 * Infer a SQL Server type for a stored procedure output parameter from its
 * JS value, since `mssql` requires an explicit `ISqlType` for output params
 * (unlike input params, which can infer the type from the value alone).
 */
function inferSqlType(value: unknown): (() => sql.ISqlType) | sql.ISqlType {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? sql.Int : sql.Float;
  }
  if (typeof value === 'boolean') {
    return sql.Bit;
  }
  if (value instanceof Date) {
    return sql.DateTime;
  }
  return sql.NVarChar(sql.MAX);
}

export class SqlServerConnectionManager {
  private pool: sql.ConnectionPool | null = null;
  private readonly config: SqlServerConfig;
  private readonly logger: Logger;
  private readonly skillsTable: string;
  private readonly knowledgeTable: string;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY = 1000;
  private cachedCapability?: DatabaseCapabilityMetadata;

  constructor(config: SqlServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    // Validated and bracket-quoted once at startup: a table/schema name
    // can't be bound as a query parameter the way values can, so it must
    // be checked before ever being spliced into SQL text.
    this.skillsTable = quoteIdentifierPath(config.skillsTable);
    this.knowledgeTable = quoteIdentifierPath(config.knowledgeTable);
  }

  /**
   * Initialize connection pool
   */
  async connect(): Promise<void> {
    if (this.pool?.connected) {
      this.logger.info('Already connected to SQL Server');
      return;
    }

    if (this.isConnecting) {
      // Wait for the current connection attempt
      let attempts = 0;
      while (this.isConnecting && attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }
      if (this.pool?.connected) {
        return;
      }
    }

    this.isConnecting = true;
    try {
      const config: sql.config = {
        server: this.config.server,
        port: this.config.port,
        database: this.config.database,
        authentication: {
          type: 'default',
          options: {
            userName: this.config.username,
            password: this.config.password,
          },
        },
        options: {
          encrypt: this.config.encrypt,
          trustServerCertificate: this.config.trustServerCertificate,
        },
        pool: {
          min: this.config.connectionPoolMin || 2,
          max: this.config.connectionPoolMax || 10,
          acquireTimeoutMillis: 30000,
        },
        requestTimeout: this.config.requestTimeout || 30000,
      };

      this.pool = new sql.ConnectionPool(config);

      this.pool.on('error', (err: Error) => {
        this.logger.error('Connection pool error', err);
      });

      await this.pool.connect();
      this.logger.info('Connected to SQL Server', {
        server: this.config.server,
        port: this.config.port,
        database: this.config.database,
      });
      this.reconnectAttempts = 0;
    } catch (error) {
      this.reconnectAttempts++;
      this.logger.error(`Connection failed (attempt ${this.reconnectAttempts})`, error);

      if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, this.RECONNECT_DELAY * this.reconnectAttempts));
        this.isConnecting = false;
        return this.connect();
      }

      throw new Error(`Failed to connect to SQL Server after ${this.MAX_RECONNECT_ATTEMPTS} attempts: ${error}`, {
        cause: error,
      });
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Execute a query and return results
   */
  async query(sql: string): Promise<sql.IResult<Record<string, unknown>>> {
    await this.ensureConnected();

    try {
      this.logger.debug('Executing query', { sql });
      const result = await this.pool!.request().query(sql);
      this.logger.debug('Query executed successfully', { rowCount: result.rowsAffected });
      return result;
    } catch (error) {
      this.logger.error('Query execution failed', error);
      throw error;
    }
  }

  /**
   * Execute a statement (INSERT, UPDATE, DELETE)
   */
  async execute(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<sql.IResult<Record<string, unknown>>> {
    await this.ensureConnected();

    try {
      this.logger.debug('Executing statement', { sql, params });
      const request = this.pool!.request();

      // Add parameters to request
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      const result = await request.query(sql);
      this.logger.debug('Statement executed successfully', { rowsAffected: result.rowsAffected });
      return result;
    } catch (error) {
      this.logger.error('Statement execution failed', error);
      throw error;
    }
  }

  /**
   * Execute a stored procedure
   */
  async executeStoredProcedure(
    procedureName: string,
    params?: Record<string, { value?: unknown; output?: boolean }>,
  ): Promise<{
    recordsets: unknown[][];
    recordset: Record<string, unknown>[] | null;
    output: Record<string, unknown>;
    rowsAffected: number[];
  }> {
    await this.ensureConnected();

    try {
      this.logger.debug('Executing stored procedure', { procedureName, params });
      const request = this.pool!.request();

      if (params) {
        for (const [key, { value, output }] of Object.entries(params)) {
          if (output) {
            request.output(key, inferSqlType(value), value);
          } else {
            request.input(key, value);
          }
        }
      }

      const result = await request.execute<Record<string, unknown>>(procedureName);
      this.logger.debug('Stored procedure executed successfully', { rowsAffected: result.rowsAffected });
      return {
        recordsets: result.recordsets,
        recordset: result.recordset ?? null,
        output: result.output,
        rowsAffected: result.rowsAffected,
      };
    } catch (error) {
      this.logger.error('Stored procedure execution failed', error);
      throw error;
    }
  }

  /**
   * Fetch a stored procedure's T-SQL body via OBJECT_DEFINITION, so callers
   * can scan it for mutation keywords before running it. Returns null when
   * the procedure doesn't exist or its definition isn't visible (e.g. it's
   * encrypted with WITH ENCRYPTION, or the login lacks VIEW DEFINITION) —
   * callers should treat null as "can't verify, so don't assume read-only".
   */
  async getProcedureDefinition(procedureName: string): Promise<string | null> {
    await this.ensureConnected();
    const request = this.pool!.request();
    request.input('procName', sql.NVarChar, procedureName);
    const result = await request.query('SELECT OBJECT_DEFINITION(OBJECT_ID(@procName)) as definition');
    const row = result.recordset[0] as { definition: string | null } | undefined;
    return row?.definition ?? null;
  }

  /**
   * Recursively verify that a stored procedure — and every procedure it
   * calls via EXEC/EXECUTE, transitively — contains no mutation statement.
   * Used to gate execute-procedure when SQLSERVER_ALLOW_MUTATIONS=false: a
   * proc that only reads is allowed to run even with mutations disabled,
   * but one that mutates directly, calls something that does, or invokes
   * dynamic SQL that can't be statically resolved (EXEC(@sql), EXEC @sql,
   * sp_executesql) is rejected, fail-closed.
   *
   * `visited` collapses call cycles: each procedure's own text is fully
   * scanned for direct mutations the first time it's visited, so revisiting
   * it via a back-edge can't hide a mutation — it only stops infinite
   * recursion on legitimate recursive procedures.
   *
   * WARNING: this is a static keyword scan, not a real T-SQL parser — it is
   * a defense-in-depth heuristic, not a sound security boundary. It cannot
   * see through server-side dynamic SQL built from string fragments (e.g.
   * concatenating `'DEL' + 'ETE'` and running it via sp_executesql/EXEC —
   * already rejected as unverifiable), nor can any fixed keyword list ever
   * be proven complete against future T-SQL syntax. The robust fix is to
   * run with a database login that only has SELECT permission when
   * SQLSERVER_ALLOW_MUTATIONS=false, so SQL Server itself enforces the
   * boundary; this check is a convenience on top of that, not a substitute
   * for it.
   */
  async checkProcedureReadOnly(
    procedureName: string,
    visited: Set<string> = new Set(),
    depth = 0,
  ): Promise<{ readOnly: boolean; reason?: string }> {
    const key = procedureName.trim().toLowerCase();
    if (visited.has(key)) {
      return { readOnly: true };
    }
    visited.add(key);

    if (depth > 10) {
      return {
        readOnly: false,
        reason: `the call chain through '${procedureName}' is too deep (>10 levels) to verify`,
      };
    }

    const definition = await this.getProcedureDefinition(procedureName);
    if (definition === null) {
      return {
        readOnly: false,
        reason: `the definition of '${procedureName}' could not be read (it may not exist, be encrypted, or the login may lack VIEW DEFINITION)`,
      };
    }

    const cleanDefinition = stripSqlNoise(definition);

    if (hasPermanentMutation(cleanDefinition)) {
      return { readOnly: false, reason: `'${procedureName}' contains a direct mutation statement` };
    }

    const calledProcs = new Set<string>();
    for (const prefixMatch of cleanDefinition.matchAll(EXEC_PREFIX_PATTERN)) {
      const rest = cleanDefinition.slice(prefixMatch.index + prefixMatch[0].length);
      const calleeMatch = CALLEE_TOKEN_PATTERN.exec(rest);
      if (calleeMatch) {
        calledProcs.add(calleeMatch[1]);
      }
    }

    for (const call of calledProcs) {
      if (call === '(' || call.startsWith('@') || call.toLowerCase() === 'sp_executesql') {
        return {
          readOnly: false,
          reason: `'${procedureName}' executes dynamic SQL that can't be statically verified as read-only`,
        };
      }
      const nested = await this.checkProcedureReadOnly(call, visited, depth + 1);
      if (!nested.readOnly) {
        return {
          readOnly: false,
          reason: nested.reason ?? `'${procedureName}' calls '${call}', which mutates`,
        };
      }
    }

    return { readOnly: true };
  }

  /**
   * Get database metadata
   */
  async getMetadata(
    type: 'databases' | 'tables' | 'columns' | 'procedures',
    filter?: string,
  ): Promise<Record<string, unknown>[]> {
    await this.ensureConnected();

    if (type === 'columns' && !filter) {
      throw new Error('Table name required for columns query');
    }

    try {
      const request = this.pool!.request();
      let query: string;

      switch (type) {
        case 'databases':
          query = "SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')";
          break;

        case 'tables':
          query = `SELECT
            TABLE_SCHEMA as 'schema',
            TABLE_NAME as name,
            'TABLE' as type
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_TYPE = 'BASE TABLE'`;
          if (filter) {
            request.input('filter', sql.NVarChar, `%${filter}%`);
            query += ' AND TABLE_NAME LIKE @filter';
          }
          break;

        case 'columns':
          request.input('tableName', sql.NVarChar, filter);
          query = `SELECT
            COLUMN_NAME as name,
            DATA_TYPE as type,
            IS_NULLABLE as nullable,
            CHARACTER_MAXIMUM_LENGTH as maxLength,
            COLUMNPROPERTY(OBJECT_ID(@tableName), COLUMN_NAME, 'IsIdentity') as isIdentity,
            COLUMN_DEFAULT as defaultValue
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @tableName`;
          break;

        case 'procedures':
          query = `SELECT
            ROUTINE_SCHEMA as 'schema',
            ROUTINE_NAME as name,
            ROUTINE_TYPE as type
          FROM INFORMATION_SCHEMA.ROUTINES
          WHERE ROUTINE_TYPE = 'PROCEDURE'`;
          if (filter) {
            request.input('filter', sql.NVarChar, `%${filter}%`);
            query += ' AND ROUTINE_NAME LIKE @filter';
          }
          break;
      }

      this.logger.debug('Fetching metadata', { type, filter });
      const result = await request.query(query);
      return result.recordset;
    } catch (error) {
      this.logger.error('Metadata fetch failed', error);
      throw error;
    }
  }

  /**
   * Close the connection pool
   */
  async disconnect(): Promise<void> {
    this.cachedCapability = undefined;
    if (this.pool) {
      try {
        await this.pool.close();
        this.pool = null;
        this.logger.info('Disconnected from SQL Server');
      } catch (error) {
        this.logger.error('Error disconnecting from SQL Server', error);
      }
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.pool !== null && this.pool.connected;
  }

  /**
   * Ensure connection is active
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      await this.connect();
    }
  }

  /**
   * Get connection pool status
   */
  getPoolStatus(): { connected: boolean; totalConnections?: number } {
    if (!this.pool) {
      return { connected: false };
    }

    return {
      connected: this.pool.connected,
      totalConnections: this.pool.size,
    };
  }

  /**
   * Reads database updateability, user mutation permissions, and stored procedure
   * metadata to evaluate database capabilities before deciding tool annotations.
   */
  async getDatabaseCapabilityMetadata(): Promise<DatabaseCapabilityMetadata> {
    if (this.cachedCapability) {
      return this.cachedCapability;
    }

    await this.ensureConnected();

    // 1. If neither mutations nor additive are allowed, the server operates strictly in read-only mode
    if (!this.config.allowMutations && !this.config.allowAdditive) {
      this.cachedCapability = {
        isReadOnly: true,
        canMutate: false,
        canInsert: false,
        canDelete: false,
        canDrop: false,
        hasProcedures: true,
        allProceduresReadOnly: true,
        anyProcedureDestructive: false,
      };
      return this.cachedCapability;
    }

    try {
      // 2. Query database updateability and user permissions
      const permResult = await this.pool!.request().query(`
        SELECT 
          CAST(DATABASEPROPERTYEX(DB_NAME(), 'Updateability') AS VARCHAR(20)) AS updateability,
          HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS can_insert,
          HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'UPDATE') AS can_update,
          HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'DELETE') AS can_delete,
          HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS can_create_table,
          HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'ALTER') AS can_alter,
          HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'DROP') AS can_drop
      `);

      const permRow = permResult.recordset?.[0] as {
        updateability?: string;
        can_insert?: number;
        can_update?: number;
        can_delete?: number;
        can_create_table?: number;
        can_alter?: number;
        can_drop?: number;
      } | undefined;

      const isDbReadOnly = permRow?.updateability === 'READ_ONLY';
      const canInsert = permRow?.can_insert === 1;
      const canUpdate = permRow?.can_update === 1;
      const canDelete = permRow?.can_delete === 1;
      const canCreateTable = permRow?.can_create_table === 1;
      const canAlter = permRow?.can_alter === 1;
      const canDrop = permRow?.can_drop === 1;

      // In additive mode (allowAdditive = true, allowMutations = false):
      // Only INSERT is active; destructive operations and UPDATE are suppressed.
      if (!this.config.allowMutations && this.config.allowAdditive) {
        const canDoAdditive = !isDbReadOnly && canInsert;
        this.cachedCapability = {
          isReadOnly: !canDoAdditive,
          canMutate: false,
          canInsert: canDoAdditive,
          canDelete: false,
          canDrop: false,
          hasProcedures: true,
          allProceduresReadOnly: true,
          anyProcedureDestructive: false,
        };
        return this.cachedCapability;
      }

      const hasAnyMutationPerm = canInsert || canUpdate || canDelete || canCreateTable || canAlter || canDrop;
      const isReadOnly = isDbReadOnly || !hasAnyMutationPerm;

      // 3. Query stored procedures to check read-only / destructive presence
      let hasProcedures = false;
      let allProceduresReadOnly = true;
      let anyProcedureDestructive = false;

      try {
        const procResult = await this.pool!.request().query(`
          SELECT 
            p.name,
            m.definition
          FROM sys.procedures p
          LEFT JOIN sys.sql_modules m ON p.object_id = m.object_id
          WHERE p.is_ms_shipped = 0
        `);

        const procs = procResult.recordset as { name: string; definition: string | null }[] | undefined;
        if (procs && procs.length > 0) {
          hasProcedures = true;
          for (const proc of procs) {
            if (!proc.definition) {
              allProceduresReadOnly = false;
              continue;
            }
            if (!isReadOnlySql(proc.definition)) {
              allProceduresReadOnly = false;
            }
            if (isDestructiveSql(proc.definition)) {
              anyProcedureDestructive = true;
            }
          }
        }
      } catch (procErr) {
        this.logger.warn('Failed to query procedure definitions for capability metadata', procErr);
        allProceduresReadOnly = false;
      }

      this.cachedCapability = {
        isReadOnly,
        canMutate: !isReadOnly,
        canDelete,
        canDrop,
        hasProcedures,
        allProceduresReadOnly,
        anyProcedureDestructive,
      };
      return this.cachedCapability;
    } catch (err) {
      this.logger.warn('Failed to query database permissions, falling back to allowMutations config', err);
      this.cachedCapability = {
        isReadOnly: !this.config.allowMutations,
        canMutate: this.config.allowMutations,
        canDelete: false,
        canDrop: false,
        hasProcedures: false,
        allProceduresReadOnly: !this.config.allowMutations,
        anyProcedureDestructive: false,
      };
      return this.cachedCapability;
    }
  }

  /**
   * List active dynamic skills for tools/list.
   */
  async listSkills(): Promise<SkillRow[]> {
    await this.ensureConnected();
    const result = await this.pool!.request().query(
      `SELECT tool_name, description, keywords, generated_prompt, generated_sql FROM ${this.skillsTable} WHERE is_active = 1`,
    );
    return result.recordset as SkillRow[];
  }

  /**
   * Fetch one active skill's prompt+SQL for tools/call.
   */
  async getSkillDefinition(toolName: string): Promise<SkillDefinition | null> {
    await this.ensureConnected();
    const request = this.pool!.request();
    request.input('toolName', sql.VarChar, toolName);
    const result = await request.query(
      `SELECT generated_prompt, generated_sql FROM ${this.skillsTable} WHERE tool_name = @toolName AND is_active = 1`,
    );
    const row = result.recordset[0] as { generated_prompt: string; generated_sql: string } | undefined;
    return row ? { generated_prompt: row.generated_prompt, generated_sql: row.generated_sql } : null;
  }

  /**
   * Run a skill's generated_sql with the given arguments bound as
   * parameters (never string-interpolated).
   */
  async executeParameterized(
    sqlText: string,
    params: Record<string, unknown>,
  ): Promise<{ recordset: Record<string, unknown>[] | null }> {
    await this.ensureConnected();
    const request = this.pool!.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
    const result = await request.query(sqlText);
    return { recordset: result.recordset ?? null };
  }

  /**
   * Dry-run a candidate skill's SQL inside a transaction with dummy
   * parameter values, then always roll back — never commits, regardless
   * of outcome. Used by save-skill to catch bad table/column names before
   * a skill becomes callable.
   */
  async validateSkillSql(
    sqlText: string,
    dummyParams: Record<string, unknown>,
  ): Promise<SkillSqlValidationResult> {
    await this.ensureConnected();
    const transaction = new sql.Transaction(this.pool!);
    try {
      await transaction.begin();
      const request = new sql.Request(transaction);
      for (const [key, value] of Object.entries(dummyParams)) {
        request.input(key, value);
      }
      await request.query(sqlText);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      await transaction.rollback().catch(() => {
        // Nothing to do — validation never commits either way.
      });
    }
  }

  /**
   * Insert or update a skill by tool_name, always leaving it active.
   */
  async upsertSkill(skill: SaveSkillInput): Promise<void> {
    await this.ensureConnected();
    const request = this.pool!.request();
    request.input('toolName', sql.VarChar, skill.tool_name);
    request.input('description', sql.NVarChar, skill.description);
    request.input('keywords', sql.NVarChar, skill.keywords ?? null);
    request.input('generatedPrompt', sql.NVarChar(sql.MAX), skill.generated_prompt);
    request.input('generatedSql', sql.NVarChar(sql.MAX), skill.generated_sql);
    await request.query(`
      IF EXISTS (SELECT 1 FROM ${this.skillsTable} WHERE tool_name = @toolName)
        UPDATE ${this.skillsTable}
        SET description = @description,
            keywords = @keywords,
            generated_prompt = @generatedPrompt,
            generated_sql = @generatedSql,
            is_active = 1,
            updated_at = SYSUTCDATETIME()
        WHERE tool_name = @toolName
      ELSE
        INSERT INTO ${this.skillsTable} (tool_name, description, keywords, generated_prompt, generated_sql, is_active)
        VALUES (@toolName, @description, @keywords, @generatedPrompt, @generatedSql, 1);
    `);
  }

  /**
   * Search tb_mcp_knowledge by a free-text substring match across
   * title/content/keywords, or list the most recently updated entries when
   * query is omitted. limit is bound as a parameter (TOP (@limit) is valid
   * T-SQL); the caller (searchKnowledgeTool) has already clamped it.
   */
  async searchKnowledge(query: string | undefined, limit: number): Promise<KnowledgeRow[]> {
    await this.ensureConnected();
    const request = this.pool!.request();
    request.input('limit', sql.Int, limit);
    if (query) {
      request.input('pattern', sql.NVarChar, `%${query}%`);
    }
    const whereClause = query ? 'WHERE title LIKE @pattern OR content LIKE @pattern OR keywords LIKE @pattern' : '';
    const result = await request.query(`
      SELECT TOP (@limit) title, content, keywords, updated_at
      FROM ${this.knowledgeTable}
      ${whereClause}
      ORDER BY updated_at DESC
    `);
    return result.recordset as KnowledgeRow[];
  }

  /**
   * Insert or update a knowledge entry by title.
   */
  async saveKnowledge(entry: SaveKnowledgeInput): Promise<void> {
    await this.ensureConnected();
    const request = this.pool!.request();
    request.input('title', sql.NVarChar, entry.title);
    request.input('content', sql.NVarChar(sql.MAX), entry.content);
    request.input('keywords', sql.NVarChar, entry.keywords ?? null);
    await request.query(`
      IF EXISTS (SELECT 1 FROM ${this.knowledgeTable} WHERE title = @title)
        UPDATE ${this.knowledgeTable}
        SET content = @content,
            keywords = @keywords,
            updated_at = SYSUTCDATETIME()
        WHERE title = @title
      ELSE
        INSERT INTO ${this.knowledgeTable} (title, content, keywords)
        VALUES (@title, @content, @keywords);
    `);
  }
}

export default SqlServerConnectionManager;
