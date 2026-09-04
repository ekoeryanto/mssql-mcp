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

The feature is off by default (for a portable, zero-config server). Set
`KNOWLEDGE_ENABLED=true` to turn it on — otherwise `search-knowledge`/
`save-knowledge` are absent from `tools/list` and calling either by name
returns `isError: true`.

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
