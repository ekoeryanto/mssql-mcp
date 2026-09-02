# Dynamic Skills (tb_mcp_skills) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an AI client (or the team, manually) define reusable SQL "skills" in a `tb_mcp_skills` table, exposed dynamically as MCP tools alongside the 5 existing static ones — no restart required to pick up new or edited skills.

**Architecture:** Revert the MCP tool-registration layer from the SDK's high-level `McpServer` (zod schemas, registered once) to the low-level `Server` with one `ListToolsRequestSchema` handler and one `CallToolRequestSchema` handler, each merging the 5 static JSON-Schema tool defs (now 6, with the new `save-skill`) with tools loaded fresh from `tb_mcp_skills` on every call. A new `save-skill` tool lets a client persist a skill after validating it end-to-end (JSON shape, per-property descriptions, and a transaction+rollback dry-run of the SQL) so bad skills never become callable.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` (low-level `Server`), `mssql`, `ajv` (new), Bun's built-in test runner (`bun test`, new to this project).

**Spec:** `docs/superpowers/specs/2026-09-02-dynamic-skills-design.md`

## Global Constraints

- Every `tools/list` call re-queries `tb_mcp_skills` — no caching, no restart needed to see new skills.
- If SQL Server is unreachable during `tools/list`, return the 5(6) static tools only; never fail the whole call. Log a warning.
- A `tb_mcp_skills` row whose `tool_name` collides with a static tool name is skipped (list) or rejected (save-skill), with a warning/error — never silently overwrites a static tool.
- A row with invalid `generated_prompt` JSON is skipped during listing (warning logged), not fatal.
- Dynamic skill SQL execution is **not** gated by `SQLSERVER_ALLOW_MUTATIONS` — it's trusted content. Only the *arguments* are untrusted, and they are always bound via `request.input(key, value)`, never string-interpolated.
- `save-skill` rejects (no DB write) in this order: (1) name collides with a static tool, (2) `generated_prompt` isn't valid JSON with a `properties` object, (3) any property under `properties` lacks a non-empty `description`, (4) the SQL fails a transaction+rollback dry-run with dummy arguments.
- No automated tests exist for anything that touches a live SQL Server (project convention — verify manually, same as `scripts/test-connection.ts`). Pure logic (schema parsing/validation, dummy-arg building, list/call/save orchestration against a fake store) gets real `bun test` unit tests.
- `ajv` version: `^8.17.1`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types/index.ts` (modify) | New shared types: `SkillRow`, `SkillDefinition`, `SaveSkillInput`, `SkillSqlValidationResult`, `SkillsStore`, `JsonSchemaObject`, `JsonSchemaProperty`, `McpToolDef` |
| `src/tools/skillSchema.ts` (new) | Pure, DB-free helpers for interpreting a `generated_prompt` JSON Schema string: `parseSkillPrompt`, `validatePromptDescriptions`, `buildDummyArgs` |
| `src/tools/skillSchema.test.ts` (new) | `bun test` unit tests for the above |
| `src/tools/dynamicSkills.ts` (new) | `tb_mcp_skills`-specific orchestration against a `SkillsStore`: `toMcpTool`, `loadDynamicTools`, `callDynamicSkill`, `saveSkill` |
| `src/tools/dynamicSkills.test.ts` (new) | `bun test` unit tests using a fake in-memory `SkillsStore` |
| `src/db/connection.ts` (modify) | `SqlServerConnectionManager` gains 5 methods implementing `SkillsStore`: `listSkills`, `getSkillDefinition`, `executeParameterized`, `validateSkillSql`, `upsertSkill` |
| `src/index.ts` (modify) | Drop `McpServer`/zod for the tool-registration layer; low-level `Server` with merged static+dynamic `ListTools`/`CallTool` handlers; new `save-skill` static tool def; `getHandlers` renamed to `getStore`/`getStoreOrNull` |
| `scripts/sql/create-tb-mcp-skills.sql` (new) | DDL for `tb_mcp_skills`, plus a commented example `INSERT` |
| `docs/DYNAMIC_SKILLS.md` (new) | Worked example: create the table, save a skill, call it — with expected `tools/list`/`tools/call` output |
| `README.md` (modify) | Short pointer to `docs/DYNAMIC_SKILLS.md` |
| `package.json` (modify) | Add `ajv` dependency; `"test": "bun test"` |

---

### Task 1: Types, `ajv` dependency, test runner

**Files:**
- Modify: `src/types/index.ts` (append after the `Logger` interface, end of file)
- Modify: `package.json`

**Interfaces:**
- Produces: `SkillRow`, `SkillDefinition`, `SaveSkillInput`, `SkillSqlValidationResult`, `SkillsStore`, `JsonSchemaObject`, `JsonSchemaProperty`, `McpToolDef` — all subsequent tasks import from `./types/index.js` (or `../types/index.js` from `src/tools/` and `src/db/`).

- [ ] **Step 1: Add the new types**

Append to `src/types/index.ts`:

```typescript
export interface SkillRow {
  tool_name: string;
  description: string;
  keywords: string | null;
  generated_prompt: string;
}

