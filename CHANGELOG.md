# Changelog

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
