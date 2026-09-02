# Deploy ke Dokploy

Guide lengkap untuk deploy MCP SQL Server di Dokploy.

## 📋 Prerequisites

- Dokploy instance running
- SQL Server accessible (local network atau cloud)
- Source code atau GitHub repository

## 🚀 Step-by-Step Setup

### Step 1: Create Project di Dokploy

1. Login ke Dokploy dashboard
2. Click **"Create Project"**
3. Pilih template: **Docker**
4. Input project details

### Step 2: Setup Repository

**Option A: GitHub**
- Select **GitHub** as source
- Connect your GitHub account
- Select `mssql-mcp` repository
- Branch: `main` (atau branch pilihan)

**Option B: Git URL**
- Input Git URL: `https://github.com/ekoeryanto/mssql-mcp.git`
- Branch: `main`

### Step 3: Build Configuration

1. **Build Type**: Pilih **Dockerfile**
2. **Dockerfile Path**: `./Dockerfile` (default)
3. **Docker Compose**: NO (kita pakai Dockerfile saja)
4. **Build Command**: Leave empty (default)

### Step 4: Environment Variables

Di Dokploy, click **"Environment Variables"** dan tambahkan:

```
SQLSERVER_SERVER=your-sqlserver-host
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=master
SQLSERVER_USERNAME=sa
SQLSERVER_PASSWORD=your-strong-password
SQLSERVER_ENCRYPT=false
SQLSERVER_TRUST_SERVER_CERTIFICATE=true
SQLSERVER_CONNECTION_POOL_MIN=2
SQLSERVER_CONNECTION_POOL_MAX=10
SQLSERVER_REQUEST_TIMEOUT=30000
LOG_LEVEL=info
MCP_SERVER_NAME=mssql-mcp
```

### Step 5: Port Configuration

1. **Port Mapping**: Tidak perlu (MCP pakai stdio, bukan network port)
2. Atau bisa map ke arbitrary port untuk internal use

### Step 6: Deploy

1. Click **"Deploy"**
2. Wait for build to complete
3. Check logs untuk verifikasi

---

## ✅ Verifikasi Deploy Berhasil

### Check Logs

```bash
# Di Dokploy, buka logs dan cari:
[ISO_TIMESTAMP] [mssql-mcp] INFO: Starting MCP SQL Server
[ISO_TIMESTAMP] [mssql-mcp] INFO: Connected to SQL Server
[ISO_TIMESTAMP] [mssql-mcp] INFO: MCP server started successfully
```

### Test Connection

Jika ada shell access ke container:
```bash
# Enter container
dokploy exec <container-id> bash

# Test connection
node dist/index.js &
# Cek apakah process running without errors
```

---

## 🔧 Troubleshooting

### Error: "Cannot connect to SQL Server"

**Cause**: Connection details salah atau SQL Server tidak accessible

**Fix**:
1. Verifikasi env variables di Dokploy
2. Pastikan `SQLSERVER_SERVER` bisa di-reach dari container
3. Cek firewall rules

```env
# Contoh untuk cloud SQL Server:
SQLSERVER_SERVER=sqlserver.database.windows.net
SQLSERVER_PORT=1433
SQLSERVER_ENCRYPT=true
SQLSERVER_TRUST_SERVER_CERTIFICATE=false
```

### Error: "Missing required environment variable"

**Cause**: Env variable tidak ter-set di Dokploy

**Fix**:
1. Buka Environment Variables di Dokploy
2. Pastikan semua variable sudah ada
3. Redeploy

Required variables:
- `SQLSERVER_SERVER` ✅
- `SQLSERVER_USERNAME` ✅
- `SQLSERVER_PASSWORD` ✅
- `SQLSERVER_DATABASE` ✅

### Build Fails: "Cannot find module"

**Cause**: Dependencies tidak ter-install

**Fix**:
1. Check `package.json` di repository
2. Make sure `bun.lock` di-commit (optional tapi recommended)
3. Rebuild di Dokploy

### Container Keeps Restarting

**Cause**: Application error atau health check fail

**Fix**:
1. Check logs untuk error message
2. Verify env variables
3. Check SQL Server connectivity

---

## 📊 Recommended Configuration

### Development
```env
LOG_LEVEL=debug
SQLSERVER_CONNECTION_POOL_MIN=1
SQLSERVER_CONNECTION_POOL_MAX=5
SQLSERVER_REQUEST_TIMEOUT=30000
```

### Production
```env
LOG_LEVEL=warn
SQLSERVER_CONNECTION_POOL_MIN=2
SQLSERVER_CONNECTION_POOL_MAX=20
SQLSERVER_REQUEST_TIMEOUT=60000
```

### High-Load
```env
LOG_LEVEL=warn
SQLSERVER_CONNECTION_POOL_MIN=5
SQLSERVER_CONNECTION_POOL_MAX=50
SQLSERVER_REQUEST_TIMEOUT=120000
```

---

## 🔐 Security Best Practices

### Environment Variables

✅ **DO**:
- Store sensitive values in Dokploy secrets
- Use strong passwords
- Rotate credentials regularly
- Enable SQL Server encryption in production

❌ **DON'T**:
- Commit `.env` file to git
- Use default passwords
- Hardcode credentials
- Store passwords in logs

### Network Security

- Use private network untuk SQL Server jika possible
- Enable SSL/TLS encryption
- Restrict firewall access
- Use VPN jika SQL Server di public cloud

---

## 🚀 Advanced Setup

### Multi-Instance Deployment

Untuk run multiple instances:

1. Create separate project untuk setiap instance
2. Set different `MCP_SERVER_NAME` di each instance
3. Point ke different databases jika diperlukan

### Auto-Scaling (jika Dokploy support)

Recommend settings:
- Min replicas: 1
- Max replicas: 3
- Scale trigger: CPU usage > 70%

---

## 📝 Useful Commands

### View Running Containers
```bash
docker ps | grep mssql-mcp
```

### Check Container Logs
```bash
docker logs -f <container-id>
```

### Restart Container
```bash
docker restart <container-id>
```

### Enter Container Shell
```bash
docker exec -it <container-id> /bin/bash
```

---

## ✅ Deployment Checklist

- [ ] GitHub/Git repository setup
- [ ] Dockerfile configured correctly
- [ ] All environment variables added
- [ ] SQL Server accessible from container
- [ ] First deployment successful
- [ ] Logs show "MCP server started successfully"
- [ ] Connection test passed
- [ ] Auto-restart configured
- [ ] Monitoring setup (if available)
- [ ] Documentation updated

---

## 📞 Support

- **Logs**: Check Dokploy container logs for errors
- **Docs**: See [DEPLOYMENT.md](DEPLOYMENT.md) for general deployment info
- **Issues**: GitHub Issues for bug reports

---

**Happy deploying!** 🚀