export interface SkillDefinition {
  generated_prompt: string;
  generated_sql: string;
}

export interface SaveSkillInput {
  tool_name: string;
  description: string;
  keywords?: string;
  generated_prompt: string;
  generated_sql: string;
}

export interface SkillSqlValidationResult {
  valid: boolean;
  error?: string;
}

export interface SkillsStore {
  listSkills(): Promise<SkillRow[]>;
  getSkillDefinition(toolName: string): Promise<SkillDefinition | null>;
  executeParameterized(
    sqlText: string,
    params: Record<string, unknown>,
  ): Promise<{ recordset: Record<string, unknown>[] | null }>;
  validateSkillSql(
    sqlText: string,
    dummyParams: Record<string, unknown>,
  ): Promise<SkillSqlValidationResult>;
  upsertSkill(skill: SaveSkillInput): Promise<void>;
}

export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  [key: string]: unknown;
}

export interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
}
```

- [ ] **Step 2: Add `ajv` and switch on the Bun test runner**

```bash
bun add ajv@^8.17.1
```

In `package.json`, change the `"test"` script:

```diff
-    "test": "echo \"Test suite coming soon\"",
+    "test": "bun test",
```

- [ ] **Step 3: Verify it builds**

```bash
bunx tsc --noEmit
```
Expected: no errors (the new types aren't used anywhere yet, so this just confirms the syntax is valid).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts package.json bun.lock
git commit -m "feat: add types and ajv dependency for dynamic skills"
```

---

### Task 2: `tb_mcp_skills` DDL

**Files:**
- Create: `scripts/sql/create-tb-mcp-skills.sql`

- [ ] **Step 1: Write the DDL script**

```sql
-- Creates the tb_mcp_skills table used by the dynamic-skills feature.
-- Run once against the target database before using `save-skill` or
-- inserting skills manually.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tb_mcp_skills')
BEGIN
    CREATE TABLE tb_mcp_skills (
        id                INT IDENTITY(1,1) PRIMARY KEY,
        tool_name         VARCHAR(128)    NOT NULL UNIQUE,
        description       NVARCHAR(1000)  NOT NULL,
        keywords          NVARCHAR(500)   NULL,
        generated_prompt  NVARCHAR(MAX)   NOT NULL, -- JSON Schema string for tool input
        generated_sql     NVARCHAR(MAX)   NOT NULL, -- parameterized SQL, @paramName placeholders
        is_active         BIT             NOT NULL DEFAULT 1,
        created_at        DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at        DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Example (commented out): a "cek tagihan" skill you could insert manually
-- instead of going through the save-skill tool.
--
-- INSERT INTO tb_mcp_skills (tool_name, description, keywords, generated_prompt, generated_sql)
-- VALUES (
--     'cek-tagihan',
--     'Cek status tagihan untuk satu nomor pelanggan',
--     'tagihan, billing, invoice',
--     '{"type":"object","properties":{"nomor":{"type":"string","description":"Nomor pelanggan, contoh 0812xxxxxxx"}},"required":["nomor"]}',
--     'SELECT nomor, nama, jumlah_tagihan, status FROM tb_tagihan WHERE nomor = @nomor'
-- );
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sql/create-tb-mcp-skills.sql
git commit -m "feat: add tb_mcp_skills DDL script"
```

---

### Task 3: `skillSchema.ts` — pure JSON Schema helpers

**Files:**
- Create: `src/tools/skillSchema.ts`
- Test: `src/tools/skillSchema.test.ts`

