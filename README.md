# MCP SQL Server

A flexible and stable Model Context Protocol (MCP) server for Microsoft SQL Server. Supports queries, statements, metadata retrieval, and stored procedures with full Docker support.

## Features

- ✅ **Query Execution**: Execute SELECT queries and retrieve results
- ✅ **Statement Execution**: Execute INSERT, UPDATE, DELETE, and DDL statements
- ✅ **Stored Procedures**: Execute procedures with input/output parameters
- ✅ **Metadata Retrieval**: List databases, tables, columns, and procedures
- ✅ **Connection Pooling**: Efficient connection management with configurable pool
- ✅ **Retry Logic**: Automatic reconnection with exponential backoff
- ✅ **Error Handling**: Comprehensive error handling and logging
- ✅ **Docker Ready**: Includes Dockerfile and docker-compose configuration
- ✅ **Type Safe**: Full TypeScript support with strict type checking
- ✅ **Production Ready**: Suitable for public repositories and enterprise use

## Installation

### Prerequisites

- Node.js 20+ or Bun 1.0+
- SQL Server 2019+ (local or remote)
- Docker & Docker Compose (for containerized setup)

### Local Setup

1. **Clone the repository**

```bash
git clone https://github.com/ekoeryanto/mssql-mcp.git
cd mssql-mcp
```

2. **Install dependencies using Bun**

```bash
bun install
```

3. **Configure environment variables**

```bash
cp .env.example .env
# Edit .env with your SQL Server details
```

4. **Build the project**

```bash
bun run build
```

5. **Start the server**

```bash
bun start
```

### Docker Setup

The easiest way to get started with Docker Compose:

```bash
# Build and start both SQL Server and MCP server
docker-compose up -d

# View logs
docker-compose logs -f mcp-server

# Stop services
docker-compose down
```

The server listens on `http://localhost:3000/mcp` (Streamable HTTP). Connect a client with, e.g.:
```bash
claude mcp add --transport http mssql-mcp http://localhost:3000/mcp -H "Authorization: Bearer YourSuperSecretToken"
```

## Configuration

Environment variables configuration:

```env
# SQL Server Connection
SQLSERVER_SERVER=localhost
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=master
SQLSERVER_USERNAME=sa
SQLSERVER_PASSWORD=YourStrong@Password

# Connection Options
SQLSERVER_ENCRYPT=false
SQLSERVER_TRUST_SERVER_CERTIFICATE=true

# Dynamic Skills feature (optional, off by default — see docs/DYNAMIC_SKILLS.md)
# SKILLS_ENABLED=false
# SKILLS_TABLE=tb_mcp_skills

# Knowledge Base feature (optional, off by default — see docs/KNOWLEDGE_BASE.md)
# KNOWLEDGE_ENABLED=false
# KNOWLEDGE_TABLE=tb_mcp_knowledge

# Connection Pool
SQLSERVER_CONNECTION_POOL_MIN=2
SQLSERVER_CONNECTION_POOL_MAX=10
SQLSERVER_REQUEST_TIMEOUT=30000

# Server Configuration
MCP_SERVER_NAME=mssql-mcp
LOG_LEVEL=info  # debug, info, warn, error
```

### Development

For development with hot reload:

```bash
bun run dev
```

## Usage

*For detailed instructions on connecting this server to AI tools like Claude Desktop, Antigravity IDE, and Cursor, see our [AI Client Integration Guide](docs/CLIENT_INTEGRATION.md).*

The MCP server provides the following tools:

### 1. Query Tool

Execute SELECT queries and retrieve results:

```json
{
  "name": "query",
  "arguments": {
    "query": "SELECT TOP 10 * FROM your_table WHERE id > 5"
  }
}
```

**Response:**
```json
{
  "success": true,
  "rowCount": 10,
  "columns": ["id", "name", "email"],
  "data": [
    {"id": 6, "name": "John", "email": "john@example.com"},
    ...
  ]
}
```

### 2. Execute Statement Tool

