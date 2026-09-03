/**
 * Safe quoting for a configurable SQL Server object name (e.g. the
 * dynamic-skills table, which comes from an environment variable and can't
 * be bound as a query parameter the way values can).
 */

const IDENTIFIER_PART = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validates a dotted identifier path (`table`, `schema.table`, or
 * `database.schema.table`) and returns it with every part bracket-quoted
 * (`[dbo].[tb_mcp_skills]`), safe to splice into SQL text. Throws if any
 * part isn't a plain identifier — this runs once at startup, so a bad
 * value fails fast instead of surfacing as a confusing runtime SQL error
 * (or, worse, unsafely interpolated SQL).
 */
export function quoteIdentifierPath(path: string): string {
  const parts = path.split('.');
  if (parts.length === 0 || parts.length > 3 || parts.some((part) => !IDENTIFIER_PART.test(part))) {
    throw new Error(
      `Invalid identifier "${path}": expected "table", "schema.table", or "database.schema.table" ` +
        'using only letters, digits, and underscores in each part.',
    );
  }
  return parts.map((part) => `[${part}]`).join('.');
}
