/**
 * Orchestration for tb_mcp_skills-backed dynamic tools: listing them for
 * tools/list, executing them for tools/call, and validating+saving new
 * ones via the save-skill tool.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import AjvModule, { type ErrorObject, type ValidateFunction } from 'ajv';
import { buildDummyArgs, parseSkillPrompt, validatePromptDescriptions } from './skillSchema.js';
import type {
  JsonSchemaObject,
  Logger,
  McpToolDef,
  SaveSkillInput,
  SkillRow,
  SkillsStore,
} from '../types/index.js';

// ajv v8 ships as CJS; under nodenext/esModuleInterop the default export
// sometimes lands on `.default` and sometimes on the module itself depending
// on the consumer's module resolution, so both are checked here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv = (AjvModule as any).default || AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false });

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/**
 * ajv.compile() throws (rather than returning a failure value) when given
 * JSON that parses fine but isn't a valid JSON Schema (bad `type` enum,
 * `required` as a non-array, an unresolvable `$ref`, etc). Every caller here
 * needs that to be a normal failure result, not an uncaught exception.
 */
function compileSkillSchema(
  schema: JsonSchemaObject,
): { ok: true; validate: ValidateFunction } | { ok: false; error: string } {
  try {
    const validate = ajv.compile(schema);
    // A `$async: true` schema makes ajv return a Promise from validate(),
    // which is always truthy — `if (!validate(args))` below would never
    // fire, silently skipping validation and leaving an unhandled
    // rejection on a failed check. Dynamic skill schemas have no reason
    // to be async, so reject them at compile time instead.
    if (validate.$async) {
      return { ok: false, error: 'schema must not be async ($async: true is not supported)' };
    }
    return { ok: true, validate };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export function toMcpTool(row: SkillRow): { ok: true; tool: McpToolDef } | { ok: false; error: string } {
  const parsed = parseSkillPrompt(row.generated_prompt);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const compiled = compileSkillSchema(parsed.schema);
  if (!compiled.ok) {
    return { ok: false, error: `generated_prompt is not a valid JSON Schema: ${compiled.error}` };
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

  const compiled = compileSkillSchema(parsed.schema);
  if (!compiled.ok) {
    logger.error(`Skill "${toolName}" has an invalid generated_prompt JSON Schema`, compiled.error);
    return errorResult(`Skill "${toolName}" is misconfigured: schema is invalid: ${compiled.error}`);
  }
  const validate = compiled.validate;
  if (!validate(args)) {
    const messages = (validate.errors ?? [])
      .map((e: ErrorObject) => `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}`)
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

  const compiled = compileSkillSchema(parsed.schema);
  if (!compiled.ok) {
    return errorResult(`generated_prompt is not a valid JSON Schema: ${compiled.error}`);
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