Execute INSERT, UPDATE, DELETE, or DDL statements:

```json
{
  "name": "execute-statement",
  "arguments": {
    "statement": "INSERT INTO users (name, email) VALUES (@name, @email)",
    "params": {
      "name": "John Doe",
      "email": "john@example.com"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "rowsAffected": 1,
  "message": "Statement executed successfully. Rows affected: 1"
}
```

### 3. Get Metadata Tool

Retrieve database schema information:

```json
{
  "name": "get-metadata",
  "arguments": {
    "type": "tables"
  }
}
```

**Types:**
- `databases`: List all databases
- `tables`: List all tables in current database
- `columns`: List columns for a specific table (requires `filter`)
- `procedures`: List all stored procedures

**Example with filter:**
```json
{
  "name": "get-metadata",
  "arguments": {
    "type": "columns",
    "filter": "users"
  }
}
```

### 4. Execute Procedure Tool

Execute stored procedures with parameters:

```json
{
  "name": "execute-procedure",
  "arguments": {
    "name": "sp_GetUserById",
    "params": {
      "userId": {
        "value": 123,
        "output": false
      },
      "userName": {
        "value": null,
        "output": true
      }
    }
  }
}
```

### 5. Get Status Tool

Check server connection status:

```json
{
  "name": "get-status",
  "arguments": {}
}
```

### 6. Save Skill Tool

Define a new reusable SQL "skill" that becomes callable as its own tool. Explore the
schema with `get-metadata` first, then describe the SQL and its input schema:

```json
{
  "name": "save-skill",
  "arguments": {
    "tool_name": "cek-tagihan",
    "description": "Cek status tagihan pelanggan berdasarkan nomor pelanggan",
    "keywords": "tagihan, billing, invoice",
    "generated_prompt": "{\"type\":\"object\",\"properties\":{\"nomor\":{\"type\":\"string\",\"description\":\"Nomor pelanggan\"}},\"required\":[\"nomor\"]}",
    "generated_sql": "SELECT * FROM tb_tagihan WHERE nomor = @nomor"
  }
}
```

See [docs/DYNAMIC_SKILLS.md](docs/DYNAMIC_SKILLS.md) for the full walkthrough,
including how skills can also be inserted directly into `tb_mcp_skills` by hand.

### Dynamic Skills

Beyond these 6 built-in tools, additional tools can be defined at runtime in a
`tb_mcp_skills` database table — either via `save-skill` above, or by inserting
directly into the table. See [docs/DYNAMIC_SKILLS.md](docs/DYNAMIC_SKILLS.md).

> [!IMPORTANT]
> `generated_sql` runs as trusted, already-reviewed SQL — it is **not** gated by
> `SQLSERVER_ALLOW_MUTATIONS`. Only the tool *arguments* a caller supplies are
> untrusted, and those are always bound as SQL parameters. This means anyone who
> can call `save-skill` can define and immediately run a skill that mutates data
> even when `SQLSERVER_ALLOW_MUTATIONS=false`. Restrict access to `save-skill`
> (and to `tb_mcp_skills` itself) accordingly.

### Knowledge Base

Beyond the SQL tools, this server can store and search free-form notes —
table semantics, gotchas, SOP excerpts — via `search-knowledge` and
`save-knowledge`, backed by a `tb_mcp_knowledge` database table — see
[docs/KNOWLEDGE_BASE.md](docs/KNOWLEDGE_BASE.md).

## Architecture

### Project Structure

```
mssql-mcp/
├── src/
│   ├── index.ts              # Main MCP server entry point
│   ├── config/
│   │   └── index.ts          # Configuration loader
│   ├── db/
│   │   └── connection.ts      # SQL Server connection manager
│   ├── logger/
│   │   └── index.ts          # Logger implementation
│   ├── tools/
│   │   └── handlers.ts       # Tool request handlers
│   └── types/
│       └── index.ts          # TypeScript type definitions
├── docker-compose.yml         # Docker Compose configuration
├── Dockerfile                 # Multi-stage Docker build
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── .env.example              # Environment variables template
```

