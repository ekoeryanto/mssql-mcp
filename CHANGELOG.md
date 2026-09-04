# Changelog

# [1.4.0](https://github.com/ekoeryanto/mssql-mcp/compare/1.3.0...1.4.0) (2026-09-04)

### Bug Fixes

* enforce non-empty title/content and clearer disabled-tool messages ([054a0a6](https://github.com/ekoeryanto/mssql-mcp/commit/054a0a6483b7f3e97217d0eb1f00c74eb5a64184))

### Features

* add search-knowledge/save-knowledge orchestration ([c4e8d2b](https://github.com/ekoeryanto/mssql-mcp/commit/c4e8d2bdf5b263eb9011a737f491230d7ca9e25f))
* add searchKnowledge/saveKnowledge to SqlServerConnectionManager ([4ac8e41](https://github.com/ekoeryanto/mssql-mcp/commit/4ac8e4132f1b63367b25b37b187be586555b3afd))
* add tb_mcp_knowledge DDL script ([6447e4c](https://github.com/ekoeryanto/mssql-mcp/commit/6447e4ca5d0d3206e896efd43b730478555a6273))
* add types and config for the Knowledge Base feature ([1b8b49d](https://github.com/ekoeryanto/mssql-mcp/commit/1b8b49d7da50d014c469cd90a1ea882c4c4cb474))
* wire search-knowledge/save-knowledge into the MCP server ([f4bee45](https://github.com/ekoeryanto/mssql-mcp/commit/f4bee459c726c2ad2412c91ae3cd86d2ceeed9d0))

# [1.3.0](https://github.com/ekoeryanto/mssql-mcp/compare/1.2.0...1.3.0) (2026-09-03)

### Bug Fixes

* bypass authentication for /message endpoint and log 404 errors with resolved pathnames ([ed9286f](https://github.com/ekoeryanto/mssql-mcp/commit/ed9286f875c5a85b755aefa2c0373db4d7e2da30))
* catch ajv.compile() throw on invalid JSON Schema in dynamic skills ([78f1385](https://github.com/ekoeryanto/mssql-mcp/commit/78f13859ceb67fce667ba0234bed4dff18cf4adb))
* CORS, URL routing, and relative message path ([4588f03](https://github.com/ekoeryanto/mssql-mcp/commit/4588f03cff1487d82af007ec53716a6837a11285))
* lazy DB connection, add Streamable HTTP transport, modernize server ([8deed5f](https://github.com/ekoeryanto/mssql-mcp/commit/8deed5ff54b7abfcc3e8a0c423d207f752f1b936))
* reject $async JSON Schemas in dynamic skills ([2ad7f4d](https://github.com/ekoeryanto/mssql-mcp/commit/2ad7f4d680bd7eff24a3d235de50213a7b149fa6))
* resolve race condition by storing SSEServerTransport session before connecting to prevent 404 errors ([9ee6241](https://github.com/ekoeryanto/mssql-mcp/commit/9ee62417bddd0dd8683ff50479fc2596318e8f25))
* restore argument validation for static tools, tighten skill types/docs ([892f740](https://github.com/ekoeryanto/mssql-mcp/commit/892f740688682193045a3498fe22a23eca9438f0))
* update 401 error response to return JSON instead of plain text ([67af8b9](https://github.com/ekoeryanto/mssql-mcp/commit/67af8b9bb1936319d390996395d4542514580061))

### Features

* add dynamic skill list/call/save orchestration ([fff4827](https://github.com/ekoeryanto/mssql-mcp/commit/fff4827990e2ed38c6893c8684bc0f26e6a3f20d))
* add pure JSON Schema helpers for dynamic skills ([d2096f8](https://github.com/ekoeryanto/mssql-mcp/commit/d2096f83534474d1fd7c2faa737430bb9d015520))
* add skill persistence methods to SqlServerConnectionManager ([6878fa4](https://github.com/ekoeryanto/mssql-mcp/commit/6878fa4e58b88da214f263ffda65d016fef37ad4))
* add SKILLS_ENABLED to disable the dynamic skills feature entirely ([7902471](https://github.com/ekoeryanto/mssql-mcp/commit/7902471fd3a589f02e66b3a1b62c03e76375172b))
* add tb_mcp_skills DDL script ([b5877c6](https://github.com/ekoeryanto/mssql-mcp/commit/b5877c68c0a6b34c55745a622df0f78069b4fd02))
* add test server for SSE transport verification ([2320427](https://github.com/ekoeryanto/mssql-mcp/commit/2320427b9902c1c6cf2efebc9a10614f45398f95))
* add types and ajv dependency for dynamic skills ([5e4924d](https://github.com/ekoeryanto/mssql-mcp/commit/5e4924d4381c2c7854f5b8f3c1e2ba21d850c260))
* implement Bearer and Basic authentication middleware using optional MCP_SERVER_AUTH_TOKEN ([5975364](https://github.com/ekoeryanto/mssql-mcp/commit/5975364ef15a09615cdfd64357c8bd5bc23328c4))
* make the dynamic skills table name configurable via SKILLS_TABLE ([756df8d](https://github.com/ekoeryanto/mssql-mcp/commit/756df8d76d4f4ac26dafae51deb9c89e65134fa6))
* merge static and dynamic tools into low-level Server handlers ([7f4a126](https://github.com/ekoeryanto/mssql-mcp/commit/7f4a1266c26002ea997607db842792cf47633be8))
* surface the get-metadata-then-save-skill workflow to AI clients ([bebebab](https://github.com/ekoeryanto/mssql-mcp/commit/bebebab44361e58a9806510dfd67dd1440d3a58c))

# [1.2.0](https://github.com/ekoeryanto/mssql-mcp/compare/1.1.0...1.2.0) (2026-09-02)

### Features

* add GitHub Actions workflow for automated releases and remove manual release-it configuration ([0e1d336](https://github.com/ekoeryanto/mssql-mcp/commit/0e1d336f09b7bef0232f1086ce08f1ccf89a1338))

# 1.1.0 (2026-09-02)

### Bug Fixes

* delay transport storage until server connection and add agent configuration file ([1b7b1c9](https://github.com/ekoeryanto/mssql-mcp/commit/1b7b1c966de516ebc805cd642a94d7b214785ecd))
* deprecated server usage ([cb58ecf](https://github.com/ekoeryanto/mssql-mcp/commit/cb58ecf43b2b7fb7eacb13771e4622e0cfd1c903))
* docker env ([b6775ff](https://github.com/ekoeryanto/mssql-mcp/commit/b6775ff4291316d851b7212a797c2f08c07f88ff))
* docker run with bun ([e927eda](https://github.com/ekoeryanto/mssql-mcp/commit/e927eda9679bca016f423475c21aa0b415cc1ce2))
* docker run with bun removed dist ([6f9c6ac](https://github.com/ekoeryanto/mssql-mcp/commit/6f9c6acbe7c8dca8af89f415541901c9c610e9a4))
* init error ([ddd1ddb](https://github.com/ekoeryanto/mssql-mcp/commit/ddd1ddb4c1278fae3ea344d9ba4d3ac2339fa795))
* no build bun ([aa532d8](https://github.com/ekoeryanto/mssql-mcp/commit/aa532d899c36bb2a700d5f008cc8ad81ab2f525e))
* stdio err ([5d157ab](https://github.com/ekoeryanto/mssql-mcp/commit/5d157ab0533c3bf538965996acdbfa1ac0818c5c))
* ts build error ([0c62caf](https://github.com/ekoeryanto/mssql-mcp/commit/0c62caf9c82d8e6a9bbbfa62e349ebfeaa0f224d))
* unresolved module ([de11bde](https://github.com/ekoeryanto/mssql-mcp/commit/de11bdea82200c8f2eaefde3dd8b68453db75997))
* use absolute URL for SSE transport and improve session handling logs and error reporting ([b942656](https://github.com/ekoeryanto/mssql-mcp/commit/b9426564a127dcf4203f186075ffe4c068c25dc5))

### Features

* add periodic SSE keep-alive pings and expose a POST /query REST endpoint ([141f08f](https://github.com/ekoeryanto/mssql-mcp/commit/141f08f8f01919cc8c651ff25a8b6914738d5905))
* add SQL mutation protection and support for MCP bundle deployment configurations ([affab42](https://github.com/ekoeryanto/mssql-mcp/commit/affab42aa82de2ea81307d8115891b3313ac1846))
* add SSE response headers to disable buffering and maintain connection persistence ([1fcfa79](https://github.com/ekoeryanto/mssql-mcp/commit/1fcfa7974a60b0c576a96a4185c247ed53a461c2))
* add SSE transport support and improve configuration robustness and logging output ([c0923ff](https://github.com/ekoeryanto/mssql-mcp/commit/c0923ffd9da0591bc2edaed451792d21f9fadc4d))

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-01

### Added

- Initial release of MCP SQL Server
- Support for SELECT query execution
- Support for INSERT, UPDATE, DELETE, and DDL statements
- Database metadata retrieval (databases, tables, columns, procedures)
- Stored procedure execution with input/output parameters
- Connection pooling with configurable pool size
- Automatic reconnection with exponential backoff
- Comprehensive error handling and logging
- Docker and Docker Compose support
- Full TypeScript implementation with strict type checking
- Comprehensive documentation
- Examples and test utilities

### Features

- ✅ Query Execution (`query` tool)
- ✅ Statement Execution (`execute-statement` tool)
- ✅ Metadata Retrieval (`get-metadata` tool)
- ✅ Stored Procedures (`execute-procedure` tool)
- ✅ Status Monitoring (`get-status` tool)
- ✅ Connection Pooling
- ✅ Retry Logic
- ✅ Docker Ready
- ✅ Production Ready

### Documentation

- README with quick start guide
- Complete API reference
- Deployment guide for multiple environments
- Basic usage examples
- Docker setup instructions

## [Unreleased]

### Planned Features

- Transaction support
- Bulk insert optimization
- Query result streaming for large datasets
- Advanced connection pool metrics
- Performance monitoring tools
- Caching layer for metadata
- Batch operation optimization
- Query plan analysis
- Database backup/restore tools

---

## Version Format

- **Major**: Breaking changes
- **Minor**: New features (backward compatible)
- **Patch**: Bug fixes

## Upgrade Path

- 1.0.0 → 1.1.0: New features added
- 1.x → 2.0.0: Breaking changes

## Support

- Current: 1.0.x
- Maintenance: 1.0.x bug fixes only

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create git tag
4. Create GitHub release
5. Push to npm (if applicable)

---

For detailed changes in each version, see the git commit history.
