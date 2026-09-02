# MCP SQL Server - API Reference

Complete API documentation for all available tools.

## Tools

### query

Execute SELECT queries and retrieve results.

**Request:**
```json
{
  "name": "query",
  "arguments": {
    "query": "SELECT * FROM table_name"
  }
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | SQL SELECT query to execute |

**Response:**
```json
{
  "success": true,
  "rowCount": 10,
  "columns": ["column1", "column2"],
  "data": [...]
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether the query executed successfully |
| rowCount | number | Number of rows returned |
| columns | string[] | Column names from the result set |
| data | object[] | Array of result rows |
| error | string | Error message if `success` is false |

**Constraints:**
- Only SELECT queries are allowed
- Query must be a non-empty string
- Results are limited by SQL Server and connection timeout settings

**Error Cases:**
```json
{
  "success": false,
  "error": "Query parameter is required and must be a string"
}
```

---

### execute-statement

Execute INSERT, UPDATE, DELETE, CREATE, ALTER, or DROP statements.

**Request:**
```json
{
  "name": "execute-statement",
  "arguments": {
    "statement": "INSERT INTO users (name, email) VALUES (@name, @email)",
    "params": {
      "name": "John",
      "email": "john@example.com"
    }
  }
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| statement | string | Yes | SQL statement to execute |
| params | object | No | Query parameters for parameterized statements |

**Response:**
```json
{
  "success": true,
  "rowsAffected": 1,
  "message": "Statement executed successfully. Rows affected: 1"
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether the statement executed successfully |
| rowsAffected | number | Number of rows affected by the statement |
| message | string | Success message |
| error | string | Error message if `success` is false |

**Supported Statement Types:**
- INSERT
- UPDATE
- DELETE
- CREATE
- ALTER
- DROP

**Parameters:**
Parameters should be provided as a key-value object:
```json
{
  "params": {
    "name": "value",
    "age": 30,
    "active": true
  }
}
```

In your SQL statement, reference parameters using `@parameterName`:
```sql
INSERT INTO users (name, age, active) 
VALUES (@name, @age, @active)
```

---

### get-metadata

Retrieve database schema information.

**Request:**
```json
{
  "name": "get-metadata",
  "arguments": {
    "type": "tables",
    "filter": "optional_filter"
  }
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | string | Yes | Metadata type: `databases`, `tables`, `columns`, `procedures` |
| filter | string | No | Optional filter (required for `columns` type) |

**Metadata Types:**

#### databases
List all databases.

**Response:**
```json
{
  "success": true,
  "data": {
    "databases": [
      {"name": "master"},
      {"name": "model"},
      {"name": "msdb"}
    ]
  }
}
```

#### tables
List all tables in the current database.

**Response:**
```json
{
  "success": true,
  "data": {
    "tables": [
      {"schema": "dbo", "name": "users", "type": "TABLE"},
      {"schema": "dbo", "name": "posts", "type": "TABLE"}
    ]
  }
}
```

**Filter Example:**
```json
{
  "type": "tables",
  "filter": "user"
}
```
Returns tables matching the filter pattern.

#### columns
List columns for a specific table (filter required).

**Request:**
```json
{
  "type": "columns",
  "filter": "users"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "columns": [
      {
        "name": "id",
        "type": "int",
        "nullable": false,
        "isIdentity": true,
        "isPrimaryKey": true
      },
      {
        "name": "email",
        "type": "nvarchar",
        "nullable": false,
        "maxLength": 100
      }
    ]
  }
}
```

**Column Properties:**
| Property | Type | Description |
|----------|------|-------------|
| name | string | Column name |
| type | string | SQL data type |
| nullable | boolean | Can column contain NULL |
| maxLength | number | Maximum length for string types |
| isIdentity | boolean | Is column an identity column |
| isPrimaryKey | boolean | Is column a primary key |
| defaultValue | string | Default value if any |

#### procedures
List all stored procedures.

**Response:**
```json
{
  "success": true,
  "data": {
    "procedures": [
      {"schema": "dbo", "name": "sp_GetUsers", "type": "PROCEDURE"}
    ]
  }
}
```

---

### execute-procedure

Execute a stored procedure with optional parameters.

**Request:**
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

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Procedure name |
| params | object | No | Procedure parameters |

**Parameter Format:**
```json
{
  "paramName": {
    "value": "parameter_value",
    "output": false
  }
}
```

- `value`: The parameter value
- `output`: Set to `true` for output parameters

**Response:**
```json
{
  "success": true,
  "rowsAffected": 1,
  "outputValues": {
    "userName": "John Doe"
  },
  "data": [...]
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether the procedure executed successfully |
| rowsAffected | number[] | Rows affected by each statement |
| outputValues | object | Output parameter values |
| data | object[] | Result set from procedure |
| error | string | Error message if `success` is false |

**Example with Return Value:**
```json
{
  "success": true,
  "rowsAffected": [0],
  "outputValues": {
    "totalCount": 42
  }
}
```

---

### get-status

Get the current connection status and pool information.

**Request:**
```json
{
  "name": "get-status",
  "arguments": {}
}
```

**Response:**
```json
{
  "connected": true,
  "poolStatus": {
    "connected": true,
    "totalConnections": 5
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| connected | boolean | Whether connected to SQL Server |
| poolStatus | object | Connection pool status |
| poolStatus.connected | boolean | Pool connection status |
| poolStatus.totalConnections | number | Number of active connections |

---

## Error Responses

All tools return errors in a consistent format:

```json
{
  "success": false,
  "error": "Error description"
}
```

### Common Error Cases

#### Connection Errors
```json
{
  "success": false,
  "error": "Failed to connect to SQL Server after 3 attempts: Error message"
}
```

#### Query/Syntax Errors
```json
{
  "success": false,
  "error": "Incorrect syntax near 'keyword'"
}
```

#### Parameter Errors
```json
{
  "success": false,
  "error": "Parameter required: query"
}
```

#### Permission Errors
```json
{
  "success": false,
  "error": "The SELECT permission was denied on object 'table_name'"
}
```

#### Timeout Errors
```json
{
  "success": false,
  "error": "Request timed out"
}
```

---

## Request/Response Format

All requests follow the MCP tool call format:

```json
{
  "name": "tool-name",
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

All responses are returned as text content:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"success\": true, ...}"
    }
  ]
}
```

---

## Performance Guidelines

### Query Optimization
- Use indexed columns in WHERE clauses
- Limit result set with TOP clause
- Use SELECT specific columns, not SELECT *

### Connection Management
- The connection pool automatically manages up to 10 connections
- Configure pool size based on concurrent usage
- Connections are reused across tool calls

### Parameter Binding
- Always use parameterized queries
- Parameters improve security and performance
- Reduces SQL compilation overhead

### Timeout Configuration
- Default timeout: 30 seconds
- Adjust `SQLSERVER_REQUEST_TIMEOUT` for long-running queries
- Set realistic timeouts to prevent resource exhaustion

---

## Type Definitions

TypeScript types are available for all request/response objects:

```typescript
interface QueryResult {
  success: boolean;
  rowCount?: number;
  data?: Record<string, unknown>[];
  columns?: string[];
  error?: string;
}

