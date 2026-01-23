# Installation Guide

Complete setup instructions for the Private Communication Platform - a secure, end-to-end encrypted messaging and voice communication system.

## Table of Contents

- [System Requirements](#system-requirements)
- [Prerequisites Installation](#prerequisites-installation)
- [Server Setup](#server-setup)
- [Client Setup](#client-setup)
- [TURN Server Setup](#turn-server-setup)
- [Cloudflare Tunnel Setup](#cloudflare-tunnel-setup)
- [Database Initialization](#database-initialization)
- [Running the Platform](#running-the-platform)
- [Troubleshooting](#troubleshooting)

---

## System Requirements

### Minimum Requirements
- **CPU**: 2+ cores
- **RAM**: 4GB minimum (8GB recommended)
- **Storage**: 20GB free space

### Operating Systems
- **Linux**: Ubuntu 20.04+, Debian 11+, CentOS 8+
- **macOS**: 11.0+ (Big Sur)
- **Windows**: 10 or 11 with WSL2 recommended

---

## Prerequisites Installation

### 1. Python 3.11+

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install python3.11 python3.11-venv python3-pip
```

**macOS:**
```bash
brew install python@3.11
```

**Windows:**
Download and install from [python.org](https://www.python.org/downloads/)

**Verify installation:**
```bash
python3.11 --version
```

### 2. Node.js 18+

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

**macOS:**
```bash
brew install node
```

**Windows:**
Download and install from [nodejs.org](https://nodejs.org/)

**Verify installation:**
```bash
node --version
npm --version
```

### 3. Docker & Docker Compose

**Ubuntu/Debian:**
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt install docker-compose-plugin
```

**macOS:**
Download Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/)

**Windows:**
Download Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/)

**Verify installation:**
```bash
docker --version
docker compose version
```

### 4. Git

**Ubuntu/Debian:**
```bash
sudo apt install git
```

**macOS:**
```bash
brew install git
```

**Windows:**
Download from [git-scm.com](https://git-scm.com/download/win)

### 5. Android Studio (for Client Development)

**Required for:** Building and running the React Native client

1. Download from [developer.android.com/studio](https://developer.android.com/studio)
2. Install with default settings
3. Install Android SDK (API level 33+ recommended)
4. Enable USB debugging on your Android device

---

## Server Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/sarpel/private-communication.git
cd private-communication/private-comm-server
```

### Step 2: Create Virtual Environment

```bash
python3.11 -m venv venv

# Activate virtual environment
# Linux/macOS:
source venv/bin/activate

# Windows:
venv\Scripts\activate
```

### Step 3: Install Python Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

**Key dependencies:**
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `asyncpg` - PostgreSQL async driver
- `alembic` - Database migrations
- `pydantic` - Data validation
- `pydantic-settings` - Settings management

### Step 4: Configure Environment Variables

```bash
# Copy the environment template
cp .env.example .env

# Edit the .env file with your favorite editor
nano .env  # or vim, code, etc.
```

**Required configurations:**

```bash
# Database - REQUIRED
DB_PASSWORD=your-secure-password-here

# Authentication - REQUIRED
SECRET_KEY=generate-with-openssl-rand-32-hex

# TURN Server - REQUIRED for voice calls
TURN_USERNAME=turnuser
TURN_PASSWORD=your-secure-turn-password
TURN_HOST=turn.yourdomain.com
```

**Generate secure secrets:**

```bash
# Generate SECRET_KEY
openssl rand -hex 32

# Generate TURN_PASSWORD
openssl rand -hex 16
```

### Step 5: Verify Configuration

```bash
# Test that config loads correctly
python -c "from app.config import settings; print(f'DB: {settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}')"
```

If this succeeds, your configuration is valid.

---

## Database Setup

### Option A: Using Docker Compose (Recommended)

```bash
# Start PostgreSQL container
docker compose up -d postgres

# Verify database is running
docker compose ps postgres
```

**Docker Compose will:**
- Pull PostgreSQL 15 Alpine image
- Create persistent volume for data
- Initialize database with schema from `app/database/schema.sql`
- Apply environment variables from `.env`

### Option B: Manual PostgreSQL Installation

**Ubuntu/Debian:**
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Create database and user:**
```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE privcomm;
CREATE USER privcomm WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE privcomm TO privcomm;
\q
```

### Run Database Migrations

```bash
# Alembic will create all tables
alembic upgrade head

# Verify tables were created
alembic current
```

---

## Client Setup

### Step 1: Navigate to Client Directory

```bash
cd private-communication/private-comm-client
```

### Step 2: Install Node Dependencies

```bash
npm install
```

**Key dependencies:**
- `expo` - React Native framework
- `react-native-webrtc` - WebRTC implementation
- `@signalapp/libsignal` - Signal Protocol
- `zustand` - State management
- `typescript` - Type safety

### Step 3: Configure Environment Variables

```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env
```

**Example configuration:**

```bash
# Server URL
API_URL=http://localhost:8000

# WebSocket URL
WS_URL=ws://localhost:8000/ws

# TURN Server (must match server configuration)
TURN_SERVER_URL=turn:turn.yourdomain.com:3478
TURN_USERNAME=turnuser
TURN_PASSWORD=your-secure-turn-password
```

### Step 4: Prebuild for Android

**IMPORTANT:** This project is NOT compatible with Expo Go due to native modules (WebRTC, libsignal).

```bash
# Generate native Android code
npx expo prebuild --platform android
```

This will create the `android/` directory with all native code.

### Step 5: Run on Device/Emulator

**Option A: Physical Android Device:**

1. Enable USB debugging:
   - Settings → About Phone → Tap Build Number 7 times
   - Settings → Developer Options → USB Debugging (enable)
2. Connect device via USB
3. Run:

```bash
npx expo run:android
```

**Option B: Android Emulator:**

1. Open Android Studio
2. Device Manager → Create Device (Pixel 6, API 33 recommended)
3. Start emulator
4. Run:

```bash
npx expo run:android
```

**Option C: Development Build with Expo:**

```bash
# Build development .apk
eas build --platform android --profile development
```

---

## TURN Server Setup

The TURN server is required for voice calls to work behind NATs and firewalls.

### Step 1: Install coturn

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install coturn
```

**macOS:**
```bash
brew install coturn
```

### Step 2: Configure TURN Server

```bash
# Edit configuration
sudo nano /etc/turnserver.conf
```

**Minimum configuration:**

```conf
# TURN server listening port
listening-port=3478

# TLS port
tls-listening-port=5349

# Authentication
user=turnuser:your-secure-turn-password

# Use your SSL/TLS certificates
cert=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/yourdomain.com/privkey.pem

# External IP (replace with your server's public IP)
external-ip=203.0.113.1

# Realm
realm=turn.yourdomain.com

# Enable verbose logging for debugging
verbose
```

### Step 3: Obtain SSL Certificates (Let's Encrypt)

```bash
# Install certbot
sudo apt install certbot

# Obtain certificate (replace with your domain)
sudo certbot certonly --standalone -d turn.yourdomain.com

# Certificates will be installed at:
# /etc/letsencrypt/live/turn.yourdomain.com/
```

### Step 4: Start TURN Server

**Ubuntu/Debian (systemd):**
```bash
sudo systemctl start coturn
sudo systemctl enable coturn
sudo systemctl status coturn
```

**Manual start (for testing):**
```bash
sudo turnserver -c /etc/turnserver.conf
```

### Step 5: Test TURN Server

```bash
# Install TURN client utilities
sudo apt install turn-client-utils

# Test TURN server (replace with your credentials)
turnutils_uclient -T -u turnuser -w your-password turn.yourdomain.com
```

**Expected output:**
```
0: IPv4. Local addr: 192.168.1.100:54321
...
0: relay address: 203.0.113.1:54321
...
0: Total connect time is 0.001 seconds
```

### Step 6: Configure Firewall

```bash
# Allow TURN ports
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 5349/udp

# Or with iptables
sudo iptables -A INPUT -p tcp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5349 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 5349 -j ACCEPT
```

---

## Cloudflare Tunnel Setup (Optional)

Use Cloudflare Tunnel to expose your server securely without opening ports.

### Step 1: Install cloudflared

**Linux:**
```bash
# Download cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

**macOS:**
```bash
brew install cloudflared
```

### Step 2: Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This will open a browser where you authorize the tunnel with your Cloudflare account.

### Step 3: Create Tunnel

```bash
# Create a new tunnel
cloudflared tunnel create private-comm

# Note the tunnel ID from the output
# Example: Tunnel ID: 1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p
```

### Step 4: Configure Tunnel

Create or edit `config/cloudflared.yml`:

```yaml
tunnel: 1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p  # Replace with your tunnel ID
credentials-file: /root/.cloudflared/1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:8000
  - hostname: ws.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

### Step 5: Configure DNS

```bash
# Map tunnel to your domain
cloudflared tunnel route dns private-comm api.yourdomain.com
cloudflared tunnel route dns private-comm ws.yourdomain.com
```

### Step 6: Run Tunnel

**Run as service:**
```bash
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

**Run manually (for testing):**
```bash
cloudflared tunnel --config config/cloudflared.yml run private-comm
```

---

## Running the Platform

### Development Mode

**Start everything with Docker Compose:**

```bash
cd private-comm-server

# Start all services (API, PostgreSQL, coturn)
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

**Start API locally with Docker PostgreSQL:**

```bash
# Start only PostgreSQL
docker compose up -d postgres

# Start API locally (with hot reload)
cd private-comm-server
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Start Client:**

```bash
cd private-comm-client

# Run on connected device/emulator
npx expo run:android
```

### Production Mode

**Production considerations:**

1. **Set ENVIRONMENT=production** in `.env`
2. **Use strong, unique passwords** (generate with `openssl rand -hex 32`)
3. **Enable HTTPS** (use reverse proxy like nginx or Cloudflare Tunnel)
4. **Configure TURN server** with valid SSL certificates
5. **Set up monitoring and logging**

**Production deployment with Docker:**

```bash
cd private-comm-server

# Build production images
docker compose -f docker-compose.yml build

# Start services
docker compose -f docker-compose.yml up -d

# Update .env with production values before starting
# ENVIRONMENT=production
# SECRET_KEY=<generated-secure-key>
# DB_PASSWORD=<strong-password>
```

**Production API server (without Docker):**

```bash
# Use gunicorn with uvicorn workers
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
```

---

## Database Initialization

### Initial Setup

```bash
cd private-comm-server

# Activate virtual environment
source venv/bin/activate

# Run all migrations
alembic upgrade head

# Verify current migration
alembic current
```

### Schema Overview

The database includes these tables (defined in `app/database/schema.sql`):

- `users` - User accounts and profile
- `prekeys` - Signal Protocol prekeys
- `signed_prekeys` - Signed prekeys
- `messages` - Encrypted message relay (30-day retention)
- `sessions` - WebRTC call sessions

### Creating Admin User (if needed)

```bash
# Use Python interactive shell
python

from app.database.connection import get_pool
from app.utils.crypto import hash_phone_number

async def create_admin():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO users (phone_hash, created_at)
            VALUES ($1, NOW())
        """, hash_phone_number("+1234567890", "app-secret-salt"))

import asyncio
asyncio.run(create_admin())
```

---

## Verification

### Server Health Check

```bash
# Check if server is running
curl http://localhost:8000/health

# Expected response:
# {"status": "ok", "timestamp": "2024-01-01T00:00:00Z"}
```

### Database Connection

```bash
cd private-comm-server
python -c "
import asyncio
from app.database.connection import get_pool

async def test_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        version = await conn.fetchval('SELECT version()')
        print('Connected to PostgreSQL:', version[:50])

asyncio.run(test_db())
"
```

### TURN Server Test

```bash
turnutils_uclient -T -u turnuser -w your-password turn.yourdomain.com
```

### Client Installation Test

```bash
cd private-comm-client

# Run tests
npm test -- --watchAll=false

# Build app to verify
npx expo run:android
```

---

## Troubleshooting

### Server Issues

**Problem:** `ModuleNotFoundError: No module named 'app'`

**Solution:**
```bash
# Ensure you're in the server directory
cd private-comm-server
source venv/bin/activate
```

**Problem:** `FATAL: password authentication failed for user "privcomm"`

**Solution:**
```bash
# Check .env file has DB_PASSWORD set
cat .env | grep DB_PASSWORD

# Restart PostgreSQL container
docker compose restart postgres
```

**Problem:** `alembic upgrade head` fails with relation already exists

**Solution:**
```bash
# Mark as current version without running SQL
alembic stamp head

# Or drop and recreate database
docker compose down -v
docker compose up -d postgres
alembic upgrade head
```

### Client Issues

**Problem:** `Command 'prebuild' not found`

**Solution:**
```bash
# Install expo-cli globally
npm install -g expo-cli
```

**Problem:** `No devices/emulators found`

**Solution:**
```bash
# Enable USB debugging on Android device
# Or start Android emulator from Android Studio

# List connected devices
adb devices
```

**Problem:** `Error: react-native-webrtc is not compatible with Expo Go`

**Solution:**
- You MUST use `npx expo run:android` (Development Build)
- Expo Go is NOT supported due to native modules

### TURN Server Issues

**Problem:** `connection refused` when testing TURN

**Solution:**
```bash
# Check if coturn is running
sudo systemctl status coturn

# Check if ports are open
sudo netstat -tlnp | grep 3478

# Check firewall
sudo ufw status
```

**Problem:** `401 Unauthorized` from TURN server

**Solution:**
```bash
# Verify username and password match configuration
grep -r "user=" /etc/turnserver.conf

# Update .env with correct credentials
nano private-comm-server/.env
```

### Docker Issues

**Problem:** `ERROR: for api Cannot start service api:端口已被占用`

**Solution:**
```bash
# Kill process using port 8000
sudo lsof -ti:8000 | xargs kill -9

# Or change port in docker-compose.yml
```

**Problem:** `docker-compose up` fails with network error

**Solution:**
```bash
# Rebuild Docker network
docker network prune
docker compose up -d --build
```

### General Debugging

**Enable verbose logging:**

```bash
# Server logs
docker compose logs -f api

# PostgreSQL logs
docker compose logs -f postgres

# TURN server logs
sudo journalctl -u coturn -f
```

**Check all services:**
```bash
docker compose ps
```

---

## Security Checklist

Before deploying to production, verify:

- [ ] `.env` file is NOT committed to git (check `.gitignore`)
- [ ] Strong passwords are set for `DB_PASSWORD`, `SECRET_KEY`, `TURN_PASSWORD`
- [ ] `ENVIRONMENT` is set to `production`
- [ ] TURN server has valid SSL certificates
- [ ] Database is not accessible from outside (firewall rules)
- [ ] API is behind HTTPS/reverse proxy
- [ ] Private keys are stored in Android Keystore (not AsyncStorage)
- [ ] No plaintext passwords in logs or code
- [ ] Phone numbers are hashed before sending to server

---

## Next Steps

After installation:

1. **Read [README.md](README.md)** - Project overview and architecture
2. **Review [CLAUDE.md](CLAUDE.md)** - Security rules and development guidelines
3. **Set up monitoring** - Use tools like Prometheus, Grafana, or Sentry
4. **Configure backup** - Regular PostgreSQL database backups
5. **Review API documentation** - Visit `http://localhost:8000/docs`

---

## Support

For issues and questions:
- **Documentation**: Check [README.md](README.md) and this guide
- **Issues**: Report bugs on GitHub Issues
- **Security**: Email security@example.com (DO NOT use GitHub issues)

---

## License

This project is licensed under the MIT License - see [LICENSE](../LICENSE) for details.