**Interfaces:**
- Consumes: `JsonSchemaObject`, `JsonSchemaProperty` from `../types/index.js` (Task 1)
- Produces: `parseSkillPrompt(raw: string): ParsePromptResult`, `validatePromptDescriptions(schema: JsonSchemaObject): DescriptionCheckResult`, `buildDummyArgs(schema: JsonSchemaObject): Record<string, unknown>` — used by `dynamicSkills.ts` (Task 4)

- [ ] **Step 1: Write the failing tests**

Create `src/tools/skillSchema.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test src/tools/skillSchema.test.ts
```
Expected: FAIL — `Cannot find module './skillSchema.js'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/tools/skillSchema.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test src/tools/skillSchema.test.ts
```
Expected: PASS, all 11 tests green.

- [ ] **Step 5: Type-check and lint**

```bash
bunx tsc --noEmit
bunx eslint src/tools/skillSchema.ts src/tools/skillSchema.test.ts
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/tools/skillSchema.ts src/tools/skillSchema.test.ts
git commit -m "feat: add pure JSON Schema helpers for dynamic skills"
```

---

### Task 4: `dynamicSkills.ts` — list/call/save orchestration

**Files:**
- Create: `src/tools/dynamicSkills.ts`
- Test: `src/tools/dynamicSkills.test.ts`

**Interfaces:**
- Consumes: `parseSkillPrompt`, `validatePromptDescriptions`, `buildDummyArgs` from `./skillSchema.js` (Task 3); `SkillRow`, `SkillDefinition`, `SaveSkillInput`, `SkillsStore`, `McpToolDef`, `Logger` from `../types/index.js` (Task 1); `CallToolResult` from `@modelcontextprotocol/sdk/types.js`
- Produces: `toMcpTool(row: SkillRow)`, `loadDynamicTools(store, logger, staticNames): Promise<McpToolDef[]>`, `callDynamicSkill(store, logger, toolName, args): Promise<CallToolResult>`, `saveSkill(store, logger, staticNames, input): Promise<CallToolResult>` — all used by `src/index.ts` (Task 6)

- [ ] **Step 1: Write the failing tests**

Create `src/tools/dynamicSkills.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test src/tools/dynamicSkills.test.ts
```
Expected: FAIL — `Cannot find module './dynamicSkills.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/tools/dynamicSkills.ts`:

```typescript
/**
 * Orchestration for tb_mcp_skills-backed dynamic tools: listing them for
 * tools/list, executing them for tools/call, and validating+saving new
 * ones via the save-skill tool.
 */

import Ajv from 'ajv';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildDummyArgs, parseSkillPrompt, validatePromptDescriptions } from './skillSchema.js';
import type { Logger, McpToolDef, SaveSkillInput, SkillRow, SkillsStore } from '../types/index.js';

const ajv = new Ajv({ allErrors: true, strict: false });

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export function toMcpTool(row: SkillRow): { ok: true; tool: McpToolDef } | { ok: false; error: string } {
  const parsed = parseSkillPrompt(row.generated_prompt);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
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

  const validate = ajv.compile(parsed.schema);
  if (!validate(args)) {
    const messages = (validate.errors ?? [])
      .map((e) => `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}`)
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test src/tools/dynamicSkills.test.ts
```
Expected: PASS, all 13 tests green.

- [ ] **Step 5: Type-check and lint**

```bash
bunx tsc --noEmit
bunx eslint src/tools/dynamicSkills.ts src/tools/dynamicSkills.test.ts
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/tools/dynamicSkills.ts src/tools/dynamicSkills.test.ts
git commit -m "feat: add dynamic skill list/call/save orchestration"
```

---

### Task 5: `SqlServerConnectionManager` — skill persistence methods

**Files:**
- Modify: `src/db/connection.ts`

**Interfaces:**
- Consumes: `SkillRow`, `SkillDefinition`, `SaveSkillInput`, `SkillSqlValidationResult` from `../types/index.js` (Task 1)
- Produces: 5 new public methods on `SqlServerConnectionManager`, matching the `SkillsStore` interface exactly (structural typing — no explicit `implements` needed), consumed by `src/index.ts` (Task 6)

No automated test for this task — it requires a live SQL Server, which this project verifies manually (see `scripts/test-connection.ts` for the existing pattern). Verification happens in Task 8.

- [ ] **Step 1: Add the type import**

In `src/db/connection.ts`, change:

```typescript
import type { SqlServerConfig, Logger } from '../types/index.js';
```

to:

