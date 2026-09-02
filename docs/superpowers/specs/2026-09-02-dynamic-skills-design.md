# Dynamic Skills (`tb_mcp_skills`) — Design

## Problem

The server currently exposes a fixed set of 5 generic SQL tools (`query`,
`execute-statement`, `get-metadata`, `execute-procedure`, `get-status`). For a
recurring business operation — e.g. "check bill status for phone number X" —
an AI client has to reconstruct the right query from scratch every time,
using `get-metadata` to rediscover the schema and `query`/`execute-statement`
to run ad-hoc SQL. That's slow, repeats work, and risks the AI guessing wrong
table/column names.

This feature adds a way to define named, reusable "skills" — each backed by
a pre-written parameterized SQL query and a JSON Schema describing its
inputs — stored in a SQL Server table (`tb_mcp_skills`) and exposed
dynamically as additional MCP tools, alongside the 5 existing static ones.

## Goals

- An AI client (or a human on the team) can define a new skill by writing
  its SQL once; from then on it's callable as a normal MCP tool, by anyone
  connected to the server, without a restart.
- Skills can be defined two ways: manually (direct SQL insert by the team)
  or via a new `save-skill` MCP tool that an AI client calls after exploring
  the schema with `get-metadata`. Both are first-class; the read/execution
  path must not assume a skill came from `save-skill`'s validation.
- The 5 existing static tools are unaffected in behavior.
- Bad or stale skill rows (invalid JSON, dropped tables, typos) degrade
  gracefully — they don't take down `tools/list` or crash the server.

## Non-goals

- No skill deactivation/deletion tool. Deactivating a skill (`is_active = 0`)
  is manual DB administration, same as creating a table.
- No mutation-policy gate (`SQLSERVER_ALLOW_MUTATIONS`) for dynamic skills.
  Skill SQL is trusted content (authored by an AI client or the team), not
  arbitrary end-user input — see "Security model" below.
- No caching of the skill list. Every `tools/list` call re-queries the DB.

## Database schema

New table, DDL shipped at `scripts/sql/create-tb-mcp-skills.sql`:

```sql
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
```

## `generated_prompt`: schema *and* prompt

`generated_prompt` is a JSON Schema string, but its name is deliberate: it
is the only channel an AI client reads to decide *how* to call a skill
(MCP sends `inputSchema` — this column, parsed — to the client via
`tools/list`; a client's model reads each property's `description` to know
what value to supply). It is not purely a validation contract.

Three columns, three different questions an AI client needs answered, each
served by a different column:

| Column | Answers | Example for "laporan tunggakan bulan X" |
|---|---|---|
| `description` + `keywords` | *Which* tool should I use? (browsing `tools/list`) | "Ambil daftar pelanggan menunggak untuk bulan & tahun tertentu. (Keywords: tunggakan, arrears, laporan bulanan)" |
| `generated_prompt` | *How* do I fill in its arguments? (per property) | `{"bulan": {"type":"integer","description":"Bulan laporan, 1-12"}, "tahun": {"type":"integer","description":"Tahun laporan, contoh 2026"}}` |
| `generated_sql` | (used by the server only, never seen by the AI client) | `SELECT ... WHERE bulan_tagihan=@bulan AND tahun_tagihan=@tahun` |

