/**
 * Pure helpers for interpreting a skill's generated_prompt JSON Schema
 * string. No I/O, no knowledge of tb_mcp_skills rows — see dynamicSkills.ts
 * for that.
 */

import type { JsonSchemaObject, JsonSchemaProperty } from '../types/index.js';

export type ParsePromptResult = { ok: true; schema: JsonSchemaObject } | { ok: false; error: string };

export function parseSkillPrompt(raw: string): ParsePromptResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'generated_prompt is not valid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'generated_prompt must be a JSON object' };
  }

  const schema = parsed as JsonSchemaObject;
  if (typeof schema.properties !== 'object' || schema.properties === null || Array.isArray(schema.properties)) {
    return { ok: false, error: 'generated_prompt must have a "properties" object' };
  }

  return { ok: true, schema };
}

export type DescriptionCheckResult = { ok: true } | { ok: false; property: string };

export function validatePromptDescriptions(schema: JsonSchemaObject): DescriptionCheckResult {
  const properties = schema.properties ?? {};
  for (const [name, prop] of Object.entries(properties)) {
    if (typeof prop.description !== 'string' || prop.description.trim() === '') {
      return { ok: false, property: name };
    }
  }
  return { ok: true };
}

function dummyValueForType(type: JsonSchemaProperty['type']): unknown {
  switch (type) {
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'string':
      return '';
    default:
      return null;
  }
}

export function buildDummyArgs(schema: JsonSchemaObject): Record<string, unknown> {
  const properties = schema.properties ?? {};
  const dummy: Record<string, unknown> = {};
  for (const [name, prop] of Object.entries(properties)) {
    dummy[name] = dummyValueForType(prop.type);
  }
  return dummy;
}