```typescript
import type {
  SqlServerConfig,
  Logger,
  SkillRow,
  SkillDefinition,
  SaveSkillInput,
  SkillSqlValidationResult,
} from '../types/index.js';
```

- [ ] **Step 2: Add the 5 methods**

Insert these methods into the `SqlServerConnectionManager` class, right before the closing `}` of the class (after `getPoolStatus()`, i.e. right before line `}` / `export default SqlServerConnectionManager;`):

```typescript
  /**
   * List active dynamic skills for tools/list.
   */
  async listSkills(): Promise<SkillRow[]> {
    await this.ensureConnected();
    const result = await this.pool!.request().query(
      'SELECT tool_name, description, keywords, generated_prompt FROM tb_mcp_skills WHERE is_active = 1',
    );
    return result.recordset as SkillRow[];
  }

  /**
   * Fetch one active skill's prompt+SQL for tools/call.
   */
  async getSkillDefinition(toolName: string): Promise<SkillDefinition | null> {
    await this.ensureConnected();
    const request = this.pool!.request();
    request.input('toolName', sql.VarChar, toolName);
    const result = await request.query(
      'SELECT generated_prompt, generated_sql FROM tb_mcp_skills WHERE tool_name = @toolName AND is_active = 1',
    );
    const row = result.recordset[0] as { generated_prompt: string; generated_sql: string } | undefined;
    return row ? { generated_prompt: row.generated_prompt, generated_sql: row.generated_sql } : null;
  }

  /**
   * Run a skill's generated_sql with the given arguments bound as
   * parameters (never string-interpolated).
   */
  async executeParameterized(
    sqlText: string,
    params: Record<string, unknown>,
  ): Promise<{ recordset: Record<string, unknown>[] | null }> {
    await this.ensureConnected();
    const request = this.pool!.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
    const result = await request.query(sqlText);
    return { recordset: result.recordset ?? null };
  }

  /**
   * Dry-run a candidate skill's SQL inside a transaction with dummy
   * parameter values, then always roll back — never commits, regardless
   * of outcome. Used by save-skill to catch bad table/column names before
   * a skill becomes callable.
   */
  async validateSkillSql(
    sqlText: string,
    dummyParams: Record<string, unknown>,
  ): Promise<SkillSqlValidationResult> {
    await this.ensureConnected();
    const transaction = new sql.Transaction(this.pool!);
    try {
      await transaction.begin();
      const request = new sql.Request(transaction);
      for (const [key, value] of Object.entries(dummyParams)) {
        request.input(key, value);
      }
      await request.query(sqlText);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      await transaction.rollback().catch(() => {
        // Nothing to do — validation never commits either way.
      });
    }
  }

  /**
   * Insert or update a skill by tool_name, always leaving it active.
   */
  async upsertSkill(skill: SaveSkillInput): Promise<void> {
    await this.ensureConnected();
    const request = this.pool!.request();
    request.input('toolName', sql.VarChar, skill.tool_name);
    request.input('description', sql.NVarChar, skill.description);
    request.input('keywords', sql.NVarChar, skill.keywords ?? null);
    request.input('generatedPrompt', sql.NVarChar(sql.MAX), skill.generated_prompt);
    request.input('generatedSql', sql.NVarChar(sql.MAX), skill.generated_sql);
    await request.query(`
      IF EXISTS (SELECT 1 FROM tb_mcp_skills WHERE tool_name = @toolName)
        UPDATE tb_mcp_skills
        SET description = @description,
            keywords = @keywords,
            generated_prompt = @generatedPrompt,
            generated_sql = @generatedSql,
            is_active = 1,
            updated_at = SYSUTCDATETIME()
        WHERE tool_name = @toolName
      ELSE
        INSERT INTO tb_mcp_skills (tool_name, description, keywords, generated_prompt, generated_sql, is_active)
        VALUES (@toolName, @description, @keywords, @generatedPrompt, @generatedSql, 1);
    `);
  }
```

- [ ] **Step 3: Type-check and lint**

```bash
bunx tsc --noEmit
bunx eslint src/db/connection.ts
```
Expected: no errors. (If `sql.Transaction`/`sql.Request` constructor signatures don't match, fix using the types shown by your editor's autocomplete on the `mssql` package — the pattern is `new sql.Transaction(pool)`, `transaction.begin()`, `new sql.Request(transaction)`.)

- [ ] **Step 4: Commit**

