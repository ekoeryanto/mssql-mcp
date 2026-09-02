/**
 * Type definitions for MCP SQL Server
 */

export interface SqlServerConfig {
  server: string;
  port: number;
  database: string;
  username: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  allowMutations: boolean;
  connectionPoolMin?: number;
  connectionPoolMax?: number;
  requestTimeout?: number;
}

export interface QueryResult {
  success: boolean;
  rowCount?: number;
  data?: Record<string, unknown>[];
  columns?: string[];
  error?: string;
}

export interface ExecuteResult {
  success: boolean;
  rowsAffected?: number;
  error?: string;
  message?: string;
}

export interface MetadataResult {
  success: boolean;
  data?: {
    databases?: string[];
    tables?: TableInfo[];
    columns?: ColumnInfo[];
    procedures?: ProcedureInfo[];
  };
  error?: string;
}

export interface ServerConfig {
  name: string;
  version: string;
  logLevel: string;
  authToken?: string;
}

export interface TableInfo {
  name: string;
  type: string;
  schema: string;
  rowCount?: number;
  createdDate?: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  maxLength?: number;
  isPrimaryKey?: boolean;
  isIdentity?: boolean;
  defaultValue?: string;
}

export interface ProcedureInfo {
  name: string;
  schema: string;
  parameters?: ParameterInfo[];
  returnType?: string;
}

export interface ParameterInfo {
  name: string;
  type: string;
  length?: number;
  output: boolean;
}

export interface ProcedureResult {
  success: boolean;
  rowsAffected?: number;
  outputValues?: Record<string, unknown>;
  data?: Record<string, unknown>[];
  error?: string;
}

export interface ToolInput {
  [key: string]: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}
