/**
 * Configuration loader from environment variables
 */

import type { SqlServerConfig, LogLevel } from '../types/index.js';

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  // Log untuk debugging
  process.stderr.write(`\x1b[36m[CONFIG] ${key}=${value ? '***' : 'UNDEFINED'} (default: ${defaultValue || 'NONE'})\x1b[0m\n`);

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
  // Debug: log semua env variables
  process.stderr.write('\x1b[36m[CONFIG] Loading configuration...\x1b[0m\n');
  process.stderr.write(`\x1b[36m[CONFIG] Available env keys: ${Object.keys(process.env).filter(k => k.startsWith('SQLSERVER')).join(', ')}\x1b[0m\n`);

  return {
    sqlServer: {
      server: getEnv('SQLSERVER_SERVER', 'localhost'),
      port: getEnvNumber('SQLSERVER_PORT', 1433),
      database: getEnv('SQLSERVER_DATABASE', 'master'),
      username: getEnv('SQLSERVER_USERNAME', 'sa'),  // Add default
      password: getEnv('SQLSERVER_PASSWORD', ''),    // Don't throw if empty
      encrypt: getEnvBoolean('SQLSERVER_ENCRYPT', false),
      trustServerCertificate: getEnvBoolean('SQLSERVER_TRUST_SERVER_CERTIFICATE', true),
      allowMutations: getEnvBoolean('SQLSERVER_ALLOW_MUTATIONS', false),
      connectionPoolMin: getEnvNumber('SQLSERVER_CONNECTION_POOL_MIN', 2),
      connectionPoolMax: getEnvNumber('SQLSERVER_CONNECTION_POOL_MAX', 10),
      requestTimeout: getEnvNumber('SQLSERVER_REQUEST_TIMEOUT', 30000),
    },
    logLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
    serverName: getEnv('MCP_SERVER_NAME', 'mssql-mcp'),
  };
}
