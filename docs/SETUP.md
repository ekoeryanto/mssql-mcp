# Setup & Installation Guide

Complete step-by-step guide to set up and run MCP SQL Server locally or with Docker.

## Prerequisites

### Required
- **Bun 1.0+** (recommended) OR **Node.js 20+**
- **SQL Server 2019+** (local, remote, or Docker)

### Optional
- Docker & Docker Compose (for containerized setup)
- SQL Server Management Studio (for database management)

## Local Setup (Bun)

### Step 1: Clone & Navigate

```bash
git clone https://github.com/ekoeryanto/mssql-mcp.git
cd mssql-mcp
```

### Step 2: Install Dependencies

Using Bun (recommended):
```bash
bun install
```

Using npm:
```bash
npm install
```

### Step 3: Configure Environment

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your SQL Server details:
```env
SQLSERVER_SERVER=localhost          # SQL Server hostname/IP
SQLSERVER_PORT=1433                # SQL Server port
SQLSERVER_DATABASE=master           # Default database
SQLSERVER_USERNAME=sa               # Username
SQLSERVER_PASSWORD=YourPassword     # Password

# Optional: Connection pool settings
SQLSERVER_CONNECTION_POOL_MIN=2
SQLSERVER_CONNECTION_POOL_MAX=10
SQLSERVER_REQUEST_TIMEOUT=30000

# Logging
LOG_LEVEL=info                      # debug, info, warn, error
```

### Step 4: Verify SQL Server Connection

Before building, test your connection:

```bash
bun scripts/test-connection.ts
```

Expected output:
```
Testing SQL Server connection...
Connecting...
✓ Connected successfully
✓ Query executed successfully
✓ Databases retrieved
✓ Connection pool status
✓ Disconnected successfully

✅ All tests passed!
```

### Step 5: Build Project

```bash
bun run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Step 6: Start Server

**Development mode (with hot reload):**
```bash
bun run dev
```

**Production mode:**
```bash
bun start
```

Server should output:
```
[ISO_TIMESTAMP] [mssql-mcp] INFO: Starting MCP SQL Server
[ISO_TIMESTAMP] [mssql-mcp] INFO: MCP server started successfully
```

## Local Setup (npm/Node.js)

### Step 1-3: Same as Bun setup

```bash
git clone https://github.com/ekoeryanto/mssql-mcp.git
cd mssql-mcp
npm install
cp .env.example .env
# Edit .env
```

### Step 4: Test Connection

```bash
npx ts-node scripts/test-connection.ts
```

### Step 5: Build & Start

```bash
npm run build
npm start
```

## Docker Setup

### Quick Start (Includes SQL Server)

```bash
docker-compose up -d
```

This starts:
- **SQL Server** on `localhost:1433`
- **MCP Server** on stdio transport

### Check Status

```bash
# View running containers
docker-compose ps

# View server logs
docker-compose logs -f mcp-server

# View SQL Server logs
docker-compose logs -f sqlserver
```

### Stop Services

```bash
docker-compose down
```

### Using External SQL Server

If you have SQL Server running elsewhere, edit `docker-compose.yml`:

```yaml
mcp-server:
  environment:
    SQLSERVER_SERVER: your-external-server.com
    SQLSERVER_PORT: 1433
    SQLSERVER_USERNAME: sa
    SQLSERVER_PASSWORD: ${DB_PASSWORD}
```

Then start only MCP server:
```bash
docker-compose up -d mcp-server
```

## Verify Installation

### Test 1: Connection Status

```bash
# Check if server responds
# (The server runs on stdio, so test differently based on integration)
```

### Test 2: Run Example

For development, test with the example client:

```bash
bun examples/client.ts
```

Expected output shows all 5 tools executing successfully.

### Test 3: Manual Query

After starting the server, you can call tools. Here's what a query looks like:

```json
{
  "name": "query",
  "arguments": {
    "query": "SELECT GETDATE() as current_time"
  }
}
```

## Troubleshooting Setup

### "Cannot find module '@modelcontextprotocol/sdk'"

```bash
# Clear and reinstall dependencies
rm -rf node_modules
bun install  # or npm install
```

### "Failed to connect to SQL Server"

1. Verify SQL Server is running
2. Check connection details in `.env`
3. Test connection directly:
   ```bash
   bun scripts/test-connection.ts
   ```

### "Port 1433 already in use"

If using Docker and port 1433 is taken:

```bash
# Edit docker-compose.yml
ports:
  - "1434:1433"  # Use 1434 externally