Consequence: when a skill is authored from a vague instruction (e.g. "buat
skill laporan tunggakan bulan X" with no further spec), the authoring AI —
via `save-skill` — is responsible for inventing well-described parameters,
not just correctly-typed ones. A schema of `{"bulan": {"type":"integer"}}`
with no `description` technically validates calls but defeats the point:
a future AI session calling this tool still has to guess what "bulan" means,
its valid range, and its relationship to the rest of the skill.

To make this a structural guarantee rather than a hope, `save-skill`
additionally rejects (no DB write) any `generated_prompt` where a property
under `properties` is missing a non-empty `description`. This is checked
alongside the JSON-parse check, before the transaction+rollback SQL
validation.

## Architecture

### Why drop `McpServer` for the tool-registration layer

The server currently uses the SDK's high-level `McpServer.registerTool()`
with zod schemas, registered once when `createMcpServer()` runs. That model
doesn't fit here: skill schemas arrive at runtime as JSON Schema strings from
a DB column, not as compile-time zod types, and the list must be re-queried
fresh on every `tools/list` call (agreed requirement — no restart needed to
pick up new skills).

The server reverts to the SDK's low-level `Server`, with a single
`ListToolsRequestSchema` handler and a single `CallToolRequestSchema`
handler that each merge static and dynamic tools. The 5 static tools' input
schemas move from zod back to plain JSON Schema objects (matching the shape
they had before the previous modernization pass) so they can sit in the same
array as DB-sourced schemas without a conversion step.

Trade-off accepted: the 5 static tools lose zod's compile-time schema
authoring ergonomics. Their runtime behavior (validation logic inside
`ToolHandlers`) is unaffected — only the *schema declaration* moves from
zod back to hand-written JSON Schema.

### New modules

**`src/db/connection.ts`** — new methods on `SqlServerConnectionManager`:

- `listSkills(): Promise<SkillRow[]>` — `SELECT tool_name, description,
  keywords, generated_prompt FROM tb_mcp_skills WHERE is_active = 1`.
- `getSkillDefinition(toolName: string): Promise<{generated_prompt: string;
  generated_sql: string} | null>` — `SELECT generated_prompt, generated_sql
  FROM tb_mcp_skills WHERE tool_name = @toolName AND is_active = 1`.
- `executeParameterized(sql: string, params: Record<string, unknown>):
  Promise<sql.IResult<Record<string, unknown>>>` — binds each `params` entry
  via `request.input(key, value)`, runs `request.query(sql)`. Same pattern
  already used by `execute()`.
- `validateSkillSql(sql: string, dummyParams: Record<string, unknown>):
  Promise<{ valid: true } | { valid: false; error: string }>` — runs the SQL
  inside an explicit transaction with the given dummy parameters bound, then
  always rolls back (never commits), regardless of outcome. Catches and
  returns any thrown error as `{ valid: false, error }`.
- `upsertSkill(skill: { tool_name: string; description: string; keywords?:
  string; generated_prompt: string; generated_sql: string }): Promise<void>`
  — `IF EXISTS (...) UPDATE ... ELSE INSERT ...` keyed on `tool_name`, always
  setting `is_active = 1` and `updated_at = SYSUTCDATETIME()`.

**`src/tools/dynamicSkills.ts`** (new) — orchestration, taking `db: 
SqlServerConnectionManager` and `logger: Logger`:

- `loadDynamicTools(db, logger, staticNames: Set<string>): Promise<Tool[]>`
  — calls `listSkills()`; for each row: skip + log a warning if `tool_name`
  collides with `staticNames`, or if `JSON.parse(generated_prompt)` throws.
  Otherwise map to `{ name: tool_name, description: keywords ?
  \`${description} (Keywords: ${keywords})\` : description, inputSchema:
  <parsed JSON> }`. If `listSkills()` itself throws (DB unreachable), log a
  warning and return `[]` — never propagate.
- `callDynamicSkill(db, logger, toolName, args): Promise<CallToolResult>` —
  calls `getSkillDefinition(toolName)`; `null` → `isError: true`, "Tool not
  found". Otherwise: parse `generated_prompt`, validate `args` against it
  with `ajv` (collecting all errors into one readable message on failure,
  returned as `isError: true`); on success, call `executeParameterized` and
  return `{ content: [{ type: 'text', text:
  JSON.stringify(result.recordset, null, 2) }] }`. SQL execution errors are
  caught and returned as `isError: true` with the driver's message, same
  convention as the existing static tools.
- `buildDummyArgs(schema: object): Record<string, unknown>` — walks the
  parsed JSON Schema's `properties`, producing one placeholder value per
  declared type (`string` → `''`, `number`/`integer` → `0`, `boolean` →
  `false`, anything else → `null`). Used only by the `save-skill` validation
  step below.
- `saveSkill(db, logger, input: { tool_name; description; keywords?;
  generated_prompt; generated_sql }): Promise<CallToolResult>` — rejects (as
  `isError: true`, no DB write), checked in this order:
  1. `tool_name` collides with a static tool name.
  2. `generated_prompt` isn't valid JSON, or isn't a JSON Schema object with
     a `properties` map.
  3. Any entry in `properties` has no non-empty `description` — message
     names the offending property so the caller can fix just that one.
  4. `validateSkillSql()` (run with `buildDummyArgs(parsedPrompt)`) reports
     `valid: false` — the DB's own error message is surfaced verbatim so the
     caller (typically an AI client) can see exactly what's wrong (bad
     table/column name, syntax error, etc.) and retry.

  On success, calls `upsertSkill()` and returns a confirmation result.

### `src/index.ts` changes

- `STATIC_TOOL_NAMES = new Set(['query', 'execute-statement',
  'get-metadata', 'execute-procedure', 'get-status', 'save-skill'])`.
