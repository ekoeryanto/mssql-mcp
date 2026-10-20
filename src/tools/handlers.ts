/**
 * Tool handlers for MCP SQL Server
 */

import type { QueryResult, ExecuteResult, MetadataResult, ProcedureResult, Logger } from '../types/index.js';
import type SqlServerConnectionManager from '../db/connection.js';
import { ALTER_PERMANENT_PATTERN, isAdditiveSql, isReadOnlySql, stripSqlNoise, UPDATE_PERMANENT_PATTERN } from '../db/sqlCheck.js';

export interface MutationOptions {
  allowMutations: boolean;
  allowAdditive?: boolean;
}

export class ToolHandlers {
  private readonly db: SqlServerConnectionManager;
  private readonly logger: Logger;
  private readonly allowMutations: boolean;
  private readonly allowAdditive: boolean;

  constructor(
    db: SqlServerConnectionManager,
    logger: Logger,
    optionsOrAllowMutations: boolean | MutationOptions,
    allowAdditive = false,
  ) {
    this.db = db;
    this.logger = logger;
    if (typeof optionsOrAllowMutations === 'boolean') {
      this.allowMutations = optionsOrAllowMutations;
      this.allowAdditive = allowAdditive;
    } else {
      this.allowMutations = optionsOrAllowMutations.allowMutations;
      this.allowAdditive = optionsOrAllowMutations.allowAdditive ?? false;
    }
  }

  /**
   * Execute a query (SELECT, CTE, or read-only batch with temp tables)
   */
  async handleQuery(input: { query: string }): Promise<QueryResult> {
    try {
      const { query } = input;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return {
          success: false,
          error: 'Query must be a non-empty string.',
        };
      }

      // Check whether query performs permanent mutations to user data/schema
      if (!isReadOnlySql(query)) {
        if (!this.allowMutations && !this.allowAdditive) {
          return {
            success: false,
            error: 'Mutations are disabled. Set SQLSERVER_ALLOW_MUTATIONS=true to enable.',
          };
        }
        if (!this.allowMutations && this.allowAdditive) {
          if (!isAdditiveSql(query)) {
            return {
              success: false,
              error: 'UPDATE and destructive statements are disabled in additive mode. Only read-only queries are supported by query.',
            };
          }
          return {
            success: false,
            error: 'Only read-only queries are supported by query. Use execute-statement for INSERT statements.',
          };
        }
        return {
          success: false,
          error: 'Only read-only queries (SELECT, WITH, temporary table queries) are supported by query. Use execute-statement for INSERT, UPDATE, DELETE.',
        };
      }

      const result = await this.db.query(query);

      return {
        success: true,
        rowCount: result.rowsAffected?.[0] || result.recordset?.length || 0,
        data: result.recordset || [],
        columns: result.recordset?.length ? Object.keys(result.recordset[0]) : [],
      };
    } catch (error) {
      this.logger.error('Query execution failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute DML or DDL statements
   */
  async handleExecute(input: { statement: string; params?: Record<string, unknown> }): Promise<ExecuteResult> {
    const { statement, params } = input;

    if (!statement || typeof statement !== 'string' || statement.trim().length === 0) {
      return {
        success: false,
        error: 'Statement must be a non-empty string.',
      };
    }

    // If full mutations are disabled, check read-only / additive permissions
    if (!this.allowMutations) {
      if (this.allowAdditive) {
        if (!isAdditiveSql(statement)) {
          const clean = stripSqlNoise(statement).trim();
          if (UPDATE_PERMANENT_PATTERN.test(clean)) {
            return {
              success: false,
              error: 'UPDATE statements are not allowed in additive mode. Only additive operations (INSERT) are permitted.',
            };
          }
          if (ALTER_PERMANENT_PATTERN.test(clean)) {
            return {
              success: false,
              error: 'ALTER statements are not allowed in additive mode. Only additive operations (INSERT) are permitted.',
            };
          }
          return {
            success: false,
            error: 'Mutations are restricted to additive operations (INSERT). UPDATE, DELETE, DROP, TRUNCATE, and ALTER are disabled.',
          };
        }
      } else if (!isReadOnlySql(statement)) {
        return {
          success: false,
          error: 'Mutations are disabled. Set SQLSERVER_ALLOW_MUTATIONS=true to enable.',
        };
      }
    }

    try {
      const cleanStatement = stripSqlNoise(statement).trim();
      const validStatements = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'MERGE', 'SET', 'DECLARE'];
      const upperClean = cleanStatement.toUpperCase();
      if (!validStatements.some((s) => upperClean.startsWith(s))) {
        return {
          success: false,
          error: `Statement must start with one of: ${validStatements.join(', ')}`,
        };
      }

      const result = await this.db.execute(statement, params);

      return {
        success: true,
        rowsAffected: result.rowsAffected?.[0] || 0,
        message: `Statement executed successfully. Rows affected: ${result.rowsAffected?.[0] || 0}`,
      };
    } catch (error) {
      this.logger.error('Execute statement failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get database metadata
   */
  async handleMetadata(input: {
    type: 'databases' | 'tables' | 'columns' | 'procedures';
    filter?: string;
  }): Promise<MetadataResult> {
    try {
      const { type, filter } = input;

      if (type === 'columns' && !filter) {
        return {
          success: false,
          error: 'Filter (table name) is required for columns query',
        };
      }

      const data = await this.db.getMetadata(type, filter);

      return {
        success: true,
        data: {
          [type]: data,
        },
      };
    } catch (error) {
      this.logger.error('Metadata fetch failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute a stored procedure
   */
  async handleExecuteProcedure(input: {
    name: string;
    params?: Record<string, { value?: unknown; output?: boolean }>;
  }): Promise<ProcedureResult> {
    try {
      const { name, params } = input;

      if (!this.allowMutations) {
        const check = await this.db.checkProcedureReadOnly(name);
        if (!check.readOnly) {
          const reason = check.reason ?? `'${name}' could not be verified as read-only`;
          return {
            success: false,
            error: `Mutations are disabled: ${reason}. Set SQLSERVER_ALLOW_MUTATIONS=true to enable.`,
          };
        }
      }

      const result = await this.db.executeStoredProcedure(name, params);

      return {
        success: true,
        rowsAffected: result.rowsAffected?.[0] || 0,
        outputValues: result.output,
        data: result.recordset || undefined,
      };
    } catch (error) {
      this.logger.error('Stored procedure execution failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get connection status
   */
  async handleGetStatus(): Promise<{ connected: boolean; poolStatus?: unknown }> {
    try {
      const poolStatus = this.db.getPoolStatus();
      return {
        connected: this.db.isConnected(),
        poolStatus,
      };
    } catch (error) {
      this.logger.error('Failed to get status', error);
      return {
        connected: false,
      };
    }
  }
}

export default ToolHandlers;
