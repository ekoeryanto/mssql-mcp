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
