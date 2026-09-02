# Changelog

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
