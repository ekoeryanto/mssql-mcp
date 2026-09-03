/**
 * Orchestration for the tb_mcp_knowledge-backed search-knowledge and
 * save-knowledge tools. Entries are inert text, never executed, so unlike
 * dynamicSkills.ts there is no SQL dry-run and no JSON Schema to compile —
 * the only validation is what the tools' own inputSchema (required fields)
 * already enforces via src/index.ts's static-tool ajv path.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { KnowledgeStore, Logger, SaveKnowledgeInput } from '../types/index.js';

const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function clampLimit(rawLimit: unknown): number {
  const n = typeof rawLimit === 'number' ? rawLimit : DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(n)));
}

export async function searchKnowledgeTool(
  store: KnowledgeStore,
  logger: Logger,
  args: { query?: unknown; limit?: unknown },
): Promise<CallToolResult> {
  const query = typeof args.query === 'string' ? args.query : undefined;
  const limit = clampLimit(args.limit);

  try {
    const rows = await store.searchKnowledge(query, limit);
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  } catch (error) {
    logger.error('search-knowledge failed', error);
    return errorResult(error instanceof Error ? error.message : 'Unknown error');
  }
}

export async function saveKnowledgeTool(
  store: KnowledgeStore,
  logger: Logger,
  input: SaveKnowledgeInput,
): Promise<CallToolResult> {
  try {
    await store.saveKnowledge(input);
  } catch (error) {
    logger.error(`Failed to save knowledge entry "${input.title}"`, error);
    return errorResult(error instanceof Error ? error.message : 'Unknown error');
  }
  return { content: [{ type: 'text', text: `Knowledge entry "${input.title}" saved.` }] };
}
