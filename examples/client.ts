/**
 * Example MCP Client for SQL Server
 * Demonstrates how to use the MCP server
 *
 * Run with: bun run build && bun examples/client.ts
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main(): Promise<void> {
  // The transport spawns and owns the server subprocess (stdio).
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
  });

  const client = new Client({
    name: 'example-client',
    version: '1.0.0',
  });

  try {
    await client.connect(transport);

    console.log('Connected to MCP SQL Server\n');

    console.log('=== Example 1: Get Connection Status ===');
    const statusResult = await client.callTool({ name: 'get-status', arguments: {} });
    console.log('Status:', JSON.stringify(statusResult, null, 2));
    console.log();

    console.log('=== Example 2: List Tables ===');
    const tablesResult = await client.callTool({ name: 'get-metadata', arguments: { type: 'tables' } });
    console.log('Tables:', JSON.stringify(tablesResult, null, 2));
    console.log();

    console.log('=== Example 3: Create Test Table ===');
    const createResult = await client.callTool({
      name: 'execute-statement',
      arguments: {
        statement: `
          IF OBJECT_ID('dbo.test_users', 'U') IS NOT NULL
            DROP TABLE dbo.test_users;

          CREATE TABLE dbo.test_users (
            id INT PRIMARY KEY IDENTITY(1,1),
            name NVARCHAR(100) NOT NULL,
            email NVARCHAR(100) NOT NULL,
            created_at DATETIME DEFAULT GETDATE()
          );
        `,
      },
    });
    console.log('Create Result:', JSON.stringify(createResult, null, 2));
    console.log();

    console.log('=== Example 4: Insert Data ===');
    const insertResult = await client.callTool({
      name: 'execute-statement',
      arguments: {
        statement: 'INSERT INTO dbo.test_users (name, email) VALUES (@name, @email)',
        params: { name: 'John Doe', email: 'john@example.com' },
      },
    });
    console.log('Insert Result:', JSON.stringify(insertResult, null, 2));
    console.log();

    console.log('=== Example 5: Query Data ===');
    const queryResult = await client.callTool({
      name: 'query',
      arguments: { query: 'SELECT * FROM dbo.test_users' },
    });
    console.log('Query Result:', JSON.stringify(queryResult, null, 2));
    console.log();

    console.log('=== Example 6: Get Column Metadata ===');
    const columnsResult = await client.callTool({
      name: 'get-metadata',
      arguments: { type: 'columns', filter: 'test_users' },
    });
    console.log('Columns:', JSON.stringify(columnsResult, null, 2));
    console.log();

    console.log('=== Example 7: Update Data ===');
    const updateResult = await client.callTool({
      name: 'execute-statement',
      arguments: {
        statement: 'UPDATE dbo.test_users SET name = @name WHERE id = @id',
        params: { name: 'Jane Doe', id: 1 },
      },
    });
    console.log('Update Result:', JSON.stringify(updateResult, null, 2));
    console.log();

    console.log('=== Example 8: Delete Data ===');
    const deleteResult = await client.callTool({
      name: 'execute-statement',
      arguments: {
        statement: 'DELETE FROM dbo.test_users WHERE id = @id',
        params: { id: 1 },
      },
    });
    console.log('Delete Result:', JSON.stringify(deleteResult, null, 2));
    console.log();

    console.log('=== Cleanup: Drop Test Table ===');
    const dropResult = await client.callTool({
      name: 'execute-statement',
      arguments: { statement: 'DROP TABLE IF EXISTS dbo.test_users' },
    });
    console.log('Drop Result:', JSON.stringify(dropResult, null, 2));
  } finally {
    await client.close();
  }
}

try {
  await main();
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
