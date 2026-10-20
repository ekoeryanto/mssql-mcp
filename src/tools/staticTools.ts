/**
 * Static tool definitions and annotation resolution based on database
 * capability metadata.
 */

import type { DatabaseCapabilityMetadata, McpToolDef } from '../types/index.js';

export interface StaticToolsConfig {
  dynamicSkillsEnabled: boolean;
  knowledgeEnabled: boolean;
  allowMutations: boolean;
  allowAdditive?: boolean;
}

export function buildStaticToolDefs(
  config: StaticToolsConfig,
  capability?: DatabaseCapabilityMetadata,
): McpToolDef[] {
  const isReadOnly = capability
    ? capability.isReadOnly
    : !config.allowMutations && !config.allowAdditive;

  const isAdditive = capability
    ? Boolean(capability.canInsert && !capability.canMutate)
    : Boolean(config.allowAdditive && !config.allowMutations);

  const allProcsReadOnly = capability
    ? capability.isReadOnly || capability.allProceduresReadOnly
    : !config.allowMutations && !config.allowAdditive;

  const anyProcDestructive = capability
    ? (!allProcsReadOnly && capability.anyProcedureDestructive)
    : false;

  const executeStatementDescription = isAdditive
    ? 'Execute additive INSERT statements (UPDATE, DELETE, and destructive DDL are disabled)'
    : 'Execute INSERT, UPDATE, DELETE, or DDL statements';

  const queryDescription =
    'Execute a SELECT query, CTE, or read-only staging query.' +
    (config.knowledgeEnabled
      ? " TIP: Check 'search-knowledge' first when encountering unfamiliar domain terms, business rules, or status codes."
      : '') +
    (config.dynamicSkillsEnabled
      ? " If a query pattern is frequently reused, consider saving it with 'save-skill'."
      : '');

  const metadataDescription =
    'Retrieve database metadata (databases, tables, columns, or procedures).' +
    (config.knowledgeEnabled
      ? " Consult 'search-knowledge' to understand business semantics of discovered tables."
      : '') +
    (config.dynamicSkillsEnabled
      ? " Use discovered column names to compose reusable tools via 'save-skill' — never guess schema."
      : '');

  const tools: McpToolDef[] = [
    {
      name: 'query',
      description: queryDescription,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SQL SELECT query to execute' },
        },
        required: ['query'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    {
      name: 'execute-statement',
      description: executeStatementDescription,
      inputSchema: {
        type: 'object',
        properties: {
          statement: {
            type: 'string',
            description: isAdditive
              ? 'Additive SQL statement to execute (INSERT into tables; UPDATE and DELETE are prohibited)'
              : 'SQL statement to execute (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP)',
          },
          params: {
            type: 'object',
            description: 'Optional parameters for parameterized queries',
          },
        },
        required: ['statement'],
      },
      annotations: {
        readOnlyHint: isReadOnly,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    {
      name: 'get-metadata',
      description: metadataDescription,
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
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
      annotations: {
        readOnlyHint: allProcsReadOnly,
        destructiveHint: anyProcDestructive,
        openWorldHint: false,
      },
    },
    {
      name: 'get-status',
      description: 'Get current connection status and pool information',
      inputSchema: { type: 'object', properties: {} },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
  ];

  if (config.dynamicSkillsEnabled) {
    tools.push({
      name: 'save-skill',
      description:
        'Define or update a reusable parameterized SQL skill that becomes a permanent MCP tool for future sessions. Call this whenever you compose or discover a query pattern that might be needed again. (Always explore with get-metadata first to verify real table/column names).',
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    });
  }

  if (config.knowledgeEnabled) {
    tools.push(
      {
        name: 'search-knowledge',
        description:
          "RECOMMENDED FIRST STEP for domain questions: Search the knowledge base for table meanings, business rules, gotchas, customer statuses, and formulas before querying or guessing SQL.",
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Free-text search term, matched against title/content/keywords. Omit to list the most recently updated entries.',
            },
            limit: {
              type: 'integer',
              description: 'Max entries to return (1-50, default 10).',
            },
          },
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'save-knowledge',
        description:
          'Save or update a domain note, table semantic description, gotcha, or SOP rule into the knowledge base. Call this whenever you uncover useful domain insights or business logic worth remembering for future sessions.',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              minLength: 1,
              description: 'Unique title identifying this entry. Saving with an existing title overwrites its content.',
            },
            content: { type: 'string', minLength: 1, description: 'The note/fact/doc excerpt itself.' },
            keywords: {
              type: 'string',
              description: 'Optional comma-separated keywords to help future searches find this entry.',
            },
          },
          required: ['title', 'content'],
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
    );
  }

  return tools;
}
