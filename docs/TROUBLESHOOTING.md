# Troubleshooting Guide

Solutions to common issues and problems.

## Connection Issues

### "Failed to connect to SQL Server"

**Cause**: Server unreachable or credentials wrong

**Solutions**:
1. Verify SQL Server is running
   ```bash
   ping your-server
   telnet your-server 1433
   ```

2. Check credentials
   ```bash
   env | grep SQLSERVER
   ```

3. Test with SQL Server Management Studio first

4. Enable debug logging
   ```env
   LOG_LEVEL=debug
   ```

### "Connection timeout"

**Cause**: Server too slow or network issues

**Solutions**:
1. Increase request timeout
   ```env
   SQLSERVER_REQUEST_TIMEOUT=60000  # 60 seconds
   ```

2. Check network connectivity
3. Check SQL Server performance
4. Review SQL Server error log

### "Cannot authenticate"

**Cause**: Wrong username/password or authentication method

**Solutions**:
1. Verify credentials with SQL Server Management Studio
2. Ensure SQL Server is using SQL authentication (not Windows only)
3. Check user permissions
4. Verify database exists

### "Connection pool exhausted"

**Cause**: Too many concurrent requests

**Solutions**:
1. Increase pool size
   ```env
   SQLSERVER_CONNECTION_POOL_MAX=20  # Increase from 10
   ```

2. Review connection usage
   ```json
   {
     "name": "get-status",
     "arguments": {}
   }
   ```

3. Close unused connections
4. Increase server capacity

## Query Issues

### "Syntax error in query"

**Cause**: Invalid SQL syntax

**Solutions**:
1. Test query in SQL Server Management Studio
2. Check for typos in column/table names
3. Ensure proper SQL syntax
4. Validate with SQL formatter

### "Query timeout"

**Cause**: Long-running query

**Solutions**:
1. Increase timeout
   ```env
   SQLSERVER_REQUEST_TIMEOUT=120000  # 120 seconds
   ```

2. Optimize query (add indexes, limits)
3. Use TOP clause to limit results
4. Check SQL Server performance

### "Out of memory error"

**Cause**: Result set too large

**Solutions**:
1. Limit results with TOP
   ```sql
   SELECT TOP 1000 * FROM large_table
   ```

2. Increase server memory
3. Use pagination
4. Filter with WHERE clause

### "Table/Column not found"

**Cause**: Wrong table or column name

**Solutions**:
1. Check table exists
   ```json
   {
     "name": "get-metadata",
     "arguments": {"type": "tables"}
   }
   ```

2. Check column exists
   ```json
   {
     "name": "get-metadata",
     "arguments": {"type": "columns", "filter": "table_name"}
   }
   ```

3. Verify schema access permissions
4. Use proper database name

## Parameter Issues

### "Parameter parsing error"

**Cause**: Invalid parameter format

**Solutions**:
1. Check parameter format
   ```json
   {
     "params": {
       "name": "John",
       "age": 30
     }
   }
   ```

2. Ensure parameter names match SQL
3. Use correct data types
4. Check for special characters

### "Parameter not found"

**Cause**: Missing parameter in params object

**Solutions**:
1. Add missing parameter
2. Check spelling (case-sensitive)
3. Verify parameter is used in SQL
4. Remove unused parameters

## Permission Issues

### "Permission denied"

**Cause**: User lacks required permissions

**Solutions**:
1. Grant table permissions
   ```sql
   GRANT SELECT ON table_name TO [user]
   ```

2. Grant procedure permissions
   ```sql
   GRANT EXECUTE ON procedure_name TO [user]
   ```

3. Check role membership
4. Verify database access

### "Cannot execute procedure"

**Cause**: Procedure doesn't exist or no permission

**Solutions**:
1. Check procedure exists
   ```json
   {
     "name": "get-metadata",
     "arguments": {"type": "procedures"}
   }
   ```

2. Grant EXECUTE permission
3. Verify procedure name/schema
4. Check stored procedure syntax

## Docker Issues

### "Cannot connect to SQL Server container"

**Cause**: Container not running or network issue

**Solutions**:
1. Check containers running
   ```bash
   docker-compose ps
   ```

