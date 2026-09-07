import { describe, expect, test } from 'bun:test';
import { maybeAutosaveLargeResult } from './autosaveKnowledge.js';
import type { KnowledgeStore, Logger, SaveKnowledgeInput } from '../types/index.js';

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

describe('maybeAutosaveLargeResult', () => {
  test('passes small results through unchanged', async () => {
    const store = makeStore();
    const result = { content: [{ type: 'text' as const, text: 'small' }] };
    const out = await maybeAutosaveLargeResult(store, makeLogger(), 'query', 8000, result);
    expect(out).toEqual(result);
  });

  test('passes error results through unchanged even if large', async () => {
    const store = makeStore();
    const result = { content: [{ type: 'text' as const, text: 'x'.repeat(9000) }], isError: true };
    const out = await maybeAutosaveLargeResult(store, makeLogger(), 'query', 8000, result);
    expect(out).toEqual(result);
  });

  test('offloads a large result to knowledge and returns a preview + pointer', async () => {
    let saved: SaveKnowledgeInput | null = null;
    const store = makeStore({
      saveKnowledge: async (entry) => {
        saved = entry;
      },
    });
    const bigText = 'x'.repeat(9000);
    const result = { content: [{ type: 'text' as const, text: bigText }] };
    const out = await maybeAutosaveLargeResult(store, makeLogger(), 'query', 8000, result);

    expect(saved).not.toBeNull();
    expect(saved!.content).toBe(bigText);
    expect(saved!.title).toStartWith('autosave:query:');
    expect(saved!.keywords).toBe('autosave, query');

    expect(out.isError).toBeUndefined();
    const text = out.content[0]!.type === 'text' ? out.content[0]!.text : '';
    expect(text.length).toBeLessThan(bigText.length);
    expect(text).toContain(saved!.title);
    expect(text).toContain('search-knowledge');
  });

  test('falls back to the original result when saveKnowledge fails', async () => {
    const store = makeStore({
      saveKnowledge: async () => {
        throw new Error('connection lost');
      },
    });
    const bigText = 'x'.repeat(9000);
    const result = { content: [{ type: 'text' as const, text: bigText }] };
    const out = await maybeAutosaveLargeResult(store, makeLogger(), 'query', 8000, result);
    expect(out).toEqual(result);
  });
});