# Or kill the process
lsof -i :1433
kill -9 <PID>
```

### "Permission denied" on Docker

Make sure Docker daemon is running:

```bash
sudo systemctl start docker  # Linux
# or open Docker Desktop (Mac/Windows)
```

### "Build failed"

1. Check Node.js/Bun version:
   ```bash
   node --version  # Should be 20+
   bun --version   # Should be 1.0+
   ```

2. Check TypeScript compilation:
   ```bash
   bun run build
   ```

3. Check for syntax errors:
   ```bash
   bun run lint
   ```

## Environment Variables Explained

### SQL Server Connection

| Variable | Default | Description |
|----------|---------|-------------|
| `SQLSERVER_SERVER` | localhost | Server hostname/IP |
| `SQLSERVER_PORT` | 1433 | SQL Server port |
| `SQLSERVER_DATABASE` | master | Default database |
| `SQLSERVER_USERNAME` | *(required)* | Login username |
| `SQLSERVER_PASSWORD` | *(required)* | Login password |

### Connection Options

| Variable | Default | Description |
|----------|---------|-------------|
| `SQLSERVER_ENCRYPT` | false | Use SSL encryption |
| `SQLSERVER_TRUST_SERVER_CERTIFICATE` | true | Trust self-signed certs |

### Connection Pool

| Variable | Default | Description |
|----------|---------|-------------|
| `SQLSERVER_CONNECTION_POOL_MIN` | 2 | Min pool size |
| `SQLSERVER_CONNECTION_POOL_MAX` | 10 | Max pool size |
| `SQLSERVER_REQUEST_TIMEOUT` | 30000 | Query timeout (ms) |

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_SERVER_NAME` | mssql-mcp | Server identifier |
| `LOG_LEVEL` | info | Logging level |

## Development Workflow

### Local Development

```bash
# Terminal 1: Start SQL Server (Docker)
docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=YourPassword" \
  -p 1433:1433 \
  mcr.microsoft.com/mssql/server:2022-latest

# Terminal 2: Start MCP Server (watch mode)
cp .env.example .env
# Edit .env with connection details
bun run dev

# Terminal 3: Test in another session
bun scripts/test-connection.ts
```

### Code Changes

When developing:

```bash
# Format code
bun run format

# Check for issues
bun run lint

# Build for testing
bun run build

# Start fresh
bun run dev
```

## Production Deployment

For production deployment, see:
- **docs/DEPLOYMENT.md** - Complete deployment guides
- **docs/TROUBLESHOOTING.md** - Troubleshooting guide

## Next Steps

1. **Read Documentation**
   - See [README.md](../README.md) for overview
   - See [docs/API.md](API.md) for tool reference
   - See [examples/basic-usage.md](../examples/basic-usage.md) for examples

2. **Test the Server**
   ```bash
   bun scripts/test-connection.ts
   bun examples/client.ts
   ```

3. **Deploy**
   - Local: `bun start`
   - Docker: `docker-compose up -d`
   - See [docs/DEPLOYMENT.md](DEPLOYMENT.md) for more options

## Getting Help

- **Connection Issues**: See [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **API Questions**: See [docs/API.md](API.md)
- **Deployment**: See [docs/DEPLOYMENT.md](DEPLOYMENT.md)
- **Examples**: See [examples/basic-usage.md](../examples/basic-usage.md)

---

**Now you're ready to use MCP SQL Server!** 🚀
