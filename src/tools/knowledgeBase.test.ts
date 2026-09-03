import { describe, expect, test } from 'bun:test';
import { saveKnowledgeTool, searchKnowledgeTool } from './knowledgeBase.js';
import type { KnowledgeRow, KnowledgeStore, Logger, SaveKnowledgeInput } from '../types/index.js';

function makeLogger(): Logger {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function makeStore(overrides: Partial<KnowledgeStore> = {}): KnowledgeStore {
  return {
    searchKnowledge: async () => [],
    saveKnowledge: async () => {},
    ...overrides,
  };
}

describe('searchKnowledgeTool', () => {
  test('passes query through and limit clamped to the default when omitted', async () => {
    let seenQuery: string | undefined = 'unset';
    let seenLimit = -1;
    const store = makeStore({
      searchKnowledge: async (query, limit) => {
        seenQuery = query;
        seenLimit = limit;
        return [];
      },
    });
    await searchKnowledgeTool(store, makeLogger(), {});
    expect(seenQuery).toBeUndefined();
    expect(seenLimit).toBe(10);
  });

  test('clamps a limit above 50 down to 50', async () => {
    let seenLimit = -1;
    const store = makeStore({
      searchKnowledge: async (_query, limit) => {
        seenLimit = limit;
        return [];
      },
    });
    await searchKnowledgeTool(store, makeLogger(), { limit: 999 });
    expect(seenLimit).toBe(50);
  });

  test('clamps a limit below 1 up to 1', async () => {
    let seenLimit = -1;
    const store = makeStore({
      searchKnowledge: async (_query, limit) => {
        seenLimit = limit;
        return [];
      },
    });
    await searchKnowledgeTool(store, makeLogger(), { limit: 0 });
    expect(seenLimit).toBe(1);
  });

  test('an empty result set is success, not isError', async () => {
    const store = makeStore({ searchKnowledge: async () => [] });
    const result = await searchKnowledgeTool(store, makeLogger(), { query: 'nothing matches' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: 'text', text: JSON.stringify([], null, 2) });
  });

  test('returns matching rows as JSON text', async () => {
    const rows: KnowledgeRow[] = [
      { title: 'tb_tagihan.status', content: '1=lunas, 2=belum', keywords: 'tagihan', updated_at: new Date('2026-01-01T00:00:00Z') },
    ];
    const store = makeStore({ searchKnowledge: async () => rows });
    const result = await searchKnowledgeTool(store, makeLogger(), { query: 'tagihan' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: 'text', text: JSON.stringify(rows, null, 2) });
  });

  test('returns isError when the store throws', async () => {
    const store = makeStore({
      searchKnowledge: async () => {
        throw new Error('connection lost');
      },
    });
    const result = await searchKnowledgeTool(store, makeLogger(), {});
    expect(result.isError).toBe(true);
  });
});

describe('saveKnowledgeTool', () => {
  const validInput: SaveKnowledgeInput = {
    title: 'tb_tagihan.status meanings',
    content: '1=lunas, 2=belum bayar, 3=cicilan',
    keywords: 'tagihan, billing',
  };

  test('saves and returns a confirmation', async () => {
    let saved: SaveKnowledgeInput | null = null;
    const store = makeStore({
      saveKnowledge: async (entry) => {
        saved = entry;
      },
    });
    const result = await saveKnowledgeTool(store, makeLogger(), validInput);
    expect(result.isError).toBeUndefined();
    expect(saved).toEqual(validInput);
  });

  test('returns isError when the store throws', async () => {
    const store = makeStore({
      saveKnowledge: async () => {
        throw new Error("Violation of UNIQUE KEY constraint");
      },
    });
    const result = await saveKnowledgeTool(store, makeLogger(), validInput);
    expect(result.isError).toBe(true);
  });
});
