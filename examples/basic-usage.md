# Basic Usage Examples

## Setup

1. Install dependencies:
```bash
bun install
```

2. Configure your SQL Server connection in `.env`:
```env
SQLSERVER_SERVER=your-server
SQLSERVER_USERNAME=sa
SQLSERVER_PASSWORD=your-password
SQLSERVER_DATABASE=your_database
```

3. Build the project:
```bash
bun run build
```

## Examples

### 1. Query Execution

Get all users from the database:

```json
{
  "tool": "query",
  "input": {
    "query": "SELECT id, name, email FROM users WHERE active = 1"
  }
}
```

Response:
```json
{
  "success": true,
  "rowCount": 5,
  "columns": ["id", "name", "email"],
  "data": [
    {"id": 1, "name": "John", "email": "john@example.com"},
    {"id": 2, "name": "Jane", "email": "jane@example.com"},
    ...
  ]
}
```

### 2. Insert Data

Add a new user:

```json
{
  "tool": "execute-statement",
  "input": {
    "statement": "INSERT INTO users (name, email, created_at) VALUES (@name, @email, GETDATE())",
    "params": {
      "name": "Alice Smith",
      "email": "alice@example.com"
    }
  }
}
```

Response:
```json
{
  "success": true,
  "rowsAffected": 1,
  "message": "Statement executed successfully. Rows affected: 1"
}
```

### 3. Update Data

Update user information:

```json
{
  "tool": "execute-statement",
  "input": {
    "statement": "UPDATE users SET email = @email, updated_at = GETDATE() WHERE id = @userId",
    "params": {
      "userId": 1,
      "email": "newemail@example.com"
    }
  }
}
```

### 4. Delete Data

Remove a user:

```json
{
  "tool": "execute-statement",
  "input": {
    "statement": "DELETE FROM users WHERE id = @userId",
    "params": {
      "userId": 5
    }
  }
}
```

### 5. List Tables

Get all tables in the database:

```json
{
  "tool": "get-metadata",
  "input": {
    "type": "tables"
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "tables": [
      {"schema": "dbo", "name": "users", "type": "TABLE"},
      {"schema": "dbo", "name": "posts", "type": "TABLE"},
      {"schema": "dbo", "name": "comments", "type": "TABLE"}
    ]
  }
}
```

### 6. Get Column Information

View table structure:

```json
{
  "tool": "get-metadata",
  "input": {
    "type": "columns",
    "filter": "users"
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "columns": [
      {
        "name": "id",
        "type": "int",
        "nullable": false,
        "isPrimaryKey": true,
        "isIdentity": true
      },
      {
        "name": "name",
        "type": "nvarchar",
        "nullable": false,
        "maxLength": 100
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

### 7. List Databases

Get all databases:

```json
{
  "tool": "get-metadata",
  "input": {
    "type": "databases"
  }
}
```

### 8. List Stored Procedures

Get all procedures:

```json
{
  "tool": "get-metadata",
  "input": {
    "type": "procedures"
  }
}
```

### 9. Execute Stored Procedure

Call a stored procedure:

```json
{
  "tool": "execute-procedure",
  "input": {
    "name": "sp_GetUserStats",
    "params": {
      "userId": {
        "value": 1,
        "output": false
      },
      "totalPosts": {
        "value": null,
        "output": true
      }
    }
  }
}
```

Response:
```json
{
  "success": true,
  "rowsAffected": [0],
  "outputValues": {
    "totalPosts": 42
  }
}
```

### 10. Check Connection Status

Get server status:

```json
{
  "tool": "get-status",
  "input": {}
}
```

Response:
```json
{
  "connected": true,
  "poolStatus": {
    "connected": true,
    "totalConnections": 5
  }
}
```

## Advanced Examples

### Batch Insert

Insert multiple records efficiently:

```json
{
  "tool": "execute-statement",
  "input": {
    "statement": "INSERT INTO users (name, email) VALUES (@name1, @email1); INSERT INTO users (name, email) VALUES (@name2, @email2)",
    "params": {
      "name1": "User One",
      "email1": "user1@example.com",
      "name2": "User Two",
      "email2": "user2@example.com"
    }
  }
}
```

### Complex Query with Joins

```json
{
  "tool": "query",
  "input": {
    "query": "SELECT u.id, u.name, COUNT(p.id) as post_count FROM users u LEFT JOIN posts p ON u.id = p.user_id GROUP BY u.id, u.name HAVING COUNT(p.id) > 0"
  }
}
```

### Transaction Simulation

Note: Actual transactions would need to be handled differently in production:

```json
{
  "tool": "execute-statement",
  "input": {
    "statement": "BEGIN TRANSACTION; INSERT INTO users (name, email) VALUES (@name, @email); COMMIT"
  }
}
```

## Error Handling

All tools return a consistent error format:

```json
{
  "success": false,
  "error": "Table 'users' not found"
}
```

## Performance Tips

1. **Use Parameterized Queries**: Prevents SQL injection and improves performance
2. **Limit Result Sets**: Use TOP clause for large tables
3. **Index Properly**: Ensure tables have proper indexes
4. **Monitor Connection Pool**: Check pool status for bottlenecks
5. **Batch Operations**: Combine multiple statements when possible

## Security Best Practices

1. ✅ Always use parameters for user input
2. ✅ Use environment variables for credentials
3. ✅ Enable SQL Server authentication
4. ✅ Limit connection pool size
5. ✅ Use timeout settings appropriately
6. ❌ Never hardcode credentials
7. ❌ Never pass raw SQL with user input
8. ❌ Don't log sensitive data
