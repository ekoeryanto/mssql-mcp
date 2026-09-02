import { describe, expect, test } from 'bun:test';
import { buildDummyArgs, parseSkillPrompt, validatePromptDescriptions } from './skillSchema.js';

describe('parseSkillPrompt', () => {
  test('parses a valid schema', () => {
    const result = parseSkillPrompt('{"type":"object","properties":{"id":{"type":"string"}}}');
    expect(result.ok).toBe(true);
  });

  test('rejects invalid JSON', () => {
    const result = parseSkillPrompt('not json');
    expect(result).toEqual({ ok: false, error: 'generated_prompt is not valid JSON' });
  });

  test('rejects JSON without a properties object', () => {
    const result = parseSkillPrompt('{"type":"object"}');
    expect(result).toEqual({
      ok: false,
      error: 'generated_prompt must have a "properties" object',
    });
  });

  test('rejects a JSON array', () => {
    const result = parseSkillPrompt('[]');
    expect(result.ok).toBe(false);
  });

  test('rejects a bare JSON string', () => {
    const result = parseSkillPrompt('"hello"');
    expect(result.ok).toBe(false);
  });
});

describe('validatePromptDescriptions', () => {
  test('passes when every property has a description', () => {
    const result = validatePromptDescriptions({
      type: 'object',
      properties: { nomor: { type: 'string', description: 'Nomor pelanggan' } },
    });
    expect(result).toEqual({ ok: true });
  });

  test('passes when there are no properties at all', () => {
    const result = validatePromptDescriptions({ type: 'object', properties: {} });
    expect(result).toEqual({ ok: true });
  });

  test('fails when a property has no description', () => {
    const result = validatePromptDescriptions({
      type: 'object',
      properties: { nomor: { type: 'string' } },
    });
    expect(result).toEqual({ ok: false, property: 'nomor' });
  });

  test('fails when a description is an empty/whitespace string', () => {
    const result = validatePromptDescriptions({
      type: 'object',
      properties: { nomor: { type: 'string', description: '   ' } },
    });
    expect(result).toEqual({ ok: false, property: 'nomor' });
  });
});

describe('buildDummyArgs', () => {
  test('builds a placeholder per declared type', () => {
    const dummy = buildDummyArgs({
      type: 'object',
      properties: {
        nomor: { type: 'string' },
        jumlah: { type: 'number' },
        tahun: { type: 'integer' },
        aktif: { type: 'boolean' },
        misc: { type: 'object' },
        untyped: {},
      },
    });
    expect(dummy).toEqual({
      nomor: '',
      jumlah: 0,
      tahun: 0,
      aktif: false,
      misc: null,
      untyped: null,
    });
  });

  test('returns an empty object when there are no properties', () => {
    expect(buildDummyArgs({ type: 'object', properties: {} })).toEqual({});
  });
});
