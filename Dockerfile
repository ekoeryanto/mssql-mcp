# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --production

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript
# RUN bun build ./src/index.ts --outdir ./dist --target node

# Runtime stage
FROM oven/bun:1

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Set default environment variables (akan di-override oleh Dokploy/Docker)
ENV SQLSERVER_SERVER=localhost
ENV SQLSERVER_PORT=1433
ENV SQLSERVER_DATABASE=master
ENV SQLSERVER_USERNAME=sa
ENV SQLSERVER_PASSWORD=
ENV LOG_LEVEL=info

# Run the server with node (bukan bun)
CMD ["bun", "src/index.ts"]
