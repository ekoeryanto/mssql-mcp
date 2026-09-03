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
} from '../types/index.js';

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
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY = 1000;

  constructor(config: SqlServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    // Validated and bracket-quoted once at startup: a table/schema name
    // can't be bound as a query parameter the way values can, so it must
    // be checked before ever being spliced into SQL text.
    this.skillsTable = quoteIdentifierPath(config.skillsTable);
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
   * List active dynamic skills for tools/list.
   */
  async listSkills(): Promise<SkillRow[]> {
    await this.ensureConnected();
    const result = await this.pool!.request().query(
      `SELECT tool_name, description, keywords, generated_prompt FROM ${this.skillsTable} WHERE is_active = 1`,
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
}

export default SqlServerConnectionManager;
