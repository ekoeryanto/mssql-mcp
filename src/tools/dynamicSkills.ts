/**
 * Orchestration for tb_mcp_skills-backed dynamic tools: listing them for
 * tools/list, executing them for tools/call, and validating+saving new
 * ones via the save-skill tool.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import AjvModule from 'ajv';
import { buildDummyArgs, parseSkillPrompt, validatePromptDescriptions } from './skillSchema.js';
import type { Logger, McpToolDef, SaveSkillInput, SkillRow, SkillsStore } from '../types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv = (AjvModule as any).default || AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false });

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export function toMcpTool(row: SkillRow): { ok: true; tool: McpToolDef } | { ok: false; error: string } {
  const parsed = parseSkillPrompt(row.generated_prompt);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const description = row.keywords ? `${row.description} (Keywords: ${row.keywords})` : row.description;
  return { ok: true, tool: { name: row.tool_name, description, inputSchema: parsed.schema } };
}

export async function loadDynamicTools(
  store: SkillsStore,
  logger: Logger,
  staticNames: Set<string>,
): Promise<McpToolDef[]> {
  let rows: SkillRow[];
  try {
    rows = await store.listSkills();
  } catch (error) {
    logger.warn('Failed to list dynamic skills from tb_mcp_skills');
    logger.error('listSkills failed', error);
    return [];
  }

  const tools: McpToolDef[] = [];
  for (const row of rows) {
    if (staticNames.has(row.tool_name)) {
      logger.warn(`Skill "${row.tool_name}" collides with a static tool name, skipping`);
      continue;
    }
    const result = toMcpTool(row);
    if (!result.ok) {
      logger.warn(`Skipping skill "${row.tool_name}": ${result.error}`);
      continue;
    }
    tools.push(result.tool);
  }
  return tools;
}

export async function callDynamicSkill(
  store: SkillsStore,
  logger: Logger,
  toolName: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const definition = await store.getSkillDefinition(toolName);
  if (!definition) {
    return errorResult(`Tool not found: ${toolName}`);
  }

  const parsed = parseSkillPrompt(definition.generated_prompt);
  if (!parsed.ok) {
    logger.error(`Skill "${toolName}" has a corrupt generated_prompt`, parsed.error);
    return errorResult(`Skill "${toolName}" is misconfigured: ${parsed.error}`);
  }

  const validate = ajv.compile(parsed.schema);
  if (!validate(args)) {
    const messages = (validate.errors ?? [])
      .map((e: typeof validate.errors[number]) => `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}`)
      .join('; ');
    return errorResult(`Invalid arguments: ${messages}`);
  }

  try {
    const result = await store.executeParameterized(definition.generated_sql, args);
    return { content: [{ type: 'text', text: JSON.stringify(result.recordset ?? [], null, 2) }] };
  } catch (error) {
    logger.error(`Skill "${toolName}" execution failed`, error);
    return errorResult(error instanceof Error ? error.message : 'Unknown error');
  }
}

export async function saveSkill(
  store: SkillsStore,
  logger: Logger,
  staticNames: Set<string>,
  input: SaveSkillInput,
): Promise<CallToolResult> {
  if (staticNames.has(input.tool_name)) {
    return errorResult(`"${input.tool_name}" is a reserved tool name`);
  }

  const parsed = parseSkillPrompt(input.generated_prompt);
  if (!parsed.ok) {
    return errorResult(parsed.error);
  }

  const descriptionCheck = validatePromptDescriptions(parsed.schema);
  if (!descriptionCheck.ok) {
    return errorResult(`Property "${descriptionCheck.property}" in generated_prompt is missing a "description"`);
  }

  const dummyArgs = buildDummyArgs(parsed.schema);
  const validation = await store.validateSkillSql(input.generated_sql, dummyArgs);
  if (!validation.valid) {
    return errorResult(`generated_sql failed validation: ${validation.error}`);
  }

  try {
    await store.upsertSkill(input);
  } catch (error) {
    logger.error(`Failed to save skill "${input.tool_name}"`, error);
    return errorResult(error instanceof Error ? error.message : 'Unknown error');
  }

  return { content: [{ type: 'text', text: `Skill "${input.tool_name}" saved and active.` }] };
}
