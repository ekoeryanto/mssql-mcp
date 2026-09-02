# Deployment Guide

Comprehensive guide for deploying MCP SQL Server in various environments.

## Table of Contents

1. [Local Development](#local-development)
2. [Docker Deployment](#docker-deployment)
3. [Production Deployment](#production-deployment)
4. [Kubernetes](#kubernetes)
5. [Cloud Platforms](#cloud-platforms)
6. [Monitoring & Maintenance](#monitoring--maintenance)

## Local Development

### Prerequisites

- Bun 1.0+
- Node.js 20+ (alternative)
- SQL Server 2019+ (local or remote)

### Setup Steps

1. **Clone Repository**
```bash
git clone https://github.com/ekoeryanto/mssql-mcp.git
cd mcp-sqlserver
```

2. **Install Dependencies**
```bash
bun install
```

3. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start SQL Server** (if needed)
```bash
# Using SQL Server container
docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=YourStrong@Password" \
  -p 1433:1433 \
  mcr.microsoft.com/mssql/server:2022-latest
```

5. **Build and Run**
```bash
bun run build
bun start
```

### Development Commands

```bash
# Watch mode with hot reload
bun run dev

# Run tests
bun run test

# Lint code
bun run lint

# Format code
bun run format

# Test connection
bun scripts/test-connection.ts
```

---

## Docker Deployment

### Quick Start

Using docker-compose with integrated SQL Server:

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f mcp-server

# Stop services
docker-compose down
```

### Custom Docker Build

#### Build Image
```bash
docker build -t mcp-sqlserver:latest .
```

#### Run Container
```bash
docker run -d \
  --name mcp-sqlserver \
  -e SQLSERVER_SERVER=your-server \
  -e SQLSERVER_PORT=1433 \
  -e SQLSERVER_USERNAME=sa \
  -e SQLSERVER_PASSWORD=YourPassword \
  -e SQLSERVER_DATABASE=master \
  -e LOG_LEVEL=info \
  --stdin \
  --tty \
  mcp-sqlserver:latest
```

### Docker Compose with External SQL Server

```yaml
version: '3.8'

services:
  mcp-server:
    build: .
    environment:
      SQLSERVER_SERVER: external-sqlserver.example.com
      SQLSERVER_PORT: 1433
      SQLSERVER_USERNAME: sa
      SQLSERVER_PASSWORD: ${DB_PASSWORD}
      SQLSERVER_DATABASE: mydb
      LOG_LEVEL: info
    stdin_open: true
    tty: true
    restart: on-failure
```

### Docker Networking

Connect to SQL Server on host machine:

```bash
docker run -d \
  --name mcp-sqlserver \
  --network host \
  -e SQLSERVER_SERVER=localhost \
  mcp-sqlserver:latest
```

### Health Checks

The Dockerfile includes health checks:

```bash
docker ps
# Shows: healthy, unhealthy, etc.
```

---

## Production Deployment

### Security Checklist

- [ ] Use strong SQL Server password
- [ ] Set `SQLSERVER_ENCRYPT=true` for SSL connections
- [ ] Use secrets manager for credentials
- [ ] Enable connection pool limits
- [ ] Set appropriate timeouts
- [ ] Enable logging and monitoring
- [ ] Regularly update dependencies
- [ ] Use read-only replica for queries when possible

### Environment Configuration

```env
# Production .env
SQLSERVER_SERVER=prod-sqlserver.company.com
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=production_db
SQLSERVER_USERNAME=app_user
SQLSERVER_PASSWORD=${SECURE_PASSWORD}
SQLSERVER_ENCRYPT=true
SQLSERVER_TRUST_SERVER_CERTIFICATE=false

# Connection Pool
SQLSERVER_CONNECTION_POOL_MIN=5
SQLSERVER_CONNECTION_POOL_MAX=20
SQLSERVER_REQUEST_TIMEOUT=60000

# Logging
LOG_LEVEL=warn
MCP_SERVER_NAME=mcp-sqlserver-prod
```

### Database Permissions

Create a dedicated SQL Server user with minimal permissions:

```sql
-- Create login
CREATE LOGIN [app_user] WITH PASSWORD = 'StrongPassword123!';

-- Create user in database
CREATE USER [app_user] FOR LOGIN [app_user];

-- Grant specific permissions
GRANT SELECT ON SCHEMA::dbo TO [app_user];
GRANT INSERT ON SCHEMA::dbo TO [app_user];
GRANT UPDATE ON SCHEMA::dbo TO [app_user];
GRANT DELETE ON SCHEMA::dbo TO [app_user];
GRANT EXECUTE ON SCHEMA::dbo TO [app_user];

-- Or for read-only access
GRANT SELECT ON SCHEMA::dbo TO [app_user];
```

### Running as Service

#### Linux (Systemd)

Create `/etc/systemd/system/mcp-sqlserver.service`:

```ini
[Unit]
Description=MCP SQL Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/mcp-sqlserver
EnvironmentFile=/opt/mcp-sqlserver/.env
ExecStart=/usr/bin/node /opt/mcp-sqlserver/dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable mcp-sqlserver
sudo systemctl start mcp-sqlserver
sudo systemctl status mcp-sqlserver
```

#### Windows (Task Scheduler)

Create scheduled task to run at startup:
```powershell
$action = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" `
  -Argument "C:\opt\mcp-sqlserver\dist\index.js"
Register-ScheduledTask -Action $action -TaskName "MCP-SQLServer" -RunLevel Highest
```

---

## Kubernetes

### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-sqlserver
  labels:
    app: mcp-sqlserver
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mcp-sqlserver
  template:
    metadata:
      labels:
        app: mcp-sqlserver
    spec:
      containers:
      - name: mcp-sqlserver
        image: mcp-sqlserver:latest
        imagePullPolicy: Always
        stdin: true
        tty: true
        env:
        - name: SQLSERVER_SERVER
          value: "sqlserver.default.svc.cluster.local"
        - name: SQLSERVER_PORT
          value: "1433"
        - name: SQLSERVER_DATABASE
          value: "master"
        - name: SQLSERVER_USERNAME
          valueFrom:
            secretKeyRef:
              name: sqlserver-credentials
              key: username
        - name: SQLSERVER_PASSWORD
          valueFrom:
            secretKeyRef:
              name: sqlserver-credentials
              key: password
        - name: LOG_LEVEL
          value: "info"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - ps aux | grep "node dist/index.js" | grep -v grep
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - ps aux | grep "node dist/index.js" | grep -v grep
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Create Secret

```bash
kubectl create secret generic sqlserver-credentials \
  --from-literal=username=sa \
  --from-literal=password=YourPassword
```

### Deploy

```bash
kubectl apply -f deployment.yaml
kubectl get pods
kubectl logs -f deployment/mcp-sqlserver
```

---

## Cloud Platforms

### Azure Container Instances

```bash
az container create \
  --resource-group myResourceGroup \
  --name mcp-sqlserver \
  --image mcp-sqlserver:latest \
  --environment-variables \
    SQLSERVER_SERVER=myserver.database.windows.net \
    SQLSERVER_USERNAME=sqladmin \
    SQLSERVER_PASSWORD=$DB_PASSWORD \
  --cpu 1 --memory 1
```

### AWS ECS

Create task definition (task-definition.json):

```json
{
  "family": "mcp-sqlserver",
  "containerDefinitions": [
    {
      "name": "mcp-sqlserver",
      "image": "YOUR_ECR_URI:latest",
      "memory": 512,
      "essential": true,
      "environment": [
        {"name": "SQLSERVER_SERVER", "value": "your-rds-endpoint"},
        {"name": "SQLSERVER_USERNAME", "value": "admin"}
      ],
      "secrets": [
        {"name": "SQLSERVER_PASSWORD", "valueFrom": "arn:aws:secretsmanager:..."}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/mcp-sqlserver",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

Register and run:
```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
aws ecs run-task --cluster my-cluster --task-definition mcp-sqlserver
```

### Google Cloud Run

```bash
gcloud run deploy mcp-sqlserver \
  --source . \
  --platform managed \
  --region us-central1 \
  --set-env-vars SQLSERVER_SERVER=10.0.0.2,SQLSERVER_USERNAME=sa \
  --set-env-vars SQLSERVER_PASSWORD=$DB_PASSWORD
```

---

## Monitoring & Maintenance

### Health Monitoring

Check connection status:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"name": "get-status", "arguments": {}}' \
  http://localhost:3000/tool
```

### Logging

View logs based on level:
```bash
# Docker
docker-compose logs -f mcp-server

# Kubernetes
kubectl logs -f deployment/mcp-sqlserver

# Systemd
journalctl -u mcp-sqlserver -f
```

### Performance Monitoring

Track connection pool usage:
```sql
SELECT * FROM sys.dm_exec_connections
SELECT * FROM sys.dm_exec_sessions
```

### Backup Strategy

Backup SQL Server database:
```bash
docker exec mcp-sqlserver-db /opt/mssql-tools/bin/sqlcmd \
  -S localhost -U sa -P Password \
  -Q "BACKUP DATABASE [mydb] TO DISK = N'/var/opt/mssql/backup/mydb.bak'"
```

### Updates and Patching

Update Node.js dependencies:
```bash
bun update
bun run build
docker-compose up -d --build
```

### Scaling

Increase connection pool for high load:
```env
SQLSERVER_CONNECTION_POOL_MIN=10
SQLSERVER_CONNECTION_POOL_MAX=50
```

### Troubleshooting

#### Connection Issues
```bash
# Test connection from container
docker exec mcp-sqlserver bun scripts/test-connection.ts

# Check SQL Server is running
docker ps | grep sqlserver
```

#### Performance Issues
1. Check pool status: `get-status` tool
2. Review query performance: SQL Server Management Studio
3. Increase timeout: `SQLSERVER_REQUEST_TIMEOUT=60000`
4. Increase pool size: `SQLSERVER_CONNECTION_POOL_MAX=20`

#### Debug Logging
```env
LOG_LEVEL=debug
```

---

## Upgrade Guide

### Version Updates

```bash
# Pull latest
git pull origin main

# Install dependencies
bun install

# Build
bun run build

# Restart service
systemctl restart mcp-sqlserver
# or
docker-compose up -d --build
```

### Breaking Changes

Check CHANGELOG.md before upgrading.

---

## Backup & Recovery

### Database Backups

```sql
-- Full backup
BACKUP DATABASE [mydb] TO DISK = N'/backup/mydb.bak';

-- Differential backup
BACKUP DATABASE [mydb] TO DISK = N'/backup/mydb_diff.bak' WITH DIFFERENTIAL;

-- Transaction log backup
BACKUP LOG [mydb] TO DISK = N'/backup/mydb_log.bak';
```

### Configuration Backup

```bash
# Backup .env file
cp .env .env.backup
```

---

## Disaster Recovery

### Recovery Procedures

1. **Restore Database**
   ```sql
   RESTORE DATABASE [mydb] FROM DISK = N'/backup/mydb.bak';
   ```

2. **Reconfigure Server**
   ```bash
   cp .env.backup .env
   bun run build
   systemctl restart mcp-sqlserver
   ```

3. **Verify Connection**
   ```bash
   bun scripts/test-connection.ts
   ```

---

## Cost Optimization

- Use connection pooling to reduce connections
- Set appropriate timeouts to free resources
- Monitor and clean up unused databases
- Use SQL Server Express for development/testing
- Archive old data to reduce database size

---

## Support & Documentation

- GitHub Issues: Report bugs
- Discussions: Ask questions
- Wiki: Community contributions
- Documentation: See docs/ directory
