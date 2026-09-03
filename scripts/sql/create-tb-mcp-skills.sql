-- Creates the tb_mcp_skills table used by the dynamic-skills feature.
-- Run once against the target database before using `save-skill` or
-- inserting skills manually.
--
-- If you want a different table name (or a schema/database-qualified one,
-- e.g. dbo.my_skills or master.dbo.my_skills), rename it below and set the
-- matching SKILLS_TABLE env var so the server queries the same table.

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
