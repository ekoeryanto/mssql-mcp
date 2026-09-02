import { describe, expect, test } from 'bun:test';
import { callDynamicSkill, loadDynamicTools, saveSkill, toMcpTool } from './dynamicSkills.js';
import type { Logger, SaveSkillInput, SkillDefinition, SkillRow, SkillsStore } from '../types/index.js';

function makeLogger(): Logger {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function makeStore(overrides: Partial<SkillsStore> = {}): SkillsStore {
  return {
    listSkills: async () => [],
    getSkillDefinition: async () => null,
    executeParameterized: async () => ({ recordset: [] }),
    validateSkillSql: async () => ({ valid: true }),
    upsertSkill: async () => {},
    ...overrides,
  };
}

describe('toMcpTool', () => {
  test('appends keywords to the description', () => {
    const row: SkillRow = {
      tool_name: 'cek-tagihan',
      description: 'Cek tagihan pelanggan',
      keywords: 'tagihan, billing',
      generated_prompt:
        '{"type":"object","properties":{"nomor":{"type":"string","description":"Nomor pelanggan"}}}',
    };
    const result = toMcpTool(row);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tool.description).toBe('Cek tagihan pelanggan (Keywords: tagihan, billing)');
      expect(result.tool.name).toBe('cek-tagihan');
    }
  });

  test('omits the Keywords suffix when there are none', () => {
    const row: SkillRow = {
      tool_name: 'cek-tagihan',
      description: 'Cek tagihan pelanggan',
      keywords: null,
      generated_prompt: '{"type":"object","properties":{}}',
    };
    const result = toMcpTool(row);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tool.description).toBe('Cek tagihan pelanggan');
    }
  });

  test('flags a row with invalid generated_prompt', () => {
    const row: SkillRow = {
      tool_name: 'broken',
      description: 'x',
      keywords: null,
      generated_prompt: 'not json',
    };
    const result = toMcpTool(row);
    expect(result.ok).toBe(false);
  });
});

describe('loadDynamicTools', () => {
  test('skips rows colliding with static tool names', async () => {
    const store = makeStore({
      listSkills: async () => [
        {
          tool_name: 'query',
          description: 'x',
          keywords: null,
          generated_prompt: '{"type":"object","properties":{}}',
        },
      ],
    });
    const tools = await loadDynamicTools(store, makeLogger(), new Set(['query']));
    expect(tools).toEqual([]);
  });

  test('skips rows with corrupt generated_prompt and keeps the rest', async () => {
    const store = makeStore({
      listSkills: async () => [
        { tool_name: 'broken', description: 'x', keywords: null, generated_prompt: 'nope' },
        {
          tool_name: 'ok-skill',
          description: 'y',
          keywords: null,
          generated_prompt: '{"type":"object","properties":{}}',
        },
      ],
    });
    const tools = await loadDynamicTools(store, makeLogger(), new Set());
    expect(tools.map((t) => t.name)).toEqual(['ok-skill']);
  });

  test('returns an empty list when the store throws', async () => {
    const store = makeStore({
      listSkills: async () => {
        throw new Error('connection lost');
      },
    });
    const tools = await loadDynamicTools(store, makeLogger(), new Set());
    expect(tools).toEqual([]);
  });
});

describe('callDynamicSkill', () => {
  test('returns an error when the tool is not found', async () => {
    const store = makeStore({ getSkillDefinition: async () => null });
    const result = await callDynamicSkill(store, makeLogger(), 'missing', {});
    expect(result.isError).toBe(true);
  });

  test('rejects arguments that fail schema validation', async () => {
    const definition: SkillDefinition = {
      generated_prompt:
        '{"type":"object","properties":{"nomor":{"type":"string","description":"Nomor"}},"required":["nomor"]}',
      generated_sql: 'SELECT 1',
    };
    const store = makeStore({ getSkillDefinition: async () => definition });
    const result = await callDynamicSkill(store, makeLogger(), 'cek-tagihan', {});
    expect(result.isError).toBe(true);
  });

  test('executes the query and returns the recordset on valid input', async () => {
    const definition: SkillDefinition = {
      generated_prompt:
        '{"type":"object","properties":{"nomor":{"type":"string","description":"Nomor"}},"required":["nomor"]}',
      generated_sql: 'SELECT * FROM tb_tagihan WHERE nomor = @nomor',
    };
    const store = makeStore({
      getSkillDefinition: async () => definition,
      executeParameterized: async (sqlText, params) => {
        expect(sqlText).toBe(definition.generated_sql);
        expect(params).toEqual({ nomor: '0812' });
        return { recordset: [{ nomor: '0812', status: 'lunas' }] };
      },
    });
    const result = await callDynamicSkill(store, makeLogger(), 'cek-tagihan', { nomor: '0812' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify([{ nomor: '0812', status: 'lunas' }], null, 2),
    });
  });

  test('returns an error when execution throws', async () => {
    const definition: SkillDefinition = {
      generated_prompt: '{"type":"object","properties":{}}',
      generated_sql: 'SELECT * FROM does_not_exist',
    };
    const store = makeStore({
      getSkillDefinition: async () => definition,
      executeParameterized: async () => {
        throw new Error("Invalid object name 'does_not_exist'");
      },
    });
    const result = await callDynamicSkill(store, makeLogger(), 'broken-skill', {});
    expect(result.isError).toBe(true);
  });
});

describe('saveSkill', () => {
  const validInput: SaveSkillInput = {
    tool_name: 'cek-tagihan',
    description: 'Cek tagihan',
    keywords: 'tagihan',
    generated_prompt:
      '{"type":"object","properties":{"nomor":{"type":"string","description":"Nomor pelanggan"}}}',
    generated_sql: 'SELECT * FROM tb_tagihan WHERE nomor = @nomor',
  };

  test('rejects a reserved tool name', async () => {
    const store = makeStore();
    const result = await saveSkill(store, makeLogger(), new Set(['cek-tagihan']), validInput);
    expect(result.isError).toBe(true);
  });

  test('rejects invalid generated_prompt JSON', async () => {
    const store = makeStore();
    const result = await saveSkill(store, makeLogger(), new Set(), {
      ...validInput,
      generated_prompt: 'not json',
    });
    expect(result.isError).toBe(true);
  });

  test('rejects a property with no description', async () => {
    const store = makeStore();
    const input: SaveSkillInput = {
      ...validInput,
      generated_prompt: '{"type":"object","properties":{"nomor":{"type":"string"}}}',
    };
    const result = await saveSkill(store, makeLogger(), new Set(), input);
    expect(result.isError).toBe(true);
  });

  test('rejects when validateSkillSql reports invalid', async () => {
    const store = makeStore({
      validateSkillSql: async () => ({ valid: false, error: "Invalid column name 'nomor'" }),
    });
    const result = await saveSkill(store, makeLogger(), new Set(), validInput);
    expect(result.isError).toBe(true);
  });

  test('saves the skill when everything checks out', async () => {
    let saved: SaveSkillInput | null = null;
    const store = makeStore({
      validateSkillSql: async () => ({ valid: true }),
      upsertSkill: async (skill) => {
        saved = skill;
      },
    });
    const result = await saveSkill(store, makeLogger(), new Set(), validInput);
    expect(result.isError).toBeUndefined();
    expect(saved).toEqual(validInput);
  });
});
