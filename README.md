# Private Communication Platform

A secure, end-to-end encrypted (E2EE) messaging and voice communication platform built with modern technologies.

## ⚠️ Security Notice

This is a security-critical project. **The server must never have access to encryption keys or plaintext messages.**

- **Zero-Knowledge Architecture**: Server acts only as a blind relay
- **Signal Protocol**: Military-grade E2EE for messaging
- **WebRTC**: Secure P2P voice calls with TURN fallback
- **Privacy by Design**: All data handling assumes hostile observers

## Tech Stack

### Server
- **Python 3.11+** with FastAPI
- **PostgreSQL** with asyncpg
- **Alembic** for database migrations
- **Docker Compose** for local development

### Client
- **React Native** with Expo Development Build (NOT Expo Go)
- **TypeScript** for type safety
- **Zustand** for state management
- **Signal Protocol (libsignal)** for E2EE
- **WebRTC** for voice calls

### Infrastructure
- **Cloudflare Tunnel** for server exposure
- **coturn** TURN server for NAT traversal
- **WebSocket** for real-time messaging

## Architecture

```
┌─────────────────┐                    ┌─────────────────┐
│   Client A      │                    │   Client B      │
│  (React Native) │                    │  (React Native) │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │ 1. Encrypt (Signal Protocol)         │
         │    - Store key in Keystore           │
         │                                      │
         └──────────────┬───────────────────────┘
                        │
                        │ 2. Encrypted payload
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│                    Server (Blind Relay)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   FastAPI    │  │  WebSocket  │  │  PostgreSQL  │        │
│  │     API      │  │   Manager   │  │   (30-day    │        │
│  │              │  │              │  │   retention) │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                               │
│  ❌ NEVER:                                                    │
│  - Decrypt messages                                           │
│  - Store plaintext                                            │
│  - Log user activities                                        │
│  - Access private keys                                        │
└───────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Docker & Docker Compose**
- **Android Studio** (for Expo Development Build)

### Server Setup

```bash
cd private-comm-server

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start PostgreSQL
docker-compose up -d postgres

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Server will run at: `http://localhost:8000`

### Client Setup

```bash
cd private-comm-client

# Install dependencies
npm install

# Prebuild for Android (NOT compatible with Expo Go)
npx expo prebuild --platform android

# Run on device/emulator
npx expo run:android
```

### TURN Server Setup

```bash
# Install coturn (Ubuntu/Debian)
sudo apt-get install coturn

# Configure using config/turnserver.conf
# Start service
sudo systemctl start coturn

# Test TURN server
turnutils_uclient -T -u turnuser -w turnpassword turn.yourdomain.com
```

## Development

### Database Migrations

```bash
cd private-comm-server

# Create new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

### Testing

**Server:**
```bash
cd private-comm-server
pytest tests/ -v --cov=app --cov-fail-under=80
```

**Client:**
```bash
cd private-comm-client
npm test -- --coverage --watchAll=false
```

### Code Style

**Server (Python):**
```bash
# Linting
ruff check app/
# Formatting
ruff format app/
```

**Client (TypeScript):**
```bash
# Linting
npx eslint src/
# Formatting
npx prettier --write src/
```

## Security Checklist

Before any commit or deployment, verify:

- [ ] Server cannot decrypt any messages
- [ ] Keys never appear in server logs
- [ ] Phone numbers are hashed before sending to server
- [ ] Private keys stored in Android Keystore, not AsyncStorage
- [ ] No plaintext logs of user data
- [ ] TURN credentials are not hardcoded in client
- [ ] WebSocket rejects invalid tokens
- [ ] All crypto operations use approved algorithms (see SECURITY.md)

## Project Structure

```
private-communication/
├── .gitignore                    # Root gitignore
├── .gitattributes                # File attributes (line endings)
├── .editorconfig                 # Editor configuration
├── LICENSE                       # MIT License
├── README.md                     # This file
├── CLAUDE.md                     # AI agent ruleset
├── CONTRIBUTING.md               # Contribution guidelines
│
├── private-comm-server/          # Python FastAPI backend
│   ├── .gitignore
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Environment config
│   │   ├── database/
│   │   │   ├── connection.py    # asyncpg pool
│   │   │   └── schema.sql       # PostgreSQL schema
│   │   ├── models/              # Pydantic models
│   │   ├── routes/
│   │   │   ├── registration.py  # User/key registration
│   │   │   ├── messages.py      # Message relay
│   │   │   └── websocket.py     # WebSocket handling
│   │   └── utils/               # Helpers (NO crypto)
│   ├── alembic/                 # Database migrations
│   ├── tests/                   # pytest tests
│   ├── requirements.txt
│   ├── docker-compose.yml
│   └── alembic.ini
│
├── private-comm-client/          # React Native frontend
│   ├── .gitignore
│   ├── src/
│   │   ├── crypto/              # ALL crypto code (Signal Protocol)
│   │   │   ├── SignalProtocol.ts
│   │   │   └── KeyManager.ts
│   │   ├── services/
│   │   │   ├── WebSocketService.ts
│   │   │   ├── WebRTCService.ts
│   │   │   └── ApiService.ts
│   │   ├── screens/             # UI screens
│   │   ├── components/          # Reusable components
│   │   ├── store/               # Zustand state
│   │   └── utils/               # Utilities
│   ├── android/                 # Native Android code (auto-generated)
│   ├── app.json
│   ├── eas.json
│   ├── package.json
│   └── tsconfig.json
│
└── config/                       # Infrastructure configs
    ├── cloudflared.yml
    └── turnserver.conf
```

## Cryptographic Standards

| Purpose | Algorithm |
|---------|-----------|
| Key Exchange | X25519 (Curve25519 Diffie-Hellman) |
| Signing | Ed25519 |
| Symmetric Encryption | AES-256-GCM |
| Hashing | SHA-256 / BLAKE2b |
| KDF | HKDF-SHA256 |

**Forbidden:**
- MD5, SHA1 (broken)
- RSA < 2048 bits
- ECB mode
- Custom/homemade crypto

## API Documentation

Once server is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Environment Variables

### Server (`.env`)
```bash
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/privcomm
SECRET_KEY=your-secret-key-here
TURN_SERVER_URL=turn:turn.yourdomain.com:3478
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpassword
```

### Client (`.env`)
```bash
API_URL=http://localhost:8000
WS_URL=ws://localhost:8000/ws
TURN_SERVER_URL=turn:turn.yourdomain.com:3478
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpassword
```

## Deployment

### Server
```bash
# Using Cloudflare Tunnel
cloudflared tunnel --config config/cloudflared.yml run
```

### Client
```bash
# Development build
eas build --platform android --profile development

# Production build
eas build --platform android --profile production
```

## Troubleshooting

### WebSocket Authentication Issues
- Ensure JWT token is sent as first message after connection
- Check token expiry (5 minute validity)
- Verify server validates token correctly

### Expo Go vs Development Build
- **DO NOT use Expo Go** - native modules won't work
- Must use `npx expo run:android` or development build
- Prebuild required for react-native-webrtc and libsignal

### WebRTC NAT Traversal
- Configure TURN as fallback (not just STUN)
- Use both TCP and UDP TURN
- Include `turns://` (TURN over TLS) for strict firewalls
- Test at: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Security

For security vulnerabilities, email: security@example.com (DO NOT use GitHub issues)

## Acknowledgments

- Signal Protocol by Open Whisper Systems
- FastAPI by Sebastián Ramírez
- React Native and Expo by Meta
- WebRTC standards by W3C
