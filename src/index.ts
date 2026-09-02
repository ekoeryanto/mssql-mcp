#!/usr/bin/env node

/**
 * MCP Server for Microsoft SQL Server
 * Main entry point - Using modern MCP SDK approach
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolRequest, ListToolsRequest } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config/index.js';
import SimpleLogger from './logger/index.js';
import SqlServerConnectionManager from './db/connection.js';
import ToolHandlers from './tools/handlers.js';

// Configuration and logging
const config = loadConfig();
const logger = new SimpleLogger('mcp-sqlserver', config.logLevel);

// Database connection manager and tool handlers
let db: SqlServerConnectionManager | null = null;
let handlers: ToolHandlers | null = null;

/**
 * Initialize database connection and handlers
 */
async function initializeDb(): Promise<void> {
  if (db === null) {
    db = new SqlServerConnectionManager(config.sqlServer, logger);
    handlers = new ToolHandlers(db, logger);
    await db.connect();
  }
}

/**
 * Define MCP tools
 */
const tools = [
  {
    name: 'query',
    description: 'Execute a SELECT query and retrieve results',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'SQL SELECT query to execute',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'execute-statement',
    description: 'Execute INSERT, UPDATE, DELETE, or DDL statements',
    inputSchema: {
      type: 'object' as const,
      properties: {
        statement: {
          type: 'string',
          description: 'SQL statement to execute (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP)',
        },
        params: {
          type: 'object',
          description: 'Optional parameters for parameterized queries',
        },
      },
      required: ['statement'],
    },
  },
  {
    name: 'get-metadata',
    description: 'Retrieve database metadata (databases, tables, columns, or procedures)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['databases', 'tables', 'columns', 'procedures'],
          description: 'Type of metadata to retrieve',
        },
        filter: {
          type: 'string',
          description: 'Optional filter (e.g., table name for columns query)',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'execute-procedure',
    description: 'Execute a stored procedure with optional input/output parameters',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Name of the stored procedure',
        },
        params: {
          type: 'object',
          description:
            'Optional parameters object with structure: { paramName: { value: any, output?: boolean } }',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get-status',
    description: 'Get current connection status and pool information',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

/**
 * Handle list tools request
 */
async function handleListTools(request: ListToolsRequest): Promise<{ tools: typeof tools }> {
  return { tools };
}

/**
 * Handle call tool request
 */
async function handleCallTool(request: CallToolRequest): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { name, arguments: args } = request;

  try {
    // Ensure database is initialized
    await initializeDb();

    if (!handlers) {
      throw new Error('Handlers not initialized');
    }

    let result: unknown;

    switch (name) {
      case 'query':
        result = await handlers.handleQuery(args as Record<string, unknown>);
        break;

      case 'execute-statement':
        result = await handlers.handleExecute(args as Record<string, unknown>);
        break;

      case 'get-metadata':
        result = await handlers.handleMetadata(args as Record<string, unknown>);
        break;

      case 'execute-procedure':
        result = await handlers.handleExecuteProcedure(args as Record<string, unknown>);
        break;

      case 'get-status':
        result = await handlers.handleGetStatus();
        break;

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
        };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('Tool execution failed', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
}

/**
 * Handle graceful shutdown
 */
async function shutdown(): Promise<void> {
  logger.info('Shutting down MCP server');
  if (db) {
    await db.disconnect();
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/**
 * Start the server
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting MCP SQL Server');

    if (!config.sqlServer.server || !config.sqlServer.username) {
      throw new Error('Missing required SQL Server configuration');
    }

    await initializeDb();

    // Setup stdin/stdout handlers
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', async (chunk: string) => {
      try {
        const message = JSON.parse(chunk);
        
        let result: any;
        
        if (message.method === 'tools/list') {
          result = await handleListTools({} as any);
        } else if (message.method === 'tools/call') {
          result = await handleCallTool(message.params);
        }

        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result,
          }) + '\n'
        );
      } catch (error) {
        logger.error('Error processing message', error);
        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: (message as any)?.id,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Error',
            },
          }) + '\n'
        );
      }
    });

    process.stdin.on('error', (error) => {
      logger.error('Stdin error', error);
      process.exit(1);
    });

    logger.info('MCP server started successfully');
  } catch (error) {
    logger.error('Failed to start MCP server', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});

export { ToolHandlers, SqlServerConnectionManager };
