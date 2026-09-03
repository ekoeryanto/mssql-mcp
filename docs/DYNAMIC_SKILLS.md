# Dynamic Skills

Beyond the 6 built-in SQL tools, this server can expose additional tools
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
  as SQL parameters, never string-interpolated. The real trust boundary is
  "who can write to `tb_mcp_skills`" — that includes anyone who can call
  `save-skill`, not just people with direct DB access. On a server running
  with the default `SQLSERVER_ALLOW_MUTATIONS=false` (read-only `query`/
  `execute-statement`/`execute-procedure`), a client that can reach
  `save-skill` can still define and immediately call a skill whose
  `generated_sql` mutates data — that gate simply doesn't apply here.
  Restrict who/what can call `save-skill` (and who has write access to
  `tb_mcp_skills`) the same way you would restrict mutation access itself.
- `save-skill`'s dry-run validation runs the candidate SQL inside a
  transaction that's always rolled back, but rollback only undoes
  transactional side effects — it does not reclaim consumed IDENTITY
  values or undo non-transactional operations (e.g. `xp_cmdshell`). Treat
  the dry-run as "does this SQL run," not as a sandbox.
- Deactivating a skill (`UPDATE tb_mcp_skills SET is_active = 0 WHERE
  tool_name = ...`) is manual DB administration — there's no tool for it.