```bash
git add src/db/connection.ts
git commit -m "feat: add skill persistence methods to SqlServerConnectionManager"
```

---

### Task 6: Wire it into `src/index.ts`

**Files:**
- Modify: `src/index.ts`
- Modify: `package.json` (remove now-unused `zod` dependency)

**Interfaces:**
- Consumes: `loadDynamicTools`, `callDynamicSkill`, `saveSkill` from `./tools/dynamicSkills.js` (Task 4); the 5 new `SqlServerConnectionManager` methods (Task 5, consumed structurally via the `SkillsStore` type); `McpToolDef`, `SaveSkillInput` from `./types/index.js` (Task 1)

This task replaces most of the tool-registration code in `src/index.ts`. Everything from `startHttpServer()` onward (transport/HTTP plumbing) is unchanged — only the imports and everything from `getHandlers` through `createMcpServer()` change.

- [ ] **Step 1: Replace the imports**

Replace:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as http from 'node:http';
import { z } from 'zod';
import { loadConfig } from './config/index.js';
import SimpleLogger from './logger/index.js';
import SqlServerConnectionManager from './db/connection.js';
import ToolHandlers from './tools/handlers.js';
```

with:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as http from 'node:http';
import { loadConfig } from './config/index.js';
import SimpleLogger from './logger/index.js';
import SqlServerConnectionManager from './db/connection.js';
import ToolHandlers from './tools/handlers.js';
import { callDynamicSkill, loadDynamicTools, saveSkill } from './tools/dynamicSkills.js';
import type { McpToolDef, SaveSkillInput } from './types/index.js';
```

- [ ] **Step 2: Replace `getHandlers` with `getStore`/`getStoreOrNull`**

Replace:

```typescript
async function getHandlers(): Promise<ToolHandlers> {
  if (!db || !handlers) {
    db = new SqlServerConnectionManager(config.sqlServer, logger);
    handlers = new ToolHandlers(db, logger, config.sqlServer.allowMutations);
    await db.connect();
  }
  return handlers;
}
```

with:

```typescript
async function getStore(): Promise<{ db: SqlServerConnectionManager; handlers: ToolHandlers }> {
  if (!db || !handlers) {
    db = new SqlServerConnectionManager(config.sqlServer, logger);
    handlers = new ToolHandlers(db, logger, config.sqlServer.allowMutations);
    await db.connect();
  }
  return { db, handlers };
}

/**
 * Like getStore(), but never throws — returns null (and logs a warning) if
 * SQL Server is unreachable, so tools/list and dynamic tools/call can
 * degrade gracefully instead of failing the whole request.
 */
async function getStoreOrNull(): Promise<SqlServerConnectionManager | null> {
  try {
    const { db: connectedDb } = await getStore();
    return connectedDb;
  } catch (error) {
    logger.warn('SQL Server unavailable for dynamic skills');
    logger.error('getStore failed', error);
    return null;
  }
}
```

- [ ] **Step 3: Update `runTool` to use `getStore`**

Replace:

```typescript
async function runTool<T>(fn: (handlers: ToolHandlers) => Promise<T>): Promise<CallToolResult> {
  try {
    const result = await fn(await getHandlers());
    return toToolResult(result);
  } catch (error) {
```

with:

```typescript
async function runTool<T>(fn: (handlers: ToolHandlers) => Promise<T>): Promise<CallToolResult> {
  try {
    const { handlers } = await getStore();
    const result = await fn(handlers);
    return toToolResult(result);
  } catch (error) {
```

(the rest of the function body — the `catch` block — is unchanged)

- [ ] **Step 4: Replace `createMcpServer()` entirely**

Replace the whole function (from `/**\n * Create an MCP server instance...` through its closing `}`) with:

