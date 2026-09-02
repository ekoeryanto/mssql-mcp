/**
 * Configuration loader from environment variables
 */

import type { SqlServerConfig, LogLevel } from '../types/index.js';

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue || '';
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value) {
    return parseInt(value, 10);
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Missing required environment variable: ${key}`);
}

function getEnvBoolean(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  if (value === undefined && defaultValue !== undefined) {
    return defaultValue;
  }
  return value === 'true' || value === '1' || value === 'yes';
}

export function loadConfig(): {
  sqlServer: SqlServerConfig;
  logLevel: LogLevel;
  serverName: string;
} {
  return {
    sqlServer: {
      server: getEnv('SQLSERVER_SERVER', 'localhost'),
      port: getEnvNumber('SQLSERVER_PORT', 1433),
      database: getEnv('SQLSERVER_DATABASE', 'master'),
      username: getEnv('SQLSERVER_USERNAME'),
      password: getEnv('SQLSERVER_PASSWORD'),
      encrypt: getEnvBoolean('SQLSERVER_ENCRYPT', false),
      trustServerCertificate: getEnvBoolean('SQLSERVER_TRUST_SERVER_CERTIFICATE', true),
      connectionPoolMin: getEnvNumber('SQLSERVER_CONNECTION_POOL_MIN', 2),
      connectionPoolMax: getEnvNumber('SQLSERVER_CONNECTION_POOL_MAX', 10),
      requestTimeout: getEnvNumber('SQLSERVER_REQUEST_TIMEOUT', 30000),
    },
    logLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
    serverName: getEnv('MCP_SERVER_NAME', 'mcp-sqlserver'),
  };
}
