/**
 * Helpers that turn SQL Server "Invalid column/object name" errors into
 * actionable hints, so an AI client can correct the query in one retry
 * instead of guessing again.
 */

import { stripSqlNoise } from './sqlCheck.js';

export interface InvalidIdentifier {
  kind: 'column' | 'object';
  name: string;
}

const INVALID_IDENTIFIER_PATTERN = /Invalid (column|object) name '([^']+)'/i;
const TABLE_REFERENCE_PATTERN =
  /\b(?:FROM|JOIN)\s+((?:\[[^\]]+\]|\w+)(?:\.(?:\[[^\]]+\]|\w+)){0,2})/gi;

/** Strips brackets and any schema/database qualifier, keeping the last part. */
function lastIdentifierPart(qualified: string): string {
  const parts = qualified.split('.');
  return parts[parts.length - 1].replace(/^\[|\]$/g, '');
}

export function parseInvalidIdentifier(message: string): InvalidIdentifier | null {
  const match = INVALID_IDENTIFIER_PATTERN.exec(message);
  if (!match) return null;
  return {
    kind: match[1].toLowerCase() === 'column' ? 'column' : 'object',
    name: lastIdentifierPart(match[2]),
  };
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

/** Candidates closest to `name` by case-insensitive edit distance, best first. */
export function suggestSimilar(name: string, candidates: string[], limit = 3): string[] {
  const target = name.toLowerCase();
  const maxDistance = Math.max(2, Math.floor(target.length / 3));
  return candidates
    .map((candidate) => ({ candidate, distance: editDistance(target, candidate.toLowerCase()) }))
    .filter(({ distance }) => distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

/** Permanent table names referenced after FROM/JOIN, deduplicated, in order. */
export function extractTableNames(sqlText: string): string[] {
  const clean = stripSqlNoise(sqlText);
  const names: string[] = [];
  for (const match of clean.matchAll(TABLE_REFERENCE_PATTERN)) {
    const name = lastIdentifierPart(match[1]);
    if (!name.startsWith('#') && !names.includes(name)) names.push(name);
  }
  return names;
}

const MISSING_VARIABLE_PATTERN = /Must declare the (?:scalar|table) variable "@([^"]+)"/i;

/**
 * Explains a "Must declare the scalar variable" error by listing which
 * parameters the caller should have passed and which it actually passed,
 * so a misspelled or omitted argument is obvious.
 */
export function describeMissingParameter(message: string, accepted: string[], received: string[]): string | null {
  const match = MISSING_VARIABLE_PATTERN.exec(message);
  if (!match) return null;
  const list = (names: string[]): string => (names.length > 0 ? names.join(', ') : '(none)');
  const unknown = received.filter((name) => !accepted.includes(name));
  const unknownNote = unknown.length > 0 ? ` (unknown: ${unknown.join(', ')})` : '';
  return `Parameter '${match[1]}' was not provided. Accepted: ${list(accepted)}. Received: ${list(received)}${unknownNote}.`;
}

const PARAMETER_PATTERN = /(?<![@\w])@(\w+)/g;
const DECLARED_VARIABLE_PATTERN = /\bDECLARE\s+@(\w+)/gi;

/** Distinct @parameters a statement references, excluding variables it DECLAREs itself. */
export function extractParameterNames(sqlText: string): string[] {
  const clean = stripSqlNoise(sqlText);
  const declared = new Set([...clean.matchAll(DECLARED_VARIABLE_PATTERN)].map((match) => match[1]));
  const names: string[] = [];
  for (const match of clean.matchAll(PARAMETER_PATTERN)) {
    if (!declared.has(match[1]) && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}
