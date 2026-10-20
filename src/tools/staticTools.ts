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

  const tools: McpToolDef[] = [
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
      description:
        'Retrieve database metadata (databases, tables, columns, or procedures).' +
        (config.dynamicSkillsEnabled
          ? ' Use this to discover real table/column names before writing a skill with save-skill — never guess them.'
          : ''),
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
          "Search the knowledge base (notes, gotchas, SOP excerpts) for entries relevant to a query. Call this before answering domain-specific questions this server's tools alone don't explain.",
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
          'Add or update a knowledge base entry. Use this whenever you learn something about this database/domain worth remembering for future sessions — table semantics, gotchas, SOP notes.',
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