2. View logs
   ```bash
   docker-compose logs sqlserver
   ```

3. Ensure health check passes
4. Check network connectivity

### "Build failed"

**Cause**: Docker build error

**Solutions**:
1. Check Dockerfile syntax
2. Verify dependencies in package.json
3. Check Docker logs
4. Try building without cache
   ```bash
   docker build --no-cache .
   ```

### "Cannot mount volume"

**Cause**: Volume permissions or path issues

**Solutions**:
1. Check volume paths exist
2. Verify permissions
3. Use absolute paths in docker-compose
4. Check disk space

## Performance Issues

### "Server running slowly"

**Cause**: Various reasons

**Solutions**:
1. Check connection pool status
2. Monitor SQL Server performance
3. Add indexes to tables
4. Review long-running queries
5. Check server resources

### "High CPU usage"

**Cause**: Too many queries or inefficient queries

**Solutions**:
1. Optimize queries
2. Add indexes
3. Limit concurrent connections
4. Use connection pool limits
5. Profile with SQL Server tools

### "High memory usage"

**Cause**: Large result sets or memory leak

**Solutions**:
1. Limit result sets
2. Use pagination
3. Check for memory leaks in logs
4. Increase server memory
5. Close unused connections

## Logging Issues

### "No logs appearing"

**Cause**: Log level too high

**Solutions**:
1. Lower log level
   ```env
   LOG_LEVEL=debug
   ```

2. Redirect output properly
3. Check file permissions
4. Verify logger initialization

### "Too many logs"

**Cause**: Log level too low

**Solutions**:
1. Raise log level
   ```env
   LOG_LEVEL=warn
   ```

2. Filter logs
3. Redirect to file
4. Use log aggregation

## Environment Variable Issues

### "Variable not found"

**Cause**: Missing or misspelled env var

**Solutions**:
1. Create .env file
   ```bash
   cp .env.example .env
   ```

2. Check variable names
3. Verify .env is in root directory
4. Restart application after changes

### "Wrong value used"

**Cause**: Variable not loading properly

**Solutions**:
1. Check .env file syntax
2. Verify no quotes issues
3. Ensure file is readable
4. Check file is not ignored by git

## Type Issues (TypeScript)

### "Type error during build"

**Cause**: TypeScript strict mode validation

**Solutions**:
1. Fix type errors shown
2. Check function signatures
3. Verify parameter types
4. Use type assertions if needed

## Connection String Issues

### "Invalid connection string"

**Cause**: Malformed connection configuration

**Solutions**:
1. Use separate environment variables
2. Verify server format (no protocol prefix)
3. Check port number
4. Validate database name

## Development Issues

### "Module not found"

**Cause**: Missing dependency

**Solutions**:
1. Install dependencies
   ```bash
   bun install
   ```

2. Clear cache
   ```bash
   rm -rf node_modules
   bun install
   ```

3. Check tsconfig paths

### "Build fails"

**Cause**: TypeScript or build configuration issues

**Solutions**:
1. Check TypeScript errors
2. Verify tsconfig.json
3. Check source files
4. Run build with verbose output

## Getting Help

If your issue isn't listed:

1. **Check Documentation**: See docs/ directory
2. **Search Issues**: GitHub Issues may have answer
3. **Enable Debug Logging**: Set LOG_LEVEL=debug
4. **Collect Information**:
   - Error message
   - Configuration (without secrets)
   - Steps to reproduce
   - Environment details
5. **Open Issue**: Provide all information above

---

## Diagnostic Commands

Useful commands for troubleshooting:

```bash
# Test connection
bun scripts/test-connection.ts

# View logs
docker-compose logs -f

# Check SQL Server
docker exec mssql-mcp-db /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P YourPassword -Q "SELECT @@VERSION"

# Check environment
env | grep SQLSERVER

# Check Docker network
docker network inspect mcp-network
```

---

## Still Need Help?

- GitHub Issues: https://github.com/ekoeryanto/mssql-mcp/issues
- Discussions: https://github.com/ekoeryanto/mssql-mcp/discussions
- Documentation: See docs/ directory
