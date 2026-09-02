/**
 * Tool handlers for MCP SQL Server
 */

import type { QueryResult, ExecuteResult, MetadataResult, ProcedureResult, Logger } from '../types/index.js';
import type SqlServerConnectionManager from '../db/connection.js';

const MUTATION_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|EXEC|EXECUTE)\b/i;

export class ToolHandlers {
  private readonly db: SqlServerConnectionManager;
  private readonly logger: Logger;
  private readonly allowMutations: boolean;

  constructor(db: SqlServerConnectionManager, logger: Logger, allowMutations: boolean) {
    this.db = db;
    this.logger = logger;
    this.allowMutations = allowMutations;
  }

  /**
   * Execute a SELECT query
   */
  async handleQuery(input: { query: string }): Promise<QueryResult> {
    try {
      const { query } = input;

      if (!query.trim().toUpperCase().startsWith('SELECT')) {
        return {
          success: false,
          error: 'Only SELECT queries are supported. Use execute-statement for INSERT, UPDATE, DELETE.',
        };
      }

      if (!this.allowMutations && MUTATION_KEYWORDS.test(query)) {
        return {
          success: false,
          error: 'Mutations are disabled. Set SQLSERVER_ALLOW_MUTATIONS=true to enable.',
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
   * Execute INSERT, UPDATE, DELETE statements
   */
  async handleExecute(input: { statement: string; params?: Record<string, unknown> }): Promise<ExecuteResult> {
    if (!this.allowMutations) {
      return {
        success: false,
        error: 'Mutations are disabled. Set SQLSERVER_ALLOW_MUTATIONS=true to enable.',
      };
    }

    try {
      const { statement, params } = input;

      const validStatements = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP'];
      const trimmedStatement = statement.trim().toUpperCase();
      if (!validStatements.some((s) => trimmedStatement.startsWith(s))) {
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
    if (!this.allowMutations) {
      return {
        success: false,
        error: 'Mutations are disabled. Set SQLSERVER_ALLOW_MUTATIONS=true to enable executing procedures.',
      };
    }

    try {
      const { name, params } = input;
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
