# Knowledge Base (`tb_mcp_knowledge`) — Design

## Problem

The server has no way for an AI client to record or retrieve free-form
notes about the domain it's working in — table semantics that aren't
obvious from the schema ("`status` in `tb_tagihan`: 1=lunas, 2=belum,
3=cicilan"), gotchas ("`x_erp` is a daily snapshot, don't use it for
realtime figures"), or general SOP/documentation excerpts. Today that
knowledge either lives nowhere (rediscovered, or gotten wrong, every
session) or has to be pasted into every prompt by hand.

This feature adds a small, general-purpose knowledge store — title +
content + free-text keywords — that an AI client can search before
answering a domain question, and add to itself as it learns things, with
no human review step. It follows the same DB-table-plus-MCP-tools shape as
the existing Dynamic Skills feature, but is deliberately simpler: entries
are inert text, never executed, so none of Dynamic Skills' SQL-validation
machinery applies here.

## Goals

- An AI client can search existing knowledge by free-text query before
  answering a question, and add or update an entry after learning
  something new — both without a restart and without human approval.
- Content can be anything from a one-line fact to a longer SOP/doc excerpt
  — the schema doesn't distinguish between them.
- Saving a new entry is cheap: only `title` and `content` are required. No
  SQL dry-run, no per-property description requirement — this is text, not
  an executable skill.
- Independent on/off switch and table name from Dynamic Skills — an
  operator can run one feature without the other.

## Non-goals

- No entry deletion tool. Removing an entry is manual DB administration
  (`DELETE FROM tb_mcp_knowledge WHERE title = ...`), same as deactivating
  a skill.
- No full-text search / ranking (SQL Server `CONTAINS`/`FREETEXT`, external
  search index, embeddings). Matching is `LIKE '%query%'` across
  `title`, `content`, and `keywords` — cheap, needs no setup, good enough
  for a per-deployment knowledge base of the size this targets. Revisit
  only if this proves too weak in practice.
- No versioning/history of edits. `save-knowledge` overwrites in place;
  the previous `content` is gone once updated.
- No categorization/tag taxonomy. `keywords` is one free-text field, same
  pattern as Dynamic Skills' `keywords` column.
- Entries are never exposed as their own MCP tools (unlike skills). They
  are data behind exactly two tools, `search-knowledge` and
  `save-knowledge` — never registered individually in `tools/list`.

## Database schema

New table, DDL shipped at `scripts/sql/create-tb-mcp-knowledge.sql`:

```sql
CREATE TABLE tb_mcp_knowledge (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    title       NVARCHAR(255)  NOT NULL UNIQUE,
    content     NVARCHAR(MAX)  NOT NULL,
    keywords    NVARCHAR(500)  NULL,
    created_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
```

No `is_active` flag (unlike `tb_mcp_skills`): there's no "bad row could
crash something" risk to guard against by deactivating instead of
deleting — an entry with unhelpful or stale content just doesn't match
future searches usefully. Removal is a plain `DELETE`.

## Configuration

Two new environment variables, independent of the existing
`SKILLS_ENABLED`/`SKILLS_TABLE`:

- `KNOWLEDGE_ENABLED` (default `true`) — when `false`, the whole feature
  is off: no `search-knowledge`/`save-knowledge` tools in `tools/list`, no
  DB lookups, any call to either tool name returns `isError: true`.
- `KNOWLEDGE_TABLE` (default `tb_mcp_knowledge`) — same shape/validation
  as `SKILLS_TABLE`: accepts `table`, `schema.table`, or
  `database.schema.table`, checked and bracket-quoted once at startup via
  the existing `quoteIdentifierPath()` (`src/db/identifier.ts` — no
  changes needed there, it's already generic).

## Architecture

Mirrors the Dynamic Skills module shape:

- **`src/db/connection.ts`** — two new methods on
  `SqlServerConnectionManager`, following the same
  validate-table-name-once-in-the-constructor pattern already used for
  `skillsTable`:
  - `searchKnowledge(query: string | undefined, limit: number): Promise<KnowledgeRow[]>`
    — `SELECT TOP (@limit) title, content, keywords, updated_at FROM
    <knowledgeTable> WHERE @query IS NULL OR title LIKE @pattern OR
    content LIKE @pattern OR keywords LIKE @pattern ORDER BY updated_at
    DESC`, where `@pattern = '%' + query + '%'`. `limit` is bound as a
    SQL parameter (`TOP (@limit)` is valid T-SQL); `query`/`pattern` are
    always bound, never interpolated.
  - `saveKnowledge(entry: SaveKnowledgeInput): Promise<void>` — `IF EXISTS
    (SELECT 1 FROM <knowledgeTable> WHERE title = @title) UPDATE ... ELSE
    INSERT ...`, keyed on `title`, same upsert shape as `upsertSkill`.

- **`src/tools/knowledgeBase.ts`** (new) — orchestration against a new
  `KnowledgeStore` interface (structural typing, satisfied by
  `SqlServerConnectionManager` without an `implements` clause, same
  pattern as `SkillsStore`):
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
  Two functions:
  - `searchKnowledgeTool(store, logger, args): Promise<CallToolResult>` —
    clamps `args.limit` into `[1, 50]` (default `10`), calls
    `store.searchKnowledge(args.query, limit)`, returns the rows as
    formatted JSON text. An empty result set is not an error — returns
    `{ content: [...], }` with an empty array and no `isError`, same as a
    `query` tool call that matches zero rows. A thrown DB error is caught
    and returned as `isError: true` with the driver's message.
  - `saveKnowledgeTool(store, logger, input): Promise<CallToolResult>` —
    calls `store.saveKnowledge(input)` directly (no pre-validation beyond
    what the tool's own JSON Schema `required` already enforces via the
    static-tool ajv validation in `src/index.ts`); catches and returns any
    thrown DB error as `isError: true`. On success, returns a short
    confirmation message.

  Both files get `bun:test` unit tests against a fake `KnowledgeStore`,
  same convention as `dynamicSkills.test.ts` — no live-DB test coverage
  for the two `connection.ts` methods themselves (project convention,
  same as skills' DB methods).

### `src/index.ts` changes

- Two new static tool defs, pushed onto `staticToolDefs` only when
  `config.knowledgeEnabled` (mirrors the existing
  `dynamicSkillsEnabled`/`save-skill` conditional push):
  ```json
  {
    "name": "search-knowledge",
    "description": "Search the knowledge base (notes, gotchas, SOP excerpts) for entries relevant to a query. Call this before answering domain-specific questions this server's tools alone don't explain.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "Free-text search term, matched against title/content/keywords. Omit to list the most recently updated entries." },
        "limit": { "type": "integer", "description": "Max entries to return (1-50, default 10)." }
      }
    }
  },
  {
    "name": "save-knowledge",
    "description": "Add or update a knowledge base entry. Use this whenever you learn something about this database/domain worth remembering for future sessions — table semantics, gotchas, SOP notes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "description": "Unique title identifying this entry. Saving with an existing title overwrites its content." },
        "content": { "type": "string", "description": "The note/fact/doc excerpt itself." },
        "keywords": { "type": "string", "description": "Optional comma-separated keywords to help future searches find this entry." }
      },
      "required": ["title", "content"]
    }
  }
  ```
- Both names are added to `STATIC_TOOL_NAMES` (they're in
  `staticToolDefs`, so this happens automatically) — they get the same
  ajv argument validation as every other static tool before dispatch.
- `CallToolRequestSchema`'s `switch`: two new `case` branches
  (`search-knowledge`, `save-knowledge`) dispatching to
  `searchKnowledgeTool`/`saveKnowledgeTool` via `getStoreOrNull()`, same
  DB-unavailable handling already used for `save-skill`/dynamic skill
  calls (`isError: true`, "SQL Server is unavailable", no exception
  thrown). If `knowledgeEnabled` is `false`, neither case is reachable —
  the tool names aren't in `STATIC_TOOL_NAMES` and there is no dynamic
  fallback for them (unlike skill names, which fall through to
  `callDynamicSkill`'s "Tool not found"), so an explicit branch before the
  `switch` returns `isError: true`, "Tool not found" for these two names
  specifically when disabled, worded the same as the existing
  skills-disabled branch for consistency.
- Server `instructions` (sent at `initialize`) currently exists only as a
  single fixed string, set conditionally on `dynamicSkillsEnabled` alone —
  so with skills off and knowledge on, today's code would drop the
  instructions field entirely. Restructure it into an array of
  independent paragraphs, one per feature, each pushed only when its flag
  is on; join with `\n\n` and pass as `instructions` only if the array is
  non-empty (omit the field entirely if both flags are off). The knowledge
  paragraph tells the client to call `search-knowledge` before answering a
  domain question it's unsure about, and `save-knowledge` after learning
  something new.

## Data flow (search)

1. Client calls `search-knowledge` with an optional `query` and `limit`.
2. Server clamps `limit`, runs the parameterized `LIKE` query.
3. Rows (possibly zero) returned as JSON text, `updated_at` included so
   the client can judge how fresh an entry is.

## Data flow (save)

1. Client calls `save-knowledge` with `title`, `content`, optional
   `keywords`.
2. ajv validates `title`/`content` are present (from the tool's own
   `inputSchema`, same mechanism as every static tool) before the handler
   runs at all.
3. Server upserts keyed on `title`. No further validation, no dry-run.
4. Success → short confirmation text. DB error → `isError: true` with the
   driver's message (e.g. a `title` over 255 chars truncated/rejected by
   SQL Server surfaces its own error, not a friendlier pre-check — same
   trade-off Dynamic Skills' final review flagged and left as a documented
   minor gap, not worth a bespoke length check here either).

## Security model

- Entries are plain text, never executed — there is no SQL-trust question
  here the way there is for `generated_sql` in Dynamic Skills.
- The only injection surface is the `LIKE` search and the upsert, and both
  bind every value (`query`, `title`, `content`, `keywords`, `limit`) as a
  SQL parameter, never string-interpolated.
- Anyone who can call `save-knowledge` can write content that a future AI
  session will read and may act on (a prompt-injection-via-stored-content
  risk, structurally the same as anyone editing a doc a future session
  reads). This is accepted as inherent to the feature's purpose — trust
  boundary is "who can call `save-knowledge`", same framing already
  documented for `save-skill` in `docs/DYNAMIC_SKILLS.md`.

## Error handling summary

| Situation | Behavior |
|---|---|
| `KNOWLEDGE_ENABLED=false`, either tool called | `isError: true`, "Tool not found" |
| DB unreachable | `isError: true`, "SQL Server is unavailable" (no exception) |
| `search-knowledge` matches zero rows | Success, empty array — not an error |
| `search-knowledge`/`save-knowledge` args fail ajv validation | `isError: true`, field-level messages (same static-tool path as every other tool) |
| `save-knowledge` DB error (e.g. truncation) | `isError: true`, driver error message |

## Testing

Same convention as Dynamic Skills:

- `tsc --noEmit`, `eslint .`, `bun test`, `bun run build` must stay clean.
- `src/tools/knowledgeBase.test.ts` — pure orchestration tests against a
  fake `KnowledgeStore` (no live DB): empty-query listing, query matching,
  limit clamping, zero-result success (not error), DB-error-to-isError
  mapping, save-then-searchable-by-fake-store round trip.
- Manual end-to-end verification against a real SQL Server (docker-compose
  instance already used for Dynamic Skills' Task 8 verification), added as
  a follow-up task in the implementation plan: `save-knowledge` a real
  entry, `search-knowledge` by a keyword substring and confirm it's found,
  confirm an empty-query call lists it, confirm `KNOWLEDGE_ENABLED=false`
  hides both tools from `tools/list`.