### Connection Management

The connection manager implements:

- **Connection Pooling**: Configurable min/max pool size
- **Automatic Reconnection**: Retry logic with exponential backoff
- **Error Handling**: Graceful error handling and logging
- **Keep-Alive**: Continuous connection monitoring

### Security Considerations

> [!CAUTION]
> **AI Database Access Risk**
> Granting an AI access to your database is highly sensitive. Even though this MCP server supports `INSERT`, `UPDATE`, and `DELETE` commands, it is **STRONGLY RECOMMENDED** to connect using a **Read-Only** database user. 
> 
> AI assistants can sometimes hallucinate or misinterpret requests, which could lead to accidental destructive commands (e.g., dropping tables, deleting or modifying critical data). Using a read-only account provides a fail-safe layer against accidental data loss.

#### Creating a Read-Only User (T-SQL)

Run the following T-SQL script in your SQL Server to create a dedicated read-only user for this MCP server:

```sql
-- 1. Switch to your target database
USE [YourDatabaseName];
GO

-- 2. Create a login (Server level)
CREATE LOGIN [mcp_readonly_user] WITH PASSWORD = 'YourStrongPassword123!';
GO

-- 3. Create a user for the login (Database level)
CREATE USER [mcp_readonly_user] FOR LOGIN [mcp_readonly_user];
GO

-- 4. Grant read-only permissions (db_datareader)
ALTER ROLE [db_datareader] ADD MEMBER [mcp_readonly_user];
GO

-- 5. (Optional) Grant view definition if the AI needs to inspect schemas/tables structure
GRANT VIEW DEFINITION TO [mcp_readonly_user];
GO
```

#### Best Practices

1. **Environment Variables**: Never commit `.env` file with real credentials
2. **Parameter Binding**: Always use parameterized queries to prevent SQL injection
3. **Connection Pooling**: Limits resource consumption
4. **Timeout Settings**: Prevents long-running queries from blocking

## API Reference

### Tool Definitions

Each tool follows the MCP specification with:
- `name`: Unique tool identifier
- `description`: What the tool does
- `inputSchema`: JSON Schema for input validation

### Error Handling

All tools return a consistent error format:

```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

## Development

### Running Tests

```bash
bun run test
```

### Linting

```bash
bun run lint
```

### Building for Production

```bash
bun run build
```

## Deployment

### Docker Compose

For quick deployment with SQL Server:

```bash
docker-compose up -d
```

### Kubernetes

Example Kubernetes deployment coming soon.

### Custom Environment

To use with an existing SQL Server instance:

1. Set environment variables
2. Run `bun start`
3. The server will connect via stdio transport

## Performance Considerations

- **Connection Pool Size**: Adjust based on concurrent usage
- **Query Timeouts**: Configure `SQLSERVER_REQUEST_TIMEOUT` based on query complexity
- **Database Indexes**: Ensure proper indexing for query performance
- **Logging Level**: Use `warn` or `error` in production to reduce overhead

## Troubleshooting

### Connection Failures

Check environment variables:
```bash
env | grep SQLSERVER
```

### Query Timeouts

Increase `SQLSERVER_REQUEST_TIMEOUT`:
```env
SQLSERVER_REQUEST_TIMEOUT=60000  # 60 seconds
```

### Pool Exhaustion

Increase pool size:
```env
SQLSERVER_CONNECTION_POOL_MAX=20
```

### Debug Logging

Set log level to debug:
```env
LOG_LEVEL=debug
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [Create an issue](https://github.com/ekoeryanto/mssql-mcp/issues)
- Discussions: [Start a discussion](https://github.com/ekoeryanto/mssql-mcp/discussions)

## References

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [mssql-js Documentation](https://github.com/tediousjs/node-mssql)
- [SQL Server Documentation](https://learn.microsoft.com/en-us/sql/sql-server)
