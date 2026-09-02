# Contributing to MCP SQL Server

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Welcome diverse perspectives
- Focus on what is best for the community
- Report inappropriate behavior to maintainers

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include environment details
4. Provide reproduction steps
5. Attach error logs if applicable

### Suggesting Features

1. Use the feature request template
2. Explain the use case
3. Describe the expected behavior
4. Provide implementation ideas if possible

### Submitting Code Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Write or update tests
5. Run linter: `bun run lint`
6. Run formatter: `bun run format`
7. Commit with clear messages
8. Push to your fork
9. Create a pull request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/mssql-mcp.git
cd mssql-mcp

# Install dependencies
bun install

# Start development
bun run dev

# Run tests
bun run test

# Check code quality
bun run lint
```

## Commit Message Guidelines

- Use clear, descriptive titles
- Reference issues: `Fixes #123`
- Keep commits atomic
- Example: `feat: add transaction support (fixes #45)`

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Pull Request Process

1. Update README.md if needed
2. Update API.md for tool changes
3. Update CHANGELOG.md
4. Ensure CI passes
5. Request review from maintainers
6. Address feedback
7. Await merge approval

## Code Style

- Use TypeScript strict mode
- Follow existing patterns
- Use meaningful variable names
- Add JSDoc comments for public APIs
- Max line length: 100 characters

Example:
```typescript
/**
 * Execute a query and return results
 * @param sql - SQL query string
 * @returns Query results
 */
async function executeQuery(sql: string): Promise<QueryResult> {
  // Implementation
}
```

## Testing

- Write tests for new features
- Update tests for bug fixes
- Ensure all tests pass before submitting PR
- Aim for >80% code coverage

```bash
bun run test
```

## Documentation

- Update README.md for user-facing changes
- Update docs/API.md for tool changes
- Update docs/DEPLOYMENT.md for deployment changes
- Include code examples where applicable

## Areas for Contribution

### High Priority
- [ ] Transaction support
- [ ] Performance optimizations
- [ ] Bulk operations
- [ ] Connection pooling improvements

### Medium Priority
- [ ] Additional documentation
- [ ] Example scripts
- [ ] Integration tests
- [ ] Monitoring tools

### Low Priority
- [ ] Code refactoring
- [ ] Testing improvements
- [ ] Documentation improvements

## Questions?

- Open a discussion on GitHub
- Check existing issues
- Review documentation
- Ask in pull request comments

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- GitHub contributors page
- Release notes (if applicable)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Getting Help

- **Documentation**: See docs/ directory
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Examples**: See examples/ directory

---

Thank you for contributing to MCP SQL Server! 🎉
