/**
 * Tool handlers for MCP SQL Server
 */

import type { QueryResult, ExecuteResult, MetadataResult, ProcedureResult, Logger, ToolInput } from '../types/index.js';
import type SqlServerConnectionManager from '../db/connection.js';

export class ToolHandlers {
  private db: SqlServerConnectionManager;
  private logger: Logger;
  private allowMutations: boolean;

  constructor(db: SqlServerConnectionManager, logger: Logger, allowMutations: boolean) {
    this.db = db;
    this.logger = logger;
    this.allowMutations = allowMutations;
  }

  /**
   * Execute a SELECT query
   */
  async handleQuery(input: ToolInput): Promise<QueryResult> {
    try {
      const { query } = input as { query: string };

      if (!query || typeof query !== 'string') {
        return {
          success: false,
          error: 'Query parameter is required and must be a string',
        };
      }

      // Validate query starts with SELECT
      const trimmedQuery = query.trim().toUpperCase();
      if (!trimmedQuery.startsWith('SELECT')) {
        return {
          success: false,
          error: 'Only SELECT queries are supported. Use execute-statement for INSERT, UPDATE, DELETE.',
        };
      }

      // Block mutations if not allowed
      if (!this.allowMutations) {
        const mutationRegex = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|EXEC|EXECUTE)\b/i;
        if (mutationRegex.test(query)) {
          return {
            success: false,
            error: 'Mutations are disabled. Set SQLSERVER_ALLOW_MUTATIONS=true to enable.',
          };
        }
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
  async handleExecute(input: ToolInput): Promise<ExecuteResult> {
    try {
      if (!this.allowMutations) {
        return {
          success: false,
          error: 'Mutations are disabled. Set SQLSERVER_ALLOW_MUTATIONS=true to enable.',
        };
      }
      const { statement, params } = input as { statement: string; params?: Record<string, unknown> };

      if (!statement || typeof statement !== 'string') {
        return {
          success: false,
          error: 'Statement parameter is required and must be a string',
        };
      }

      // Validate statement type
      const trimmedStatement = statement.trim().toUpperCase();
      const validStatements = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP'];
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
  async handleMetadata(input: ToolInput): Promise<MetadataResult> {
    try {
      const { type, filter } = input as { type: string; filter?: string };

      if (!type || typeof type !== 'string') {
        return {
          success: false,
          error: 'Type parameter is required (databases, tables, columns, procedures)',
        };
      }

      const validTypes = ['databases', 'tables', 'columns', 'procedures'];
      if (!validTypes.includes(type)) {
        return {
          success: false,
          error: `Invalid type. Must be one of: ${validTypes.join(', ')}`,
        };
      }

      if (type === 'columns' && !filter) {
        return {
          success: false,
          error: 'Filter (table name) is required for columns query',
        };
      }

      const data = await this.db.getMetadata(type as any, filter);

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
  async handleExecuteProcedure(input: ToolInput): Promise<ProcedureResult> {
    try {
      if (!this.allowMutations) {
        return {
          success: false,
          error: 'Mutations are disabled. Set SQLSERVER_ALLOW_MUTATIONS=true to enable executing procedures.',
        };
      }
      const { name, params } = input as {
        name: string;
        params?: Record<string, { value: unknown; output?: boolean }>;
      };

      if (!name || typeof name !== 'string') {
        return {
          success: false,
          error: 'Procedure name is required',
        };
      }

      const result = await this.db.executeStoredProcedure(name, params);

      return {
        success: true,
        rowsAffected: result.rowsAffected,
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