interface ExecuteResult {
  success: boolean;
  rowsAffected?: number;
  error?: string;
  message?: string;
}

interface MetadataResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

interface ProcedureResult {
  success: boolean;
  rowsAffected?: number[];
  outputValues?: Record<string, unknown>;
  data?: Record<string, unknown>[];
  error?: string;
}
```

---

## Best Practices

1. **Always Use Parameters**: Prevents SQL injection
   ```json
   {
     "statement": "INSERT INTO users (name) VALUES (@name)",
     "params": {"name": "John"}
   }
   ```

2. **Handle Errors**: Check `success` field in all responses

3. **Limit Result Sets**: Use TOP for large tables
   ```sql
   SELECT TOP 100 * FROM large_table
   ```

4. **Validate Input**: Ensure required parameters are provided

5. **Monitor Performance**: Check pool status regularly

6. **Log Important Operations**: Enable debug logging when needed

---

## Migration Guide

### From Direct SQL Server Connection

Replace direct SQL connections with tool calls:

**Before:**
```typescript
const result = await pool.query('SELECT * FROM users');
```

**After:**
```json
{
  "name": "query",
  "arguments": {
    "query": "SELECT * FROM users"
  }
}
```

### From REST APIs

Map REST endpoints to MCP tools:

| REST | MCP Tool |
|------|----------|
| GET /users | query with SELECT |
| POST /users | execute-statement with INSERT |
| PUT /users/:id | execute-statement with UPDATE |
| DELETE /users/:id | execute-statement with DELETE |
| GET /schema | get-metadata |
