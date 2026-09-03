#!/usr/bin/env node

/**
 * MCP Server for Microsoft SQL Server
 * Main entry point - Using modern MCP SDK approach
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as http from 'node:http';
import { loadConfig } from './config/index.js';
import SimpleLogger from './logger/index.js';
import SqlServerConnectionManager from './db/connection.js';
import ToolHandlers from './tools/handlers.js';
import { callDynamicSkill, loadDynamicTools, saveSkill } from './tools/dynamicSkills.js';
import type { McpToolDef, SaveSkillInput } from './types/index.js';

const SERVER_NAME = 'mssql-mcp';
const SERVER_VERSION = '1.2.0';

// Configuration and logging
const config = loadConfig();
const logger = new SimpleLogger(SERVER_NAME, config.logLevel);

// Database connection manager and tool handlers, created lazily on first tool call
let db: SqlServerConnectionManager | null = null;
let handlers: ToolHandlers | null = null;

async function getStore(): Promise<{ db: SqlServerConnectionManager; handlers: ToolHandlers }> {
  if (!db || !handlers) {
    db = new SqlServerConnectionManager(config.sqlServer, logger);
    handlers = new ToolHandlers(db, logger, config.sqlServer.allowMutations);
    await db.connect();
  }
  return { db, handlers };
}

/**
 * Like getStore(), but never throws — returns null (and logs a warning) if
 * SQL Server is unreachable, so tools/list and dynamic tools/call can
 * degrade gracefully instead of failing the whole request.
 */
async function getStoreOrNull(): Promise<SqlServerConnectionManager | null> {
  try {
    const { db: connectedDb } = await getStore();
    return connectedDb;
  } catch (error) {
    logger.warn('SQL Server unavailable for dynamic skills');
    logger.error('getStore failed', error);
    return null;
  }
}

function toToolResult(result: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

/**
 * Runs a tool handler, initializing the DB connection on first use and
 * converting any thrown error into an MCP tool error result.
 */
async function runTool<T>(fn: (handlers: ToolHandlers) => Promise<T>): Promise<CallToolResult> {
  try {
    const { handlers } = await getStore();
    const result = await fn(handlers);
    return toToolResult(result);
  } catch (error) {
    logger.error('Tool execution failed', error);
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
      isError: true,
    };
  }
}

const staticToolDefs: McpToolDef[] = [
  {
    name: 'query',
    description: 'Execute a SELECT query and retrieve results',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL SELECT query to execute' },
      },
      required: ['query'],
    },
  },
  {
    name: 'execute-statement',
    description: 'Execute INSERT, UPDATE, DELETE, or DDL statements',
    inputSchema: {
      type: 'object',
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
      type: 'object',
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
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the stored procedure' },
        params: {
          type: 'object',
          description: 'Optional parameters object with structure: { paramName: { value: any, output?: boolean } }',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get-status',
    description: 'Get current connection status and pool information',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'save-skill',
    description:
      'Create or update a reusable SQL "skill" exposed as a new tool. Explore the schema with get-metadata first, then define the SQL and its input schema here.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_name: { type: 'string', description: 'Unique snake/kebab-case tool identifier' },
        description: { type: 'string', description: 'What this skill does, shown when browsing tools/list' },
        keywords: { type: 'string', description: 'Comma-separated keywords to help discovery' },
        generated_prompt: {
          type: 'string',
          description:
            'JSON Schema (as a string) describing this tool\'s input arguments. Every property MUST have its own non-empty "description" — this is what a future AI session reads to know what value to supply, so write it as if explaining the parameter to someone who has never seen this skill before.',
        },
        generated_sql: {
          type: 'string',
          description: "Parameterized SQL using @paramName placeholders matching generated_prompt's properties",
        },
      },
      required: ['tool_name', 'description', 'generated_prompt', 'generated_sql'],
    },
  },
];

const STATIC_TOOL_NAMES = new Set(staticToolDefs.map((t) => t.name));

/**
 * Create an MCP server instance wired up to the static SQL tools and the
 * dynamic tb_mcp_skills-backed tools.
 */
