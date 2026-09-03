# Knowledge Base (tb_mcp_knowledge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a general-purpose title/content/keywords knowledge store, searchable and self-updatable by an AI client via two new MCP tools (`search-knowledge`, `save-knowledge`), independent of the existing Dynamic Skills feature.

**Architecture:** Mirrors Dynamic Skills' module shape — a `KnowledgeStore` interface (structural typing) implemented on `SqlServerConnectionManager`, pure orchestration in `src/tools/knowledgeBase.ts` (testable with a fake store, no live DB), two new entries in `src/index.ts`'s `staticToolDefs`. Entries are inert text, never executed — no SQL dry-run, no per-property schema validation like `save-skill` has.

**Tech Stack:** TypeScript (Bun), `mssql`, `bun:test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-03-knowledge-base-design.md`

## Global Constraints

- `KNOWLEDGE_ENABLED` (default `true`) and `KNOWLEDGE_TABLE` (default `tb_mcp_knowledge`) are independent of `SKILLS_ENABLED`/`SKILLS_TABLE` — each feature can be toggled without the other.
- `KNOWLEDGE_TABLE` accepts `table`, `schema.table`, or `database.schema.table`, validated and bracket-quoted once at construction via the existing `quoteIdentifierPath()` (`src/db/identifier.ts` — do not modify it, it's already generic).
- No entry deletion tool. Removal is manual `DELETE`, documented not implemented.
- No full-text search, no `is_active` flag, no versioning, no category/tag taxonomy beyond free-text `keywords`. Matching is `LIKE '%query%'` across `title`/`content`/`keywords`, every value bound as a SQL parameter, never string-interpolated.
- `search-knowledge` with an empty result set is success (empty array), not `isError`.
- `save-knowledge` requires only `title` and `content` (enforced by the tool's own JSON Schema `required`, validated by the existing static-tool ajv path in `src/index.ts` — no additional pre-validation in the orchestration layer).
- Server `instructions` (sent at MCP `initialize`) must be restructured from a single fixed string into an array of per-feature paragraphs, so the knowledge paragraph appears independently of whether the skills paragraph does.
- Every task must leave `bunx tsc --noEmit`, `bunx eslint .`, `bun test`, and `bun run build` clean before its commit.

---

## File Map

| File | Change |
|---|---|
| `src/types/index.ts` | Add `KnowledgeRow`, `SaveKnowledgeInput`, `KnowledgeStore` types; add `knowledgeTable` to `SqlServerConfig` |
| `src/config/index.ts` | Add `KNOWLEDGE_TABLE` (into `sqlServer.knowledgeTable`) and `KNOWLEDGE_ENABLED` (top-level `knowledgeEnabled`) env loading |
| `src/db/connection.ts` | Add `knowledgeTable` field (constructor), `searchKnowledge()`, `saveKnowledge()` methods |
| `src/tools/knowledgeBase.ts` (new) | `searchKnowledgeTool()`, `saveKnowledgeTool()` orchestration |
| `src/tools/knowledgeBase.test.ts` (new) | Unit tests against a fake `KnowledgeStore` |
| `src/index.ts` | Two new static tool defs, `knowledgeEnabled` gating, `CallToolRequestSchema` dispatch, restructured `instructions` |
| `scripts/sql/create-tb-mcp-knowledge.sql` (new) | DDL |
| `.env.example`, `README.md` | Document `KNOWLEDGE_ENABLED`/`KNOWLEDGE_TABLE` |
| `docs/KNOWLEDGE_BASE.md` (new) | User-facing docs, mirroring `docs/DYNAMIC_SKILLS.md`'s shape |

---

## Task 1: Types and config

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/config/index.ts`
- Test: none (pure type/config additions, exercised indirectly by every later task's tests)

**Interfaces:**
- Produces: `KnowledgeRow`, `SaveKnowledgeInput`, `KnowledgeStore` (types), `SqlServerConfig.knowledgeTable: string`, `loadConfig()`'s return type gains `knowledgeEnabled: boolean`.

- [ ] **Step 1: Add `knowledgeTable` to `SqlServerConfig`**

In `src/types/index.ts`, find the `SqlServerConfig` interface (currently ends `skillsTable: string;` around line 14) and add the new field right after it:

```typescript
export interface SqlServerConfig {
  server: string;
  port: number;
  database: string;
  username: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  allowMutations: boolean;
  skillsTable: string;
  knowledgeTable: string;
  connectionPoolMin?: number;
  connectionPoolMax?: number;
  requestTimeout?: number;
}
```

- [ ] **Step 2: Add the Knowledge Base types**

In `src/types/index.ts`, after the closing brace of `McpToolDef` (end of file), append:

```typescript

export interface KnowledgeRow {
  title: string;
  content: string;
  keywords: string | null;
  updated_at: Date;
}

export interface SaveKnowledgeInput {
  title: string;
  content: string;
  keywords?: string;
}

export interface KnowledgeStore {
  searchKnowledge(query: string | undefined, limit: number): Promise<KnowledgeRow[]>;
  saveKnowledge(entry: SaveKnowledgeInput): Promise<void>;
}
```

- [ ] **Step 3: Add `KNOWLEDGE_TABLE`/`KNOWLEDGE_ENABLED` env loading**

In `src/config/index.ts`:

1. Change the `loadConfig` return type (currently):
   ```typescript
   export function loadConfig(): {
     sqlServer: SqlServerConfig;
     logLevel: LogLevel;
     serverName: string;
     authToken?: string;
     skillsEnabled: boolean;
   } {
   ```
   to:
   ```typescript
   export function loadConfig(): {
     sqlServer: SqlServerConfig;
     logLevel: LogLevel;
     serverName: string;
     authToken?: string;
     skillsEnabled: boolean;
     knowledgeEnabled: boolean;
   } {
   ```

2. Inside the returned object, add `knowledgeTable` to the `sqlServer` block right after `skillsTable`:
   ```typescript
       skillsTable: getEnv('SKILLS_TABLE', 'tb_mcp_skills'),
       knowledgeTable: getEnv('KNOWLEDGE_TABLE', 'tb_mcp_knowledge'),
   ```

3. Add `knowledgeEnabled` at the top level, right after `skillsEnabled: getEnvBoolean('SKILLS_ENABLED', true),`:
   ```typescript
       skillsEnabled: getEnvBoolean('SKILLS_ENABLED', true),
       knowledgeEnabled: getEnvBoolean('KNOWLEDGE_ENABLED', true),
   ```

- [ ] **Step 4: Verify the build still compiles**

Run: `bunx tsc --noEmit`
Expected: fails — `SqlServerConnectionManager`'s constructor doesn't set `knowledgeTable` yet, and nothing consumes the new config fields yet, so this specific step should actually **pass** (unused new fields aren't a `tsc` error; `noUnusedLocals`/`noUnusedParameters` only flag unused *locals/params*, not unused object properties). Confirm: `bunx tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/config/index.ts
git commit -m "feat: add types and config for the Knowledge Base feature"
```

---

## Task 2: `tb_mcp_knowledge` DDL

**Files:**
- Create: `scripts/sql/create-tb-mcp-knowledge.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: the `tb_mcp_knowledge` table shape that Task 3's `connection.ts` methods query against.

- [ ] **Step 1: Write the DDL script**

Create `scripts/sql/create-tb-mcp-knowledge.sql`:

```sql
-- Creates the tb_mcp_knowledge table used by the Knowledge Base feature.
-- Run once against the target database before using `save-knowledge` or
-- inserting entries manually.
--
-- If you want a different table name (or a schema/database-qualified one,
-- e.g. dbo.my_notes or master.dbo.my_notes), rename it below and set the
-- matching KNOWLEDGE_TABLE env var so the server queries the same table.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tb_mcp_knowledge')
BEGIN
    CREATE TABLE tb_mcp_knowledge (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        title       NVARCHAR(255)  NOT NULL UNIQUE,
        content     NVARCHAR(MAX)  NOT NULL,
        keywords    NVARCHAR(500)  NULL,
        created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- Example (commented out): a note you could insert manually instead of
-- going through the save-knowledge tool.
--
-- INSERT INTO tb_mcp_knowledge (title, content, keywords)
-- VALUES (
--     'tb_tagihan.status meanings',
--     'status column: 1=lunas, 2=belum bayar, 3=cicilan. Always join with tb_pelanggan on nomor_pelanggan, never on id.',
--     'tagihan, billing, status'
-- );
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sql/create-tb-mcp-knowledge.sql
git commit -m "feat: add tb_mcp_knowledge DDL script"
```

---

## Task 3: Knowledge Base orchestration (`src/tools/knowledgeBase.ts`)

**Files:**
- Create: `src/tools/knowledgeBase.ts`
- Test: `src/tools/knowledgeBase.test.ts`

**Interfaces:**
- Consumes: `KnowledgeRow`, `SaveKnowledgeInput`, `KnowledgeStore`, `Logger` from `../types/index.js` (Task 1).
- Produces: `searchKnowledgeTool(store: KnowledgeStore, logger: Logger, args: { query?: unknown; limit?: unknown }): Promise<CallToolResult>` and `saveKnowledgeTool(store: KnowledgeStore, logger: Logger, input: SaveKnowledgeInput): Promise<CallToolResult>`. Task 6 (`src/index.ts`) calls both by these exact names with this exact argument order.

This task writes the orchestration layer first, against a **fake** `KnowledgeStore` — no real DB needed for these tests, matching the convention already used by `src/tools/dynamicSkills.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/tools/knowledgeBase.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/tools/knowledgeBase.test.ts`
Expected: FAIL — `Cannot find module './knowledgeBase.js'` (the file doesn't exist yet).

- [ ] **Step 3: Implement `src/tools/knowledgeBase.ts`**

```typescript
/**
 * Orchestration for the tb_mcp_knowledge-backed search-knowledge and
 * save-knowledge tools. Entries are inert text, never executed, so unlike
 * dynamicSkills.ts there is no SQL dry-run and no JSON Schema to compile —
 * the only validation is what the tools' own inputSchema (required fields)
 * already enforces via src/index.ts's static-tool ajv path.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { KnowledgeStore, Logger, SaveKnowledgeInput } from '../types/index.js';

const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function clampLimit(rawLimit: unknown): number {
  const n = typeof rawLimit === 'number' ? rawLimit : DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(n)));
}

export async function searchKnowledgeTool(
  store: KnowledgeStore,
  logger: Logger,
  args: { query?: unknown; limit?: unknown },
): Promise<CallToolResult> {
  const query = typeof args.query === 'string' ? args.query : undefined;
  const limit = clampLimit(args.limit);

  try {
    const rows = await store.searchKnowledge(query, limit);
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
  } catch (error) {
    logger.error('search-knowledge failed', error);
    return errorResult(error instanceof Error ? error.message : 'Unknown error');
  }
}

export async function saveKnowledgeTool(
  store: KnowledgeStore,
  logger: Logger,
  input: SaveKnowledgeInput,
): Promise<CallToolResult> {
  try {
    await store.saveKnowledge(input);
  } catch (error) {
    logger.error(`Failed to save knowledge entry "${input.title}"`, error);
    return errorResult(error instanceof Error ? error.message : 'Unknown error');
  }
  return { content: [{ type: 'text', text: `Knowledge entry "${input.title}" saved.` }] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/tools/knowledgeBase.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verify the wider gates**

Run: `bunx tsc --noEmit && bunx eslint . && bun test`
Expected: all clean; total test count increased by 9 over the prior task's baseline.

- [ ] **Step 6: Commit**

```bash
git add src/tools/knowledgeBase.ts src/tools/knowledgeBase.test.ts
git commit -m "feat: add search-knowledge/save-knowledge orchestration"
```

---

## Task 4: `SqlServerConnectionManager` methods

**Files:**
- Modify: `src/db/connection.ts`

**Interfaces:**
- Consumes: `quoteIdentifierPath` from `./identifier.js` (existing, unchanged), `config.knowledgeTable: string` (Task 1), `KnowledgeRow`/`SaveKnowledgeInput` from `../types/index.js` (Task 1).
- Produces: `searchKnowledge(query: string | undefined, limit: number): Promise<KnowledgeRow[]>` and `saveKnowledge(entry: SaveKnowledgeInput): Promise<void>` on `SqlServerConnectionManager` — matching `KnowledgeStore` structurally (no `implements` clause needed, same pattern as `SkillsStore`). Task 6 passes the real `db` instance wherever `KnowledgeStore` is expected.

No automated test for this task's live-DB methods — same project convention as `listSkills`/`getSkillDefinition`/etc (manual verification instead, covered in Task 7).

- [ ] **Step 1: Add the import and constructor field**

In `src/db/connection.ts`, update the type import (currently ends with `SkillSqlValidationResult,`) to also bring in the new types:

```typescript
import type {
  SqlServerConfig,
  Logger,
  SkillRow,
  SkillDefinition,
  SaveSkillInput,
  SkillSqlValidationResult,
  KnowledgeRow,
  SaveKnowledgeInput,
} from '../types/index.js';
```

Add a `knowledgeTable` field next to the existing `skillsTable` field:

```typescript
  private readonly skillsTable: string;
  private readonly knowledgeTable: string;
```

In the constructor, right after `this.skillsTable = quoteIdentifierPath(config.skillsTable);`, add:

```typescript
    this.knowledgeTable = quoteIdentifierPath(config.knowledgeTable);
```

- [ ] **Step 2: Add `searchKnowledge` and `saveKnowledge`**

Add these two methods right after `upsertSkill` (before the closing `}` of the class):

```typescript
  /**
   * Search tb_mcp_knowledge by a free-text substring match across
   * title/content/keywords, or list the most recently updated entries when
   * query is omitted. limit is bound as a parameter (TOP (@limit) is valid
   * T-SQL); the caller (searchKnowledgeTool) has already clamped it.
   */
  async searchKnowledge(query: string | undefined, limit: number): Promise<KnowledgeRow[]> {
    await this.ensureConnected();
    const request = this.pool!.request();
    request.input('limit', sql.Int, limit);
    if (query) {
      request.input('pattern', sql.NVarChar, `%${query}%`);
    }
    const whereClause = query ? 'WHERE title LIKE @pattern OR content LIKE @pattern OR keywords LIKE @pattern' : '';
    const result = await request.query(`
      SELECT TOP (@limit) title, content, keywords, updated_at
      FROM ${this.knowledgeTable}
      ${whereClause}
      ORDER BY updated_at DESC
    `);
    return result.recordset as KnowledgeRow[];
  }

  /**
   * Insert or update a knowledge entry by title.
   */
  async saveKnowledge(entry: SaveKnowledgeInput): Promise<void> {
    await this.ensureConnected();
    const request = this.pool!.request();
    request.input('title', sql.NVarChar, entry.title);
    request.input('content', sql.NVarChar(sql.MAX), entry.content);
    request.input('keywords', sql.NVarChar, entry.keywords ?? null);
    await request.query(`
      IF EXISTS (SELECT 1 FROM ${this.knowledgeTable} WHERE title = @title)
        UPDATE ${this.knowledgeTable}
        SET content = @content,
            keywords = @keywords,
            updated_at = SYSUTCDATETIME()
        WHERE title = @title
      ELSE
        INSERT INTO ${this.knowledgeTable} (title, content, keywords)
        VALUES (@title, @content, @keywords);
    `);
  }
```

- [ ] **Step 3: Verify the gates**

Run: `bunx tsc --noEmit && bunx eslint . && bun test && bun run build`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src/db/connection.ts
git commit -m "feat: add searchKnowledge/saveKnowledge to SqlServerConnectionManager"
```

---

## Task 5: Wire into `src/index.ts`

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `searchKnowledgeTool`, `saveKnowledgeTool` from `./tools/knowledgeBase.js` (Task 3); `SaveKnowledgeInput` from `./types/index.js` (Task 1); `config.knowledgeEnabled` (Task 1).
- Produces: two new tool names (`search-knowledge`, `save-knowledge`) reachable via `tools/list`/`tools/call` when `KNOWLEDGE_ENABLED` is on; a restructured `instructions` string builder other tasks don't depend on.

- [ ] **Step 1: Add the import**

In `src/index.ts`, update the import line:

```typescript
import { callDynamicSkill, loadDynamicTools, saveSkill } from './tools/dynamicSkills.js';
import { saveKnowledgeTool, searchKnowledgeTool } from './tools/knowledgeBase.js';
import type { McpToolDef, SaveKnowledgeInput, SaveSkillInput } from './types/index.js';
```

- [ ] **Step 2: Add the `knowledgeEnabled` flag next to `dynamicSkillsEnabled`**

Find:

```typescript
// SKILLS_ENABLED=false turns off the whole dynamic-skills feature: no
// save-skill tool, no tb_mcp_skills lookups on tools/list, and any call to
// a dynamic tool name is rejected. Static SQL tools are unaffected either way.
const dynamicSkillsEnabled = config.skillsEnabled;
```

Add right after it:

```typescript

// KNOWLEDGE_ENABLED=false turns off search-knowledge/save-knowledge
// entirely: neither tool is listed, and calling either name returns
// "Tool not found". Independent of dynamicSkillsEnabled.
const knowledgeEnabled = config.knowledgeEnabled;
```

- [ ] **Step 3: Add the two static tool defs**

Find the `saveSkillToolDef` constant and the `if (dynamicSkillsEnabled) { staticToolDefs.push(saveSkillToolDef); }` block right after it:

```typescript
if (dynamicSkillsEnabled) {
  staticToolDefs.push(saveSkillToolDef);
}

const STATIC_TOOL_NAMES = new Set(staticToolDefs.map((t) => t.name));
```

Replace it with:

```typescript
if (dynamicSkillsEnabled) {
  staticToolDefs.push(saveSkillToolDef);
}

const searchKnowledgeToolDef: McpToolDef = {
  name: 'search-knowledge',
  description:
    "Search the knowledge base (notes, gotchas, SOP excerpts) for entries relevant to a query. Call this before answering domain-specific questions this server's tools alone don't explain.",
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Free-text search term, matched against title/content/keywords. Omit to list the most recently updated entries.',
      },
      limit: {
        type: 'integer',
        description: 'Max entries to return (1-50, default 10).',
      },
    },
  },
};

const saveKnowledgeToolDef: McpToolDef = {
  name: 'save-knowledge',
  description:
    'Add or update a knowledge base entry. Use this whenever you learn something about this database/domain worth remembering for future sessions — table semantics, gotchas, SOP notes.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Unique title identifying this entry. Saving with an existing title overwrites its content.',
      },
      content: { type: 'string', description: 'The note/fact/doc excerpt itself.' },
      keywords: {
        type: 'string',
        description: 'Optional comma-separated keywords to help future searches find this entry.',
      },
    },
    required: ['title', 'content'],
  },
};

if (knowledgeEnabled) {
  staticToolDefs.push(searchKnowledgeToolDef, saveKnowledgeToolDef);
}

const STATIC_TOOL_NAMES = new Set(staticToolDefs.map((t) => t.name));
```

- [ ] **Step 4: Restructure `instructions` into per-feature paragraphs**

Find:

```typescript
const SKILLS_WORKFLOW_INSTRUCTIONS = `
To create a new reusable "skill" tool (e.g. "cek tagihan"), always follow this order:
1. Call get-metadata (type: "tables", then type: "columns" with the real table name) to discover the actual table/column names. Never guess them.
2. Compose generated_prompt (a JSON Schema string for the skill's input) and generated_sql (parameterized SQL using @paramName placeholders matching generated_prompt's properties) from what you found.
3. Call save-skill with tool_name, description, keywords, generated_prompt, generated_sql. It validates everything (JSON shape, that every property has a description, and a transaction+rollback dry-run of the SQL) before the skill becomes callable.
Do not call save-skill before get-metadata for a table you have not inspected in this session.`.trim();

function createMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      ...(dynamicSkillsEnabled ? { instructions: SKILLS_WORKFLOW_INSTRUCTIONS } : {}),
    },
  );
```

Replace with:

```typescript
const SKILLS_WORKFLOW_INSTRUCTIONS = `To create a new reusable "skill" tool (e.g. "cek tagihan"), always follow this order:
1. Call get-metadata (type: "tables", then type: "columns" with the real table name) to discover the actual table/column names. Never guess them.
2. Compose generated_prompt (a JSON Schema string for the skill's input) and generated_sql (parameterized SQL using @paramName placeholders matching generated_prompt's properties) from what you found.
3. Call save-skill with tool_name, description, keywords, generated_prompt, generated_sql. It validates everything (JSON shape, that every property has a description, and a transaction+rollback dry-run of the SQL) before the skill becomes callable.
Do not call save-skill before get-metadata for a table you have not inspected in this session.`;

const KNOWLEDGE_WORKFLOW_INSTRUCTIONS = `Before answering a domain-specific question this server's tools alone don't explain (table meanings, business rules, gotchas), call search-knowledge to check for a relevant note. After learning something about this database/domain worth remembering for future sessions, call save-knowledge to record it.`;

function buildInstructions(): string | undefined {
  const paragraphs: string[] = [];
  if (dynamicSkillsEnabled) {
    paragraphs.push(SKILLS_WORKFLOW_INSTRUCTIONS);
  }
  if (knowledgeEnabled) {
    paragraphs.push(KNOWLEDGE_WORKFLOW_INSTRUCTIONS);
  }
  return paragraphs.length > 0 ? paragraphs.join('\n\n') : undefined;
}

function createMcpServer(): Server {
  const instructions = buildInstructions();
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      ...(instructions ? { instructions } : {}),
    },
  );
```

- [ ] **Step 5: Dispatch the two new tools in `CallToolRequestSchema`**

`search-knowledge`/`save-knowledge` need their own `!knowledgeEnabled` guard, mirroring the `default` block's `!dynamicSkillsEnabled` guard: the `switch` matches on the literal tool name regardless of what's in `STATIC_TOOL_NAMES`, so if `knowledgeEnabled` is `false` these two names were never pushed into `staticToolDefs` (they're absent from `tools/list` and get no `validateStaticArgs` check) but a client calling them directly by name would still reach these `case` arms without an explicit guard.

Find the `switch (name) {` block's `case 'get-status':` arm and the `default:` block right after it:

```typescript
      case 'get-status':
        return runTool((h) => h.handleGetStatus());
      default: {
        if (!dynamicSkillsEnabled) {
          return {
            content: [{ type: 'text', text: `Error: Tool not found: ${name} (dynamic skills are disabled)` }],
            isError: true,
          };
        }
        const store = await getStoreOrNull();
        if (!store) {
          return {
            content: [{ type: 'text', text: 'Error: SQL Server is unavailable' }],
            isError: true,
          };
        }
        if (name === 'save-skill') {
          return saveSkill(store, logger, STATIC_TOOL_NAMES, args as unknown as SaveSkillInput);
        }
        return callDynamicSkill(store, logger, name, (args ?? {}) as Record<string, unknown>);
      }
```

Replace with:

```typescript
      case 'get-status':
        return runTool((h) => h.handleGetStatus());
      case 'search-knowledge': {
        if (!knowledgeEnabled) {
          return { content: [{ type: 'text', text: 'Error: Tool not found: search-knowledge' }], isError: true };
        }
        const store = await getStoreOrNull();
        if (!store) {
          return { content: [{ type: 'text', text: 'Error: SQL Server is unavailable' }], isError: true };
        }
        return searchKnowledgeTool(store, logger, (args ?? {}) as { query?: unknown; limit?: unknown });
      }
      case 'save-knowledge': {
        if (!knowledgeEnabled) {
          return { content: [{ type: 'text', text: 'Error: Tool not found: save-knowledge' }], isError: true };
        }
        const store = await getStoreOrNull();
        if (!store) {
          return { content: [{ type: 'text', text: 'Error: SQL Server is unavailable' }], isError: true };
        }
        return saveKnowledgeTool(store, logger, args as unknown as SaveKnowledgeInput);
      }
      default: {
        if (!dynamicSkillsEnabled) {
          return {
            content: [{ type: 'text', text: `Error: Tool not found: ${name} (dynamic skills are disabled)` }],
            isError: true,
          };
        }
        const store = await getStoreOrNull();
        if (!store) {
          return {
            content: [{ type: 'text', text: 'Error: SQL Server is unavailable' }],
            isError: true,
          };
        }
        if (name === 'save-skill') {
          return saveSkill(store, logger, STATIC_TOOL_NAMES, args as unknown as SaveSkillInput);
        }
        return callDynamicSkill(store, logger, name, (args ?? {}) as Record<string, unknown>);
      }
```

- [ ] **Step 6: Verify the gates**

Run: `bunx tsc --noEmit && bunx eslint . && bun test && bun run build`
Expected: all clean.

- [ ] **Step 7: Manual smoke test**

Start the server over stdio and exercise it directly (this project's established manual-verification convention, same as used for Dynamic Skills' Task 6/8):

```bash
SQLSERVER_SERVER=localhost SQLSERVER_USERNAME=sa SQLSERVER_PASSWORD=YourStrong@Password \
SQLSERVER_DATABASE=master bun run src/index.ts
```

In a separate terminal (or via a JSON-RPC test harness), send `initialize` then `tools/list` and confirm the response includes `search-knowledge` and `save-knowledge` with the schemas above, and that the `instructions` field in the `initialize` response contains both the skills and knowledge paragraphs (assuming both features are enabled, which is the default). Stop the server (Ctrl+C).

- [ ] **Step 8: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire search-knowledge/save-knowledge into the MCP server"
```

---

## Task 6: Documentation

**Files:**
- Create: `docs/KNOWLEDGE_BASE.md`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Write `docs/KNOWLEDGE_BASE.md`**

```markdown
# Knowledge Base

Beyond the built-in tools, this server can store free-form notes — table
semantics, gotchas, SOP excerpts — in a database table, `tb_mcp_knowledge`,
searchable and self-updatable by an AI client with no restart and no human
review step. See the design rationale in
`docs/superpowers/specs/2026-09-03-knowledge-base-design.md`.

Unlike Dynamic Skills, entries here are inert text — never executed — so
there is no SQL dry-run, no per-property schema, no `SQLSERVER_ALLOW_MUTATIONS`
question. The only trust question is "who can call `save-knowledge`", since
a future AI session will read and may act on whatever is saved there.

## Setup

Run `scripts/sql/create-tb-mcp-knowledge.sql` once against your target
database.

The feature is on by default. Set `KNOWLEDGE_ENABLED=false` to turn it off
entirely — `search-knowledge`/`save-knowledge` disappear from `tools/list`
and calling either by name returns `isError: true`.

To use a different table name — or a schema/database-qualified one — set
`KNOWLEDGE_TABLE`, independent of Dynamic Skills' `SKILLS_TABLE`:

```env
KNOWLEDGE_TABLE=master.dbo.notes
```

Accepted forms: `table`, `schema.table`, or `database.schema.table`, using
only letters, digits, and underscores in each part.

## Two ways to add an entry

**Via an AI client (recommended):** ask it to remember something, or let it
decide to on its own — the server's `instructions` (sent at connect time)
tell a well-behaved client to call `save-knowledge` whenever it learns
something about the database/domain worth remembering, and to call
`search-knowledge` before answering a question this server's tools alone
don't explain.

**Manually:** `INSERT` directly into `tb_mcp_knowledge`. No validation
happens either way beyond `title`/`content` not being empty — this is text,
not executable SQL, so there's nothing to dry-run.

## Worked example

```sql
INSERT INTO tb_mcp_knowledge (title, content, keywords)
VALUES (
    'tb_tagihan.status meanings',
    'status column: 1=lunas, 2=belum bayar, 3=cicilan. Always join with tb_pelanggan on nomor_pelanggan, never on id.',
    'tagihan, billing, status'
);
```

Calling `search-knowledge` with `{"query": "tagihan"}` returns:

```json
[
  {
    "title": "tb_tagihan.status meanings",
    "content": "status column: 1=lunas, 2=belum bayar, 3=cicilan. Always join with tb_pelanggan on nomor_pelanggan, never on id.",
    "keywords": "tagihan, billing, status",
    "updated_at": "2026-09-03T00:00:00.000Z"
  }
]
```

Calling `search-knowledge` with no arguments lists the most recently
updated entries (default 10, max 50 via `limit`).

## Notes

- Removing an entry is manual DB administration
  (`DELETE FROM tb_mcp_knowledge WHERE title = ...`) — there's no tool for
  it, same as deactivating a Dynamic Skill.
- `save-knowledge` overwrites in place, keyed on `title` — there's no
  history of previous versions.
- Matching is a plain `LIKE '%query%'` across `title`/`content`/`keywords`,
  not full-text search or ranking. Good enough for a per-deployment
  knowledge base; revisit only if this proves too weak in practice.
```

- [ ] **Step 2: Update `.env.example`**

Find:

```
# Optional: Dynamic Skills feature (see docs/DYNAMIC_SKILLS.md).
# SKILLS_ENABLED=true            # set to false to disable save-skill and all dynamic tools
# Table name; accepts "table", "schema.table", or "database.schema.table".
# SKILLS_TABLE=tb_mcp_skills
```

Add right after it:

```

# Optional: Knowledge Base feature (see docs/KNOWLEDGE_BASE.md).
# KNOWLEDGE_ENABLED=true         # set to false to disable search-knowledge/save-knowledge
# Table name; accepts "table", "schema.table", or "database.schema.table".
# KNOWLEDGE_TABLE=tb_mcp_knowledge
```

- [ ] **Step 3: Update `README.md`**

In the `## Configuration` env block, find:

```
# Dynamic Skills feature (optional — see docs/DYNAMIC_SKILLS.md)
# SKILLS_ENABLED=true
# SKILLS_TABLE=tb_mcp_skills
```

Add right after it:

```

# Knowledge Base feature (optional — see docs/KNOWLEDGE_BASE.md)
# KNOWLEDGE_ENABLED=true
# KNOWLEDGE_TABLE=tb_mcp_knowledge
```

In the `## Usage` tool list, find the `### Dynamic Skills` section (after
`### 6. Save Skill Tool`) and add a new section right after it:

```markdown
### Knowledge Base

Beyond the SQL tools, this server can store and search free-form notes —
table semantics, gotchas, SOP excerpts — via `search-knowledge` and
`save-knowledge`, backed by a `tb_mcp_knowledge` database table — see
[docs/KNOWLEDGE_BASE.md](docs/KNOWLEDGE_BASE.md).
```

- [ ] **Step 4: Verify the gates one more time**

Run: `bunx tsc --noEmit && bunx eslint . && bun test && bun run build`
Expected: all clean (docs-only changes shouldn't affect these, but confirm nothing else drifted).

- [ ] **Step 5: Commit**

```bash
git add docs/KNOWLEDGE_BASE.md .env.example README.md
git commit -m "docs: document the Knowledge Base feature"
```

---

## Task 7: End-to-end verification

**Files:** none modified — verification only, matching Dynamic Skills' Task 8 convention (no code changes expected).

**Interfaces:** none.

- [ ] **Step 1: Provision the table**

Against a real (e.g. local docker-compose) SQL Server:

```bash
sqlcmd -S localhost -U sa -P 'YourStrong@Password' -d master -i scripts/sql/create-tb-mcp-knowledge.sql
```

- [ ] **Step 2: Start the server over stdio and drive it via JSON-RPC**

Same harness/approach used for Dynamic Skills' Task 8 (a small script or manual stdin/stdout JSON-RPC exchange against `bun run src/index.ts`, or via an MCP client CLI already used in this project).

Exercise, in order:
1. `initialize` — confirm the `instructions` field contains both the skills and knowledge paragraphs.
2. `tools/list` — confirm `search-knowledge` and `save-knowledge` are present with the schemas from Task 5.
3. `tools/call` `save-knowledge` with `{"title": "tb_tagihan.status meanings", "content": "1=lunas, 2=belum, 3=cicilan", "keywords": "tagihan, billing"}` — confirm success text, no `isError`.
4. `tools/call` `search-knowledge` with `{"query": "tagihan"}` — confirm the entry from step 3 comes back.
5. `tools/call` `search-knowledge` with `{}` (no query) — confirm the entry from step 3 is included in the most-recent listing.
6. `tools/call` `save-knowledge` again with the same `title` but different `content` — confirm it updates in place (re-run step 4 or an equivalent search and confirm the new content, not a duplicate row): `SELECT COUNT(*) FROM tb_mcp_knowledge WHERE title = 'tb_tagihan.status meanings'` should return `1`.
7. Restart the server with `KNOWLEDGE_ENABLED=false` — confirm `tools/list` no longer includes `search-knowledge`/`save-knowledge`, and `tools/call` `search-knowledge` returns `isError: true`.

- [ ] **Step 3: Record the outcome**

No commit for this task unless something unexpected turns up (in which case fix it in this task's own commit, re-run steps 1-2, and only then move on). If everything matches, no commit is needed — the code was already committed in Tasks 1-6.