- `ListToolsRequestSchema` handler: `[...staticToolDefs, ...(await
  loadDynamicTools(db, logger, STATIC_TOOL_NAMES))]`. Requires DB access
  (via the existing lazy `getHandlers()`/`db` init) only for the dynamic
  half; static tools are always returned even if that DB call fails.
- `CallToolRequestSchema` handler: if `name` is in `STATIC_TOOL_NAMES` minus
  `save-skill`, existing dispatch to `ToolHandlers`. If `name === 
  'save-skill'`, dispatch to `saveSkill()`. Otherwise, dispatch to
  `callDynamicSkill()`.
- `save-skill`'s static JSON Schema:
  ```json
  {
    "type": "object",
    "properties": {
      "tool_name": { "type": "string", "description": "Unique snake/kebab-case tool identifier" },
      "description": { "type": "string" },
      "keywords": { "type": "string", "description": "Comma-separated keywords" },
      "generated_prompt": { "type": "string", "description": "JSON Schema (as a string) describing this tool's input arguments. Every property MUST have its own non-empty \"description\" — this is what a future AI session reads to know what value to supply, so write it as if explaining the parameter to someone who has never seen this skill before." },
      "generated_sql": { "type": "string", "description": "Parameterized SQL using @paramName placeholders matching generated_prompt's properties" }
    },
    "required": ["tool_name", "description", "generated_prompt", "generated_sql"]
  }
  ```
  Its own description instructs the caller to explore the schema with
  `get-metadata` first.

## Data flow (skill creation)

1. Client calls `get-metadata` (existing tool) to inspect real tables/columns.
2. Client authors `generated_sql` + `generated_prompt` itself.
3. Client calls `save-skill`.
4. Server: reject on name collision or invalid `generated_prompt` JSON.
5. Server: build dummy args from `generated_prompt`, run `generated_sql` in
   a transaction with those args bound, roll back unconditionally.
6. Transaction step errors → reject, surface the SQL Server error message.
7. Transaction step succeeds → `upsertSkill()`, return success.

## Data flow (skill call)

1. Client calls `tools/list` → sees the skill (assuming `is_active = 1` and
   its `generated_prompt` still parses).
2. Client calls the skill by name with arguments.
3. Server loads `{generated_prompt, generated_sql}`, validates arguments
   against `generated_prompt` with `ajv`.
4. Invalid → `isError: true` with per-field messages.
5. Valid → bind each argument via `request.input(key, value)`, execute
   `generated_sql`, return the recordset as JSON text.

## Security model

- Dynamic skill SQL is **trusted content**, not sanitized end-user input —
  it comes from an AI client that has already explored the real schema, or
  from the team directly. `SQLSERVER_ALLOW_MUTATIONS` does not gate it,
  matching the earlier decision for this feature.
- The only untrusted input at call time is the tool's *arguments*, which are
  always bound as SQL parameters (`request.input`), never string-interpolated
  — this is what actually prevents injection, independent of the SQL's trust
  level.
- `save-skill`'s transaction+rollback validation is a correctness safety net
  (catches hallucinated table/column names before they become a callable
  tool), not a security boundary — a row inserted manually by the team
  bypasses it entirely, by design.

## Error handling summary

| Situation | Behavior |
|---|---|
| DB unreachable during `tools/list` | Return static tools only, log a warning, no error to the client |
| `generated_prompt` not valid JSON (list) | Skip that row, log a warning |
| `tool_name` collides with a static name (list) | Skip that row, log a warning |
| Unknown tool name (call) | `isError: true`, "Tool not found" |
| Argument fails `ajv` validation (call) | `isError: true`, field-level messages |
| SQL execution fails (call) | `isError: true`, driver error message |
| `save-skill` name collision | `isError: true`, no DB write |
| `save-skill` invalid `generated_prompt` JSON | `isError: true`, no DB write |
| `save-skill` property missing `description` | `isError: true`, names the property, no DB write |
| `save-skill` SQL fails validation (rollback) | `isError: true`, DB error message, no DB write |

## Testing

No automated test suite exists in this project (`"test"` is a placeholder
script). Verification for this feature:

- `tsc --noEmit`, `eslint .`, `bun run build` — must stay clean.
- Manual end-to-end via the JSON-RPC-over-stdio harness already used in this
  project's development (`initialize` → `tools/list` → `tools/call`),
  against a real SQL Server with `tb_mcp_skills` created from
  `scripts/sql/create-tb-mcp-skills.sql` and a seeded example skill row.
- The example skill row and its expected `tools/list`/`tools/call` output
  will be included in `docs/` as a worked example.
