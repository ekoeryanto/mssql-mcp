import { describe, expect, test } from 'bun:test';
import { quoteIdentifierPath } from './identifier.js';

describe('quoteIdentifierPath', () => {
  test('quotes a plain table name', () => {
    expect(quoteIdentifierPath('tb_mcp_skills')).toBe('[tb_mcp_skills]');
  });

  test('quotes a schema-qualified name', () => {
    expect(quoteIdentifierPath('dbo.tb_mcp_skills')).toBe('[dbo].[tb_mcp_skills]');
  });

  test('quotes a database-qualified name', () => {
    expect(quoteIdentifierPath('master.dbo.this_skill')).toBe('[master].[dbo].[this_skill]');
  });

  test('rejects an empty string', () => {
    expect(() => quoteIdentifierPath('')).toThrow();
  });

  test('rejects a name with a space', () => {
    expect(() => quoteIdentifierPath('tb mcp skills')).toThrow();
  });

  test('rejects an injection attempt via a fake dotted segment', () => {
    expect(() => quoteIdentifierPath('tb_mcp_skills]; DROP TABLE users; --')).toThrow();
  });

  test('rejects more than three dotted parts', () => {
    expect(() => quoteIdentifierPath('a.b.c.d')).toThrow();
  });

  test('rejects a part starting with a digit', () => {
    expect(() => quoteIdentifierPath('1table')).toThrow();
  });
});
