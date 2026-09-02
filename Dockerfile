# Use the official alpine image for a significantly smaller footprint
FROM oven/bun:1-alpine

# Use non-root user for security
USER bun
WORKDIR /app

# Copy dependency files first to leverage Docker layer caching
COPY --chown=bun:bun package.json bun.lock* ./
RUN bun install --production

# Copy source code
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun tsconfig.json ./

# Environment configuration for SQL Server
ENV SQLSERVER_SERVER=localhost
ENV SQLSERVER_PORT=1433
ENV SQLSERVER_DATABASE=master
ENV SQLSERVER_USERNAME=sa
ENV SQLSERVER_PASSWORD=
ENV LOG_LEVEL=info

# Explicitly configure MCP for HTTP/SSE mode inside Docker
ENV MCP_TRANSPORT=sse
ENV PORT=3000
EXPOSE 3000

# Use bun's native fetch for healthcheck instead of installing curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
