#!/usr/bin/env node

/**
 * MCP Server for Microsoft SQL Server
 * Main entry point - Using modern MCP SDK approach
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as http from 'node:http';
import { loadConfig } from './config/index.js';
import SimpleLogger from './logger/index.js';
import SqlServerConnectionManager from './db/connection.js';
import ToolHandlers from './tools/handlers.js';

// Configuration and logging
const config = loadConfig();
const logger = new SimpleLogger('mssql-mcp', config.logLevel);

// Database connection manager and tool handlers
let db: SqlServerConnectionManager | null = null;
let handlers: ToolHandlers | null = null;

/**
 * Initialize database connection and handlers
 */
async function initializeDb(): Promise<void> {
  if (db === null) {
    db = new SqlServerConnectionManager(config.sqlServer, logger);
    handlers = new ToolHandlers(db, logger, config.sqlServer.allowMutations);
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
async function handleListTools(_request: any): Promise<{ tools: typeof tools }> {
  return { tools };
}

/**
 * Handle call tool request
 */
async function handleCallTool(request: any): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { name, arguments: args } = request.params;

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
    logger.info('Starting MCP SQL Server', { config: config.serverName });

    // Validate configuration
    if (!config.sqlServer.server || !config.sqlServer.username || !config.sqlServer.password) {
      throw new Error('Missing required SQL Server configuration');
    }

    // Initialize database connection
    await initializeDb();

    // Default to 'stdio' so standard MCP clients work out of the box. 
    // If the user wants HTTP/SSE, they can run it with MCP_TRANSPORT=sse
    const mode = process.env.MCP_TRANSPORT === 'sse' ? 'sse' : 'stdio';

    if (mode === 'stdio') {
      // Create the MCP server
      const server = new Server(
        { name: 'mssql-mcp', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
      server.setRequestHandler(ListToolsRequestSchema, handleListTools);
      server.setRequestHandler(CallToolRequestSchema, handleCallTool);

      const transport = new StdioServerTransport();
      await server.connect(transport);
      logger.info('MCP server started successfully on stdio');
    } else {
      const transports = new Map<string, SSEServerTransport>();

      const serverHttp = http.createServer(async (req, res) => {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          res.end();
          return;
        }

        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const pathname = url.pathname;

        if (pathname === '/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            dbConnected: db?.isConnected() || false,
            transport: 'sse'
          }));
          return;
        }

        // Authentication Middleware
        if (config.authToken) {
          const authHeader = req.headers.authorization;
          let isAuthenticated = false;

          if (authHeader) {
            if (authHeader.startsWith('Bearer ')) {
              const token = authHeader.substring(7);
              isAuthenticated = token === config.authToken;
            } else if (authHeader.startsWith('Basic ')) {
              const b64 = authHeader.substring(6);
              const decoded = Buffer.from(b64, 'base64').toString('utf8');
              // Accept the token either as the username or the password part
              const parts = decoded.split(':');
              const password = parts.length > 1 ? parts[1] : parts[0];
              const username = parts[0];
              isAuthenticated = password === config.authToken || username === config.authToken;
            }
          }

          if (!isAuthenticated) {
            res.writeHead(401, {
              'Content-Type': 'application/json',
            });
            res.end(JSON.stringify({ 
              error: 'invalid_token',
              error_description: '401 Unauthorized: Invalid or missing token' 
            }));
            return;
          }
        }

        if (pathname === '/sse' && req.method === 'GET') {
          // Add CORS headers to the SSE response
          res.setHeader('Access-Control-Allow-Origin', '*');

          // Disable buffering for Nginx and other reverse proxies
          res.setHeader('X-Accel-Buffering', 'no');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          // Gunakan absolute URL agar klien tidak salah *resolve* path relatif
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers['x-forwarded-host'] || req.headers.host;
          const absoluteMessageUrl = `${protocol}://${host}/message`;

          const transport = new SSEServerTransport(absoluteMessageUrl, res);

          const server = new Server(
            { name: 'mssql-mcp', version: '1.0.0' },
            { capabilities: { tools: {} } }
          );

          server.setRequestHandler(ListToolsRequestSchema, handleListTools);
          server.setRequestHandler(CallToolRequestSchema, handleCallTool);

          await server.connect(transport);

          // Now that it's connected (and started), store the session
          transports.set(transport.sessionId, transport);

          // Keep-alive ping every 15 seconds to prevent Traefik/Cloudflare from dropping idle connections
          const keepAlive = setInterval(() => {
            res.write(':keepalive\n\n');
          }, 15000);

          res.on('close', () => {
            clearInterval(keepAlive);
            logger.info(`SSE Connection closed for session ${transport.sessionId}, deleting from transports`);
            transports.delete(transport.sessionId);
          });
          return;
        }

        if (pathname === '/message' && req.method === 'POST') {
          logger.info(`Received POST request on ${req.url}`);
          const sessionId = url.searchParams.get('sessionId');
          if (!sessionId) {
            logger.warn(`Missing sessionId. req.url: ${req.url}`);
            res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Missing sessionId parameter');
            return;
          }

          const transport = transports.get(sessionId);
          if (!transport) {
            logger.warn(`Session not found for id: ${sessionId}`);
            res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            // Keep the exact error message that the client seems to be printing
            res.end(`failed to connect (session ID: ${sessionId}): session not found`);
            return;
          }

          // Add CORS headers to the POST response
          res.setHeader('Access-Control-Allow-Origin', '*');
          await transport.handlePostMessage(req, res);
          return;
        }

        // Standard HTTP REST API endpoint for direct queries (outside of MCP)
        if (pathname === '/query' && req.method === 'POST') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');

          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const data = JSON.parse(body);
              if (!data.query) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Missing "query" in request body' }));
                return;
              }

              if (!db) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Database not initialized' }));
                return;
              }

              if (!config.sqlServer.allowMutations) {
                const mutationRegex = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|EXEC|EXECUTE)\b/i;
                if (mutationRegex.test(data.query)) {
                  res.writeHead(403);
                  res.end(JSON.stringify({ error: 'Mutations are disabled. Set SQLSERVER_ALLOW_MUTATIONS=true to enable.' }));
                  return;
                }
              }

              const result = await db.query(data.query);
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, data: result }));
            } catch (err: any) {
              logger.error(`Error in /query: ${err.message}`);
              res.writeHead(500);
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      const port = parseInt(process.env.PORT || '3000', 10);
      serverHttp.listen(port, () => {
        logger.info(`MCP HTTP server listening on port ${port} (SSE endpoint: /sse, Message endpoint: /message)`);
      });
    }
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
