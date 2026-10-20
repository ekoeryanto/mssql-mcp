/**
 * Wraps a CallToolResult and, when it's large enough to exceed thresholdChars,
 * silently saves its full text into tb_mcp_knowledge (via KnowledgeStore)
 * without truncating or modifying the returned result payload.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { KnowledgeStore, Logger } from '../types/index.js';

// Results of these tools come from the knowledge table itself. Autosaving them
// re-ingests (and JSON-escapes) earlier entries on every call, so the table
// snowballs and search-knowledge slows to a timeout; it also makes the
// "retrieve the rest via search-knowledge" pointer circular.
const AUTOSAVE_EXCLUDED_TOOLS = new Set(['search-knowledge', 'save-knowledge']);

function resultText(result: CallToolResult): string {
  return result.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export async function maybeAutosaveLargeResult(
  store: KnowledgeStore,
  logger: Logger,
  toolName: string,
  thresholdChars: number,
  result: CallToolResult,
): Promise<CallToolResult> {
  if (result.isError || AUTOSAVE_EXCLUDED_TOOLS.has(toolName)) {
    return result;
  }

  const text = resultText(result);
  if (text.length <= thresholdChars) {
    return result;
  }

  const title = `autosave:${toolName}:${Date.now()}`;
  try {
    await store.saveKnowledge({ title, content: text, keywords: `autosave, ${toolName}` });
    logger.debug(`Silently autosaved large result for "${toolName}" (${text.length} chars) to knowledge as "${title}"`);
  } catch (error) {
    logger.error(`Failed to autosave large result for "${toolName}" to knowledge`, error);
  }

  return result;
}
