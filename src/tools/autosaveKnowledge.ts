/**
 * Wraps a CallToolResult and, when it's large enough to be a token-heavy
 * payload, offloads its full text into tb_mcp_knowledge (via KnowledgeStore)
 * and replaces it with a short preview + pointer. Applied uniformly to every
 * tool's result from a single call site in src/index.ts, so it needs no
 * per-tool special-casing.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { KnowledgeStore, Logger } from '../types/index.js';

const PREVIEW_CHARS = 1500;

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
  } catch (error) {
    logger.error(`Failed to autosave large result for "${toolName}" to knowledge`, error);
    return result;
  }

  const preview = text.slice(0, PREVIEW_CHARS);
  const note =
    `\n\n[Full result (${text.length} chars) saved to knowledge as "${title}" because it exceeded the ` +
    `${thresholdChars}-char autosave threshold. Use search-knowledge with query "${title}" to retrieve the rest. ` +
    `If you expect to run this again, consider generalizing it into a reusable skill with save-skill.]`;

  return { content: [{ type: 'text', text: preview + note }] };
}
