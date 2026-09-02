#!/usr/bin/env bun

/**
 * Script to test SQL Server connection
 * Run with: bun scripts/test-connection.ts
 */

import SqlServerConnectionManager from '../src/db/connection.js';
import { loadConfig } from '../src/config/index.js';
import SimpleLogger from '../src/logger/index.js';

async function testConnection(): Promise<void> {
  const config = loadConfig();
  const logger = new SimpleLogger('test-connection', 'info');

  try {
    logger.info('Testing SQL Server connection...', {
      server: config.sqlServer.server,
      port: config.sqlServer.port,
      database: config.sqlServer.database,
    });

    const db = new SqlServerConnectionManager(config.sqlServer, logger);

    // Test connection
    logger.info('Connecting...');
    await db.connect();
    logger.info('✓ Connected successfully');

    // Test query
    logger.info('Testing query execution...');
    const result = await db.query('SELECT GETDATE() as current_time, @@VERSION as sql_version');
    logger.info('✓ Query executed successfully');
    logger.info('Results:', result.recordset?.[0]);

    // Test metadata
    logger.info('Fetching databases...');
    const databases = await db.getMetadata('databases');
    logger.info('✓ Databases retrieved:', { count: databases?.length });

    // Get pool status
    const poolStatus = db.getPoolStatus();
    logger.info('✓ Connection pool status:', poolStatus);

    // Disconnect
    logger.info('Disconnecting...');
    await db.disconnect();
    logger.info('✓ Disconnected successfully');

    logger.info('\n✅ All tests passed!');
  } catch (error) {
    logger.error('❌ Test failed', error);
    process.exit(1);
  }
}

testConnection().catch(console.error);
