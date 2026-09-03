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
  skillsTable: string;
  knowledgeTable: string;
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

export interface SkillRow {
  tool_name: string;
  description: string;
  keywords: string | null;
  generated_prompt: string;
}

export interface SkillDefinition {
  generated_prompt: string;
  generated_sql: string;
}

export interface SaveSkillInput {
  tool_name: string;
  description: string;
  keywords?: string;
  generated_prompt: string;
  generated_sql: string;
}

export type SkillSqlValidationResult = { valid: true } | { valid: false; error: string };

export interface SkillsStore {
  listSkills(): Promise<SkillRow[]>;
  getSkillDefinition(toolName: string): Promise<SkillDefinition | null>;
  executeParameterized(
    sqlText: string,
    params: Record<string, unknown>,
  ): Promise<{ recordset: Record<string, unknown>[] | null }>;
  validateSkillSql(
    sqlText: string,
    dummyParams: Record<string, unknown>,
  ): Promise<SkillSqlValidationResult>;
  upsertSkill(skill: SaveSkillInput): Promise<void>;
}

export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  [key: string]: unknown;
}

export interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
}

export interface KnowledgeRow {
  title: string;
  content: string;
  keywords: string | null;
  updated_at: Date;
}

export interface SaveKnowledgeInput {
  title: string;
  content: string;
  keywords?: string;
}

export interface KnowledgeStore {
  searchKnowledge(query: string | undefined, limit: number): Promise<KnowledgeRow[]>;
  saveKnowledge(entry: SaveKnowledgeInput): Promise<void>;
}
