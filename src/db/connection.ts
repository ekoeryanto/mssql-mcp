/**
 * SQL Server Connection Manager with pooling and error handling
 */

import sql from 'mssql';
import type { SqlServerConfig, Logger } from '../types/index.js';

export class SqlServerConnectionManager {
  private pool: sql.ConnectionPool | null = null;
  private config: SqlServerConfig;
  private logger: Logger;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY = 1000;

  constructor(config: SqlServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initialize connection pool
   */
  async connect(): Promise<void> {
    if (this.pool && this.pool.connected) {
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
      if (this.pool && this.pool.connected) {
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

      throw new Error(`Failed to connect to SQL Server after ${this.MAX_RECONNECT_ATTEMPTS} attempts: ${error}`);
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
    params?: Record<string, { value: unknown; output?: boolean }>,
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

      // Add parameters
      if (params) {
        for (const [key, { value, output }] of Object.entries(params)) {
          if (output) {
            request.output(key, value as any);
          } else {
            request.input(key, value as any);
          }
        }
      }

      const result = await request.execute(procedureName);
      this.logger.debug('Stored procedure executed successfully', { rowsAffected: result.rowsAffected });
      return result as any;
    } catch (error) {
      this.logger.error('Stored procedure execution failed', error);
      throw error;
    }
  }

  /**
   * Get database metadata
   */
  async getMetadata(type: 'databases' | 'tables' | 'columns' | 'procedures', filter?: string) {
    await this.ensureConnected();

    try {
      let sql = '';

      switch (type) {
        case 'databases':
          sql = "SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')";
          break;

        case 'tables':
          sql = `SELECT
            TABLE_SCHEMA as 'schema',
            TABLE_NAME as name,
            'TABLE' as type
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_TYPE = 'BASE TABLE'`;
          if (filter) {
            sql += ` AND TABLE_NAME LIKE '%${filter}%'`;
          }
          break;

        case 'columns':
          if (!filter) {
            throw new Error('Table name required for columns query');
          }
          sql = `SELECT
            COLUMN_NAME as name,
            DATA_TYPE as type,
            IS_NULLABLE as nullable,
            CHARACTER_MAXIMUM_LENGTH as maxLength,
            COLUMNPROPERTY(OBJECT_ID('${filter}'), COLUMN_NAME, 'IsIdentity') as isIdentity,
            COLUMN_DEFAULT as defaultValue
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = '${filter}'`;
          break;

        case 'procedures':
          sql = `SELECT
            ROUTINE_SCHEMA as 'schema',
            ROUTINE_NAME as name,
            ROUTINE_TYPE as type
          FROM INFORMATION_SCHEMA.ROUTINES
          WHERE ROUTINE_TYPE = 'PROCEDURE'`;
          if (filter) {
            sql += ` AND ROUTINE_NAME LIKE '%${filter}%'`;
          }
          break;
      }

      this.logger.debug('Fetching metadata', { type, filter });
      const result = await this.pool!.request().query(sql);
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
}

export default SqlServerConnectionManager;