```typescript
const staticToolDefs: McpToolDef[] = [
  {
    name: 'query',
    description: 'Execute a SELECT query and retrieve results',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL SELECT query to execute' },
      },
      required: ['query'],
    },
  },
  {
    name: 'execute-statement',
    description: 'Execute INSERT, UPDATE, DELETE, or DDL statements',
    inputSchema: {
      type: 'object',
      properties: {
        statement: {
          type: 'string',
          description: 'SQL statement to execute (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP)',
        },
        params: {
          type: 'object',
          description: 'Optional parameters for parameterized queries',
        },
      },
      required: ['statement'],
    },
  },
  {
    name: 'get-metadata',
    description: 'Retrieve database metadata (databases, tables, columns, or procedures)',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['databases', 'tables', 'columns', 'procedures'],
          description: 'Type of metadata to retrieve',
        },
        filter: {
          type: 'string',
          description: 'Optional filter (e.g., table name for columns query)',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'execute-procedure',
    description: 'Execute a stored procedure with optional input/output parameters',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the stored procedure' },
        params: {
          type: 'object',
          description: 'Optional parameters object with structure: { paramName: { value: any, output?: boolean } }',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get-status',
    description: 'Get current connection status and pool information',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'save-skill',
    description:
      'Create or update a reusable SQL "skill" exposed as a new tool. Explore the schema with get-metadata first, then define the SQL and its input schema here.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_name: { type: 'string', description: 'Unique snake/kebab-case tool identifier' },
        description: { type: 'string', description: 'What this skill does, shown when browsing tools/list' },
        keywords: { type: 'string', description: 'Comma-separated keywords to help discovery' },
        generated_prompt: {
          type: 'string',
          description:
            'JSON Schema (as a string) describing this tool\'s input arguments. Every property MUST have its own non-empty "description" — this is what a future AI session reads to know what value to supply, so write it as if explaining the parameter to someone who has never seen this skill before.',
        },
        generated_sql: {
          type: 'string',
          description: "Parameterized SQL using @paramName placeholders matching generated_prompt's properties",
        },
      },
      required: ['tool_name', 'description', 'generated_prompt', 'generated_sql'],
    },
  },
];

const STATIC_TOOL_NAMES = new Set(staticToolDefs.map((t) => t.name));

/**
 * Create an MCP server instance wired up to the static SQL tools and the
 * dynamic tb_mcp_skills-backed tools.
 */
function createMcpServer(): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const store = await getStoreOrNull();
    const dynamicTools = store ? await loadDynamicTools(store, logger, STATIC_TOOL_NAMES) : [];
    return { tools: [...staticToolDefs, ...dynamicTools] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'query':
        return runTool((h) => h.handleQuery(args as { query: string }));
      case 'execute-statement':
        return runTool((h) => h.handleExecute(args as { statement: string; params?: Record<string, unknown> }));
      case 'get-metadata':
        return runTool((h) =>
          h.handleMetadata(args as { type: 'databases' | 'tables' | 'columns' | 'procedures'; filter?: string }),
        );
      case 'execute-procedure':
        return runTool((h) =>
          h.handleExecuteProcedure(
            args as { name: string; params?: Record<string, { value?: unknown; output?: boolean }> },
          ),
        );
      case 'get-status':
        return runTool((h) => h.handleGetStatus());
      default: {
        const store = await getStoreOrNull();
        if (!store) {
          return {
            content: [{ type: 'text', text: 'Error: SQL Server is unavailable' }],
            isError: true,
          };
        }
        if (name === 'save-skill') {
          return saveSkill(store, logger, STATIC_TOOL_NAMES, args as SaveSkillInput);
        }
        return callDynamicSkill(store, logger, name, (args ?? {}) as Record<string, unknown>);
      }
    }
  });

  return server;
}
```

- [ ] **Step 5: Remove the now-unused `zod` dependency**

```bash
bun remove zod
```

(Nothing else in the codebase imports `zod` after this task — it was only used for the `McpServer.registerTool` schemas this task replaces.)

- [ ] **Step 6: Type-check, lint, build**

```bash
bunx tsc --noEmit
bunx eslint .
bun run build
```
Expected: no errors; `dist/bundle.js` produced.

- [ ] **Step 7: Manual smoke test — tools/list without a DB**

```bash
cat <<'EOF' > /tmp/mcp-list.jsonl
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
EOF
MCP_TRANSPORT=stdio SQLSERVER_SERVER=localhost SQLSERVER_USERNAME=sa SQLSERVER_PASSWORD=test SQLSERVER_DATABASE=master \
  timeout 5 bun run src/index.ts < /tmp/mcp-list.jsonl 2>/dev/null
```
Expected: the `tools/list` response's `result.tools` array has exactly 6 entries — `query`, `execute-statement`, `get-metadata`, `execute-procedure`, `get-status`, `save-skill` — and no dynamic tools (since `localhost:1433` isn't reachable in this shell, `getStoreOrNull()` returns `null` and `dynamicTools` is `[]`). No error at the JSON-RPC level.

- [ ] **Step 8: Commit**

