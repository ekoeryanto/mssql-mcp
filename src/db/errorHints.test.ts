import { describe, expect, test } from 'bun:test';
import { describeMissingParameter, extractParameterNames, extractTableNames, parseInvalidIdentifier, suggestSimilar } from './errorHints.js';

describe('parseInvalidIdentifier', () => {
  test('detects an invalid column name', () => {
    expect(parseInvalidIdentifier("Invalid column name 'tgl_bayar'.")).toEqual({
      kind: 'column',
      name: 'tgl_bayar',
    });
  });

  test('detects an invalid object name and keeps the last schema part', () => {
    expect(parseInvalidIdentifier("Invalid object name 'dbo.pelanggann'.")).toEqual({
      kind: 'object',
      name: 'pelanggann',
    });
  });

  test('returns null for unrelated errors', () => {
    expect(parseInvalidIdentifier('Incorrect syntax near the keyword FROM.')).toBeNull();
  });
});

describe('suggestSimilar', () => {
  test('ranks the closest candidates first, case-insensitively', () => {
    const result = suggestSimilar('tgl_bayar', ['tanggal_bayar', 'TGL_BAYAR22', 'nama', 'tgl_bayr']);
    expect(result[0]).toBe('tgl_bayr');
    expect(result).toContain('TGL_BAYAR22');
    expect(result).not.toContain('nama');
  });

  test('returns nothing when no candidate is close', () => {
    expect(suggestSimilar('xyz', ['pelanggan', 'tagihan'])).toEqual([]);
  });

  test('limits the number of suggestions', () => {
    const result = suggestSimilar('kolom', ['kolom1', 'kolom2', 'kolom3', 'kolom4'], 2);
    expect(result).toHaveLength(2);
  });
});

describe('extractTableNames', () => {
  test('collects FROM and JOIN tables without schema or brackets', () => {
    const sql = 'SELECT * FROM dbo.pelanggan p JOIN [tagihan] t ON t.id = p.id';
    expect(extractTableNames(sql)).toEqual(['pelanggan', 'tagihan']);
  });

  test('skips temp tables, table variables and subqueries', () => {
    const sql = 'SELECT * FROM #tmp JOIN @tv v ON 1=1 JOIN (SELECT 1 a) s ON 1=1 FROM real_table';
    expect(extractTableNames(sql)).toEqual(['real_table']);
  });

  test('ignores table names that appear only inside comments or strings', () => {
    const sql = "SELECT 'from fake_table' AS x -- join other_fake\nFROM kasir";
    expect(extractTableNames(sql)).toEqual(['kasir']);
  });
});

describe('describeMissingParameter', () => {
  test('names the missing parameter and lists accepted vs received arguments', () => {
    const hint = describeMissingParameter('Must declare the scalar variable "@tanggal".', ['tanggal', 'wilayah'], ['tgl']);
    expect(hint).toBe("Parameter 'tanggal' was not provided. Accepted: tanggal, wilayah. Received: tgl (unknown: tgl).");
  });

  test('omits the unknown list when every received argument is accepted', () => {
    const hint = describeMissingParameter('Must declare the scalar variable "@wilayah".', ['tanggal', 'wilayah'], ['tanggal']);
    expect(hint).toBe("Parameter 'wilayah' was not provided. Accepted: tanggal, wilayah. Received: tanggal.");
  });

  test('says none when nothing was received or accepted', () => {
    const hint = describeMissingParameter('Must declare the scalar variable "@x".', [], []);
    expect(hint).toBe("Parameter 'x' was not provided. Accepted: (none). Received: (none).");
  });

  test('matches table variables too', () => {
    expect(describeMissingParameter('Must declare the table variable "@t".', [], [])).toContain("Parameter 't'");
  });

  test('returns null for unrelated errors', () => {
    expect(describeMissingParameter('Incorrect syntax near FROM.', ['a'], ['a'])).toBeNull();
  });
});

describe('extractParameterNames', () => {
  test('collects distinct @parameters in order of appearance', () => {
    expect(extractParameterNames('WHERE a = @tanggal AND b = @wilayah AND c = @tanggal')).toEqual(['tanggal', 'wilayah']);
  });

  test('ignores system variables, DECLAREd variables, strings and comments', () => {
    const sql = "DECLARE @x INT; SELECT @x, @y, @@ROWCOUNT, '@fake' -- @ghost";
    expect(extractParameterNames(sql)).toEqual(['y']);
  });
});
