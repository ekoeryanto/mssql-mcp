# Client Integration Guide

This guide explains how to connect and configure popular AI assistants to use the `mssql-mcp` server.

The server supports two transport protocols:
1. **Stdio (Local)** - The AI client runs the server on the same machine.
2. **SSE (Remote)** - The AI client connects to the server hosted remotely via an HTTP URL.

---

## 1. Antigravity IDE (Gemini IDE)

Antigravity IDE supports connecting to both local and remote MCP servers. The configuration is typically stored in the workspace directory under `.agents/mcp_config.json`.

### Option A: Remote Server (SSE - Recommended for Cloud/Dokploy)
```json
{
  "mcpServers": {
    "mssql-mcp-remote": {
      "type": "sse",
      "url": "https://mssql-mcp.api.tirtapatriot.net/sse"
    }
  }
}
```

### Option B: Local Server (Stdio)
```json
{
  "mcpServers": {
    "mssql-mcp-local": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/absolute/path/to/mssql-mcp/src/index.ts"]
    }
  }
}
```
*Note: Restart the Antigravity window (`Developer: Reload Window`) after updating the configuration.*

---

## 2. Claude Desktop

Claude Desktop natively supports the Model Context Protocol using the **Stdio** transport. It launches the server as a background process.

**Config Location:**
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Configuration:**
```json
{
  "mcpServers": {
    "mssql-server": {
      "command": "bun",
      "args": [
        "run",
        "/absolute/path/to/mssql-mcp/src/index.ts"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "SQLSERVER_SERVER": "localhost",
        "SQLSERVER_USERNAME": "sa",
        "SQLSERVER_PASSWORD": "YourStrongPassword",
        "SQLSERVER_DATABASE": "master"
      }
    }
  }
}
```
*Note: Claude Desktop currently does not natively support providing an HTTP URL (SSE) directly in its config file. You must use `stdio`, which means the server code must be pulled locally to your machine.*

---

## 3. Cursor / Cline / Roo (VS Code Extensions)

Extensions like Cline (formerly Claude Dev) and Roo Code support standard MCP configurations, which are compatible with Claude Desktop's format.

**Configuration via IDE UI:**
1. Open the MCP Servers tab in your extension.
2. Add a new server.
3. Select the transport type (SSE or Command/Stdio).
   - **For SSE:** Enter your deployed URL (e.g., `https://mssql-mcp.api.tirtapatriot.net/sse`).
   - **For Command:** Enter the command `bun` and args `run /path/to/src/index.ts`. Add your database credentials in the environment variables section.

**Configuration via File (e.g. `cline_mcp_settings.json`):**
```json
{
  "mcpServers": {
    "mssql-mcp": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/mssql-mcp/src/index.ts"],
      "env": {
        "SQLSERVER_SERVER": "localhost",
        "SQLSERVER_USERNAME": "sa",
        "SQLSERVER_PASSWORD": "YourStrongPassword"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

---

## Troubleshooting Connectivity

1. **Permission Prompts:** If your AI client frequently asks for tool permissions (especially when using SSE), ensure that your reverse proxy (like Nginx, Traefik, or Cloudflare) is not dropping idle connections. The server implements a 15-second keep-alive ping to prevent this, but your proxy must support long-lived HTTP requests.
2. **Path Issues (Local):** Always use absolute paths to your `src/index.ts` file in the `args` array when configuring `stdio`.
3. **Environment Variables:** Make sure all required SQL Server environment variables are passed correctly to the AI client's configuration if running locally.