function createMcpServer(): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const store = await getStoreOrNull();
    const dynamicTools = store ? await loadDynamicTools(store, logger, STATIC_TOOL_NAMES) : [];
    return { tools: [...staticToolDefs, ...dynamicTools] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'query':
        return runTool((h) => h.handleQuery(args as { query: string }));
      case 'execute-statement':
        return runTool((h) => h.handleExecute(args as { statement: string; params?: Record<string, unknown> }));
      case 'get-metadata':
        return runTool((h) =>
          h.handleMetadata(args as { type: 'databases' | 'tables' | 'columns' | 'procedures'; filter?: string }),
        );
      case 'execute-procedure':
        return runTool((h) =>
          h.handleExecuteProcedure(
            args as { name: string; params?: Record<string, { value?: unknown; output?: boolean }> },
          ),
        );
      case 'get-status':
        return runTool((h) => h.handleGetStatus());
      default: {
        const store = await getStoreOrNull();
        if (!store) {
          return {
            content: [{ type: 'text', text: 'Error: SQL Server is unavailable' }],
            isError: true,
          };
        }
        if (name === 'save-skill') {
          return saveSkill(store, logger, STATIC_TOOL_NAMES, args as unknown as SaveSkillInput);
        }
        return callDynamicSkill(store, logger, name, (args ?? {}) as Record<string, unknown>);
      }
    }
  });

  return server;
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
 * Start the server over stdio.
 */
async function startStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server started successfully on stdio');
}

/**
 * Start the server over HTTP, exposing the Streamable HTTP transport (/mcp).
 */
function startHttpServer(): void {
  const serverHttp = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    let pathname = url.pathname.replace(/\/$/, '');
    if (pathname === '') pathname = '/';

    if (pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          dbConnected: db?.isConnected() || false,
          transports: ['http'],
        }),
      );
      return;
    }

    // Authentication Middleware
    if (config.authToken) {
      const authHeader = req.headers.authorization;
      const queryToken = url.searchParams.get('token');
      let isAuthenticated = false;

      if (queryToken && queryToken === config.authToken) {
        isAuthenticated = true;
      } else if (authHeader) {
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
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'invalid_token',
            error_description: '401 Unauthorized: Invalid or missing token',
          }),
        );
        return;
      }
    }

    // Streamable HTTP transport (MCP spec 2025-03-26+), used by `claude mcp add --transport http`
    if (pathname === '/mcp') {
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed. This server runs in stateless mode: use POST.' },
            id: null,
          }),
        );
        return;
      }

      try {
        // Stateless mode: a fresh server+transport per request, no session tracking needed.
        const mcpServer = createMcpServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
        res.on('close', () => {
          transport.close();
          mcpServer.close();
        });
      } catch (error) {
        logger.error('Error handling /mcp request', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            }),
          );
        }
      }
      return;
    }

    // Standard HTTP REST API endpoint for direct queries (outside of MCP)
    if (pathname === '/query' && req.method === 'POST') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const data = JSON.parse(body) as { query?: string };
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
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Error in /query: ${message}`);
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: message }));
        }
      });
      return;
    }

    logger.warn(`404 Not Found: ${req.method} ${req.url} (resolved pathname: ${pathname})`);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  const port = Number.parseInt(process.env.PORT || '3000', 10);
  serverHttp.listen(port, () => {
    logger.info(`MCP HTTP server listening on port ${port} (Streamable HTTP: /mcp)`);
  });
}

/**
 * Start the server
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting MCP SQL Server', { config: config.serverName });

    if (!config.sqlServer.server || !config.sqlServer.username || !config.sqlServer.password) {
      throw new Error('Missing required SQL Server configuration');
    }

    // Note: the database connection is established lazily on first tool call
    // (see getStore), not here. Connecting eagerly would block the MCP
    // handshake and make `claude mcp add` report a failed connection whenever
    // SQL Server isn't reachable yet at startup.

    // Default to 'stdio' so standard MCP clients work out of the box.
    // Run with MCP_TRANSPORT=http for the network transport (Streamable
    // HTTP). MCP_TRANSPORT=sse is accepted as an alias for backwards
    // compatibility with existing deployments, but only ever serves the
    // Streamable HTTP endpoint now — the legacy SSE transport was removed.
    const useHttp = process.env.MCP_TRANSPORT === 'sse' || process.env.MCP_TRANSPORT === 'http';

    if (useHttp) {
      startHttpServer();
    } else {
      await startStdio();
    }
  } catch (error) {
    logger.error('Failed to start MCP server', error);
    process.exit(1);
  }
}

// `main()` already catches and reports its own errors (see the try/catch
// above), so this never rejects — top-level await, no `.catch` needed.
await main();

export { ToolHandlers, SqlServerConnectionManager };