```bash
git add src/index.ts package.json bun.lock
git commit -m "feat: merge static and dynamic tools into low-level Server handlers"
```

---

### Task 7: Docs

**Files:**
- Create: `docs/DYNAMIC_SKILLS.md`
- Modify: `README.md`

- [ ] **Step 1: Write the worked example**

Create `docs/DYNAMIC_SKILLS.md`:

```markdown
# Dynamic Skills

Beyond the 5 built-in SQL tools, this server can expose additional tools
defined entirely in a database table, `tb_mcp_skills` — no restart needed
to add or change one. See the design rationale in
`docs/superpowers/specs/2026-09-02-dynamic-skills-design.md`.

## Setup

Run `scripts/sql/create-tb-mcp-skills.sql` once against your target
database.

## Two ways to define a skill

**Via an AI client (recommended):** ask it to add the skill. A well-behaved
client will call `get-metadata` first to find the real table/column names,
then call `save-skill` with the SQL and input schema it wrote. `save-skill`
validates everything (JSON shape, that every input property has a
description, and a transaction+rollback dry-run of the SQL) before the
skill becomes callable — a bad table/column name is rejected immediately,
with the database's own error message, instead of failing later when
someone actually calls the skill.

**Manually:** `INSERT` directly into `tb_mcp_skills`. Nothing validates a
manual insert — the row becomes callable immediately once `is_active = 1`
and `generated_prompt` is valid JSON. Bad SQL will only surface when the
skill is actually called.

## Worked example

```sql
INSERT INTO tb_mcp_skills (tool_name, description, keywords, generated_prompt, generated_sql)
VALUES (
    'cek-tagihan',
    'Cek status tagihan untuk satu nomor pelanggan',
    'tagihan, billing, invoice',
    '{"type":"object","properties":{"nomor":{"type":"string","description":"Nomor pelanggan, contoh 0812xxxxxxx"}},"required":["nomor"]}',
    'SELECT nomor, nama, jumlah_tagihan, status FROM tb_tagihan WHERE nomor = @nomor'
);
```

After this, `tools/list` includes:

```json
{
  "name": "cek-tagihan",
  "description": "Cek status tagihan untuk satu nomor pelanggan (Keywords: tagihan, billing, invoice)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "nomor": { "type": "string", "description": "Nomor pelanggan, contoh 0812xxxxxxx" }
    },
    "required": ["nomor"]
  }
}
```

Calling it with `{"nomor": "0812xxxxxxx"}` runs the query with that value
bound as a SQL parameter and returns the matching rows as JSON text.

## Notes

- `generated_prompt`'s property `description` fields are not just for
  validation — they're the only thing an AI client reads to know what
  value to supply. Write them as if explaining the parameter to someone
  who has never seen the skill before.
- Skill SQL is trusted content — `SQLSERVER_ALLOW_MUTATIONS` does not gate
  it. Only the tool's *arguments* are untrusted, and they're always bound
  as SQL parameters, never string-interpolated.
- Deactivating a skill (`UPDATE tb_mcp_skills SET is_active = 0 WHERE
  tool_name = ...`) is manual DB administration — there's no tool for it.
```

- [ ] **Step 2: Add a README pointer**

In `README.md`, after the existing `### 5. Get Status Tool` section (before `## Architecture`), add:

```markdown
### Dynamic Skills

Beyond these 5 tools, additional tools can be defined at runtime in a
`tb_mcp_skills` database table — see [docs/DYNAMIC_SKILLS.md](docs/DYNAMIC_SKILLS.md).
```

- [ ] **Step 3: Commit**

```bash
git add docs/DYNAMIC_SKILLS.md README.md
git commit -m "docs: document the dynamic skills feature"
```

---

### Task 8: Manual end-to-end verification against a live SQL Server

**Files:** none (verification only)

This task has no code changes — it exercises Tasks 1–7 together against a
real SQL Server, per the spec's testing section.

- [ ] **Step 1: Start SQL Server**

```bash
docker-compose up -d sqlserver
```
Wait for it to report healthy: `docker-compose ps` shows `sqlserver` as `healthy` (may take ~30s).

- [ ] **Step 2: Create the skills table and a demo target table**

```bash
docker exec -i mssql-mcp-db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'YourStrong@Password123' -C -d master < scripts/sql/create-tb-mcp-skills.sql

docker exec -i mssql-mcp-db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'YourStrong@Password123' -C -d master <<'EOF'
CREATE TABLE tb_tagihan (nomor VARCHAR(20), nama VARCHAR(100), jumlah_tagihan INT, status VARCHAR(20));
INSERT INTO tb_tagihan VALUES ('0812', 'Budi', 150000, 'belum lunas');
EOF
```
(If `/opt/mssql-tools18` doesn't exist in your image, use `/opt/mssql-tools/bin/sqlcmd` instead.)

- [ ] **Step 3: Run the full JSON-RPC sequence**

```bash
cat <<'EOF' > /tmp/mcp-e2e.jsonl
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"save-skill","arguments":{"tool_name":"cek-tagihan","description":"Cek status tagihan untuk satu nomor pelanggan","keywords":"tagihan, billing","generated_prompt":"{\"type\":\"object\",\"properties\":{\"nomor\":{\"type\":\"string\",\"description\":\"Nomor pelanggan\"}},\"required\":[\"nomor\"]}","generated_sql":"SELECT nomor, nama, jumlah_tagihan, status FROM tb_tagihan WHERE nomor = @nomor"}}}
{"jsonrpc":"2.0","id":3,"method":"tools/list"}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"cek-tagihan","arguments":{"nomor":"0812"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"save-skill","arguments":{"tool_name":"broken-skill","description":"x","generated_prompt":"{\"type\":\"object\",\"properties\":{\"nomor\":{\"type\":\"string\",\"description\":\"x\"}}}","generated_sql":"SELECT * FROM tb_does_not_exist WHERE nomor = @nomor"}}}
EOF

MCP_TRANSPORT=stdio SQLSERVER_SERVER=localhost SQLSERVER_PORT=1433 SQLSERVER_USERNAME=sa \
  SQLSERVER_PASSWORD='YourStrong@Password123' SQLSERVER_DATABASE=master SQLSERVER_TRUST_SERVER_CERTIFICATE=true \
  timeout 10 bun run src/index.ts < /tmp/mcp-e2e.jsonl 2>/dev/null
```

Expected, one JSON-RPC response per line:
- id 1: `initialize` succeeds.
- id 2 (`save-skill`): success text, no `isError`.
- id 3 (`tools/list`): `result.tools` now has 7 entries, including `cek-tagihan` with description `"Cek status tagihan untuk satu nomor pelanggan (Keywords: tagihan, billing)"`.
- id 4 (`tools/call` on `cek-tagihan`): content contains the JSON for the `Budi` / `150000` / `belum lunas` row.
- id 5 (`save-skill` with a bad table name): `isError: true`, message mentions `tb_does_not_exist` — and confirm via a follow-up `tools/list` (or a fresh call to `cek-tagihan`) that `broken-skill` never became callable.

- [ ] **Step 4: Confirm the rollback left no trace**

```bash
docker exec -i mssql-mcp-db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'YourStrong@Password123' -C -d master \
  -Q "SELECT tool_name FROM tb_mcp_skills"
```
Expected: only `cek-tagihan` is listed — `broken-skill` was never inserted.

- [ ] **Step 5: Tear down**

```bash
docker-compose down
rm -f /tmp/mcp-list.jsonl /tmp/mcp-e2e.jsonl
```

- [ ] **Step 6: Run the full local verification suite one more time**

```bash
bun test
bunx tsc --noEmit
bunx eslint .
bun run build
```
Expected: all green. This is the final gate before considering the feature done.

---

## Self-Review Notes

- **Spec coverage:** DDL (Task 2), `generated_prompt`/`generated_sql` relationship and per-property description requirement (Tasks 3, 4, 6), live `tools/list` re-query with graceful DB-down degradation (Task 6), name-collision handling for both list and save (Task 4), trusted-SQL security model / parameterized argument binding (Tasks 4, 5), transaction+rollback validation (Task 5), upsert semantics (Task 5), worked example in docs (Task 7) — all covered.
- **Type consistency:** `SkillsStore`, `SkillRow`, `SkillDefinition`, `SaveSkillInput`, `SkillSqlValidationResult`, `McpToolDef` are defined once in Task 1 and referenced by the same names in every later task; `toMcpTool`/`loadDynamicTools`/`callDynamicSkill`/`saveSkill` signatures in Task 4 match their call sites in Task 6 exactly.
- **No placeholders:** every step ships real code or a real, runnable command with a concrete expected result.
