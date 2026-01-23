# Architecture Documentation

Private Communication Platform - System Architecture & Design

---

## Overview

The Private Communication Platform is a zero-knowledge, end-to-end encrypted (E2EE) messaging and voice calling system. The server acts as a blind relay - it never sees plaintext messages or private keys.

```
┌─────────────────────┐                    ┌─────────────────────┐
│     Client A        │                    │     Client B        │
│  (React Native)    │                    │  (React Native)    │
└─────────┬──────────┘                    └─────────┬──────────┘
          │                                        │
          │ 1. Encrypt (Signal Protocol)          │ 1. Encrypt (Signal Protocol)
          │    - Store key in Keystore            │    - Store key in Keystore
          │                                        │
          └──────────────────────┬─────────────────────┘
                                 │
                                 │ 2. Encrypted payload (server sees this)
                                 │
                                 ▼
          ┌─────────────────────────────────────────────────────────────────────┐
          │                     Server (Blind Relay)                     │
          │  FastAPI + PostgreSQL + WebSocket Manager             │
          │                                                               │
          │  ❌ NEVER:                                            │
          │  - Decrypt messages                                          │
          │  - Store plaintext                                           │
          │  - Log user activities                                       │
          │  - Access private keys                                        │
          │                                                               │
          │  ✅ ALWAYS:                                              │
          │  - Treat messages as opaque blobs                           │
          │  - Store encrypted payloads in pending_messages table           │
          │  - 30-day message retention                                   │
          │  - 7-day prekey cleanup                                    │
          └─────────────────────────────────────────────────────────────────────┘
```

---

## Client Architecture

### Technology Stack
- **Framework**: React Native 0.73.0
- **Runtime**: Expo 50 (Development Build, NOT Expo Go)
- **Language**: TypeScript 5.3.3 (strict mode)
- **State Management**: Zustand
- **Secure Storage**: react-native-keychain (Android Keystore)
- **Local Database**: react-native-sqlite-storage
- **Real-time**: WebSocket with exponential backoff reconnection
- **Voice**: WebRTC via react-native-webrtc

### Directory Structure

```
private-comm-client/
├── src/
│   ├── crypto/                          # Cryptographic operations
│   │   ├── SignalProtocol.ts           # Signal Protocol session manager
│   │   ├── KeyManager.ts              # Secure key storage/retrieval
│   │   ├── SignalCryptoBridge.ts       # Interface to native Signal module
│   │   └── cryptoUtils.ts            # Utility crypto functions
│   ├── services/                         # Network communication
│   │   ├── ApiService.ts              # REST API client
│   │   ├── WebSocketService.ts         # Real-time message relay
│   │   └── WebRTCService.ts           # Voice call management
│   ├── store/                            # Zustand state
│   │   ├── userStore.ts               # Authentication state
│   │   └── chatStore.ts              # Message history
│   ├── types/                            # TypeScript interfaces
│   │   └── WebSocketMessage.ts        # WebSocket message types
│   ├── utils/                            # Utilities
│   │   ├── Logger.ts                  # Structured logging
│   │   └── permissions.ts            # Android permissions
│   ├── screens/                          # UI screens (TO BE IMPLEMENTED)
│   ├── components/                       # Reusable components (TO BE IMPLEMENTED)
│   └── App.tsx                          # Entry point (TO BE IMPLEMENTED)
├── android/                          # Native Android code (auto-generated)
└── package.json
```

### Security Model

#### Zero-Knowledge Principle
- **Server never sees**:
  - Plaintext messages
  - User private keys
  - Decrypted session data

- **Server only knows**:
  - Encrypted message blobs
  - Public keys (Ed25519)
  - Phone number hashes (SHA-256)
  - WebSocket connection metadata

#### Key Storage
```typescript
// Identity Key - most critical
await Keychain.setGenericPassword(
  'identity_private_key',
  privateKey,
  {
    service: 'privcomm_identity',
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }
);
```

#### Session Persistence
- Signal Protocol sessions stored in SQLite (encrypted at rest)
- Decrypted sessions loaded into memory at startup
- Session data encrypted with AES-256-GCM before SQLite

### WebSocket Connection Flow

```
┌─────────────────────────────────────────────────────┐
│                                             │
│  1. Get JWT Token (POST /auth/token)      │
│     phone_hash + nonce + signature → token      │
│                                             │
│  2. Connect WebSocket (GET /ws?token=...)   │
│     Token expires in 30 minutes                  │
│                                             │
│  3. Receive Pending Messages                  │
│     Server flushes pending_messages on connect │
│                                             │
│  4. Real-time Message Relay                │
│     Send/Receive encrypted_message events         │
│                                             │
│  5. Exponential Backoff Reconnect         │
│     1s, 2s, 4s, 8s, 16s, 30s max │
│                                             │
└─────────────────────────────────────────────────────┘
```

### WebRTC Call Flow

```
Caller                       Receiver
  │                            │
  │ 1. Start Call             │ 1. Handle Incoming Offer
  │    → WebRTCService.startCall()│    → WebRTCService.handleIncomingOffer()
  │                            │
  │ 2. Create Offer            │ 2. Send Answer
  │    → createOffer()            │    → createAnswer()
  │    → setLocalDescription()   │    → setRemoteDescription(offer)
  │                            │
  │ 3. Send Offer (WS)        │ 3. Send Answer (WS)
  │    → send({type: 'call_offer'})│    → send({type: 'call_answer'})
  │                            │
  │ 4. ICE Exchange              │ 4. ICE Exchange
  │    onicecandidate events     │    addIceCandidate() events
  │    → Exchange via WS          │    → Exchange via WS
  │                            │
  │ 5. Connected                │ 5. Connected
  │    onconnectionstatechange   │    → onconnectionstatechange
  │                            │
  │ 6. End Call                 │ 6. End Call
  │    endCall()               │    endCall()
  │    → send({type: 'call_end'})│    → send({type: 'call_end'})
```

### TURN Server Integration

```
Client TURN Credential Request
         ↓
GET /api/v1/turn-credentials
         ↓
{
  urls: ["turn:...", "turns:..."],
  username: "temp-user",
  credential: "temp-pass",
  ttl: 3600
}
         ↓
ICE Servers Configuration
         ↓
[
  {urls: "stun:stun.l.google.com:19302"},
  {urls: "turn:...", username: "...", credential: "..."},
  {urls: "turns:...", username: "...", credential: "..."}
]
```

---

## Server Architecture

### Technology Stack
- **Framework**: FastAPI 0.109.0
- **Python**: 3.11+ (async/await throughout)
- **Database**: PostgreSQL with asyncpg
- **Migrations**: Alembic
- **Rate Limiting**: slowapi (IP-based)
- **Scheduler**: APScheduler (maintenance tasks)
- **Logging**: Structured JSON with correlation IDs

### Directory Structure

```
private-comm-server/
├── app/
│   ├── main.py                      # FastAPI entry point
│   ├── config.py                    # Environment configuration
│   ├── database/
│   │   ├── connection.py            # asyncpg connection pool
│   │   └── schema.sql              # PostgreSQL schema
│   ├── routes/
│   │   ├── auth.py                 # JWT token issuance
│   │   ├── registration.py          # User/key registration
│   │   ├── websocket.py             # WebSocket endpoint
│   │   └── health.py               # Health check
│   ├── internal/
│   │   └── state.py                # Global state (DB pool, WS manager)
│   ├── maintenance.py                 # Scheduled cleanup tasks
│   ├── models/                       # Pydantic models
│   └── utils/
│       └── logging.py               # Structured logging
├── alembic/                        # Database migrations
│   ├── versions/
│   │   └── 001_initial_schema.py
│   └── alembic.ini
├── tests/                          # Tests (TO BE IMPLEMENTED)
├── requirements.txt
├── .env.example
└── docker-compose.yml
```

### Database Schema

```
┌──────────────────────────────────────────────────────────────┐
│                       users                            │
├──────────────────────────────────────────────────────────────┤
│ id (PK)                 UUID                                   │
│ phone_hash (UNIQUE)      VARCHAR(64)                             │
│ identity_key             BYTEA (Ed25519 public)                  │
│ signed_prekey            BYTEA                                  │
│ prekey_signature         BYTEA                                  │
│ created_at              TIMESTAMP                               │
│ last_seen              TIMESTAMP                               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                one_time_prekeys                      │
├──────────────────────────────────────────────────────────────┤
│ id (PK)                 SERIAL                                  │
│ user_id (FK)            UUID → users.id CASCADE DELETE               │
│ key_id                   INTEGER                                  │
│ public_key               BYTEA (32 bytes)                        │
│ used                    BOOLEAN (DEFAULT FALSE)                   │
│ created_at              TIMESTAMP                               │
│ UNIQUE (user_id, key_id)                                       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                pending_messages                    │
├──────────────────────────────────────────────────────────────┤
│ id (PK)                 UUID                                   │
│ recipient_id (FK)       UUID → users.id CASCADE DELETE               │
│ sender_id (FK)         UUID → users.id CASCADE DELETE               │
│ encrypted_payload        BYTEA (opaque blob)                      │
│ timestamp               TIMESTAMP                               │
└──────────────────────────────────────────────────────────────┘

INDEXES:
- idx_pending_messages_recipient
- idx_pending_messages_delivery (recipient, timestamp DESC)
- idx_one_time_prekeys_available (user_id, used) WHERE NOT used
- idx_one_time_prekeys_fresh (user_id, created_at) WHERE NOT used
```

### Request Processing Flow

```
┌─────────────────────────────────────────────────────┐
│  HTTP Request (FastAPI)                │
├─────────────────────────────────────────────────────┤
│  1. Pydantic Validation             │
│  2. Rate Limit Check                  │
│  3. Database Query (Parameterized)      │
│  4. Response JSON                    │
└─────────────────────────────────────────────────────┘

Example: /api/v1/register
  Request → validate phone_hash, Base64 fields
         → check rate limit (10/hour)
         → SELECT id FROM users WHERE phone_hash = $1
         → INSERT/UPDATE users table
         → INSERT/UPDATE one_time_prekeys
         → Return {status: "registered", user_id}
```

### WebSocket Manager

```
┌─────────────────────────────────────────────────────┐
│  ConnectionManager                  │
├─────────────────────────────────────────────────────┤
│  MAX_CONNECTIONS = 10000             │
│  active_connections: Dict[user_id, WS]     │
│  _lock: asyncio.Lock                   │
└─────────────────────────────────────────────────────┘

Methods:
- connect(user_id, ws) → Acquire lock → check capacity → store → accept
- disconnect(user_id) → Acquire lock → delete from dict
- send_to_user(user_id, message) → Get WS → send_json → return success/fail

Threading:
- Thread-safe operations via asyncio.Lock
- Prevents race conditions on connection/disconnect
```

### Maintenance Scheduler

```
┌─────────────────────────────────────────────────────┐
│  APScheduler (AsyncIOScheduler)          │
├─────────────────────────────────────────────────────┤
│  Job 1: Message Cleanup                    │
│  ┌────────────────────────────────────────────┐ │
│  │ Schedule: Daily at 02:00 UTC       │ │
│  │ Action: DELETE FROM pending_messages │ │
│  │ WHERE timestamp < NOW() - 30 days  │ │
│  └────────────────────────────────────────────┘ │
│                                        │
│  Job 2: Prekey Cleanup                  │
│  ┌────────────────────────────────────────────┐ │
│  │ Schedule: Daily at 03:00 UTC       │ │
│  │ Action: DELETE FROM one_time_prekeys│ │
│  │ WHERE used = TRUE AND created_at <   │ │
│  │       NOW() - 7 days               │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Security Architecture

### Authentication Flow (Ed25519 Challenge)

```
┌─────────────────────────────────────────────────────┐
│          Client                              Server
├─────────────────────────────────────────────────────┤
│ 1. Generate nonce (32 bytes)          │  1. Fetch user
│  crypto.getRandomValues()                 │     SELECT id, identity_key
│                                        │     FROM users
│                                        │     WHERE phone_hash = $1
│  2. Sign nonce                        │  2. Verify signature
│  Ed25519.sign(                           │     ed25519.VerifyingKey(pk)
│    privateKey, nonce)                     │     pk.verify(sig, nonce)
│                                        │
│  3. Request token                     │  3. Issue JWT (if valid)
│  POST /auth/token                       │     JWT.encode(sub: user_id)
│  {phone_hash, nonce, signature}            │     exp: NOW() + 30min
└─────────────────────────────────────────────────────┘

Security Guarantees:
- **Proof of ownership**: Only user with Ed25519 private key can generate valid signature
- **No impersonation**: Attacker knowing phone_hash cannot forge signature
- **Short-lived tokens**: JWT expires after 30 minutes
- **Rate limiting**: 10 token requests/minute per IP
```

### X3DH Key Exchange

```
┌─────────────────────────────────────────────────────┐
│              Alice                              Bob
├─────────────────────────────────────────────────────┤
│  Public Keys:                            │  1. Fetch Key Bundle
│  - identity_key (Ed25519)                │     GET /keys/{phone_hash}
│  - signed_prekey                          │     ↓
│  - prekey_signature                       │     {identity_key, signed_prekey,
│  - one_time_prekey                        │      prekey_signature, otpk}
│  (if available)                            │
│                                        │  2. Create Session
│  X3DH protocol uses:                      │     SignalProtocol.createSession(
│  - Identity Key                             │       aliceIdentityPriv,
│  - Signed PreKey                            │       bobIdentityPub,
│  - One-Time PreKey (optional)             │       bobSignedPreKey,
│  - PreKey Signature                        │       bobPreKeySig,
│                                        │       bobOtpk)
└─────────────────────────────────────────────────────┘

Result: Shared secret derived from DH exchange, encrypted messages can flow both directions.
```

---

## Deployment Architecture

### Development Environment

```
┌─────────────────────────────────────────────────────┐
│  Local Development Machine              │
├─────────────────────────────────────────────────────┤
│  Client:                                    │
│  - Expo Development Build (USB/ADB)          │
│  - API: http://localhost:8000                │
│  - WS: ws://localhost:8000/ws                │
│  - TURN: http://turn.local:3478              │
│                                        │
│  Server:                                    │
│  - uvicorn --reload                        │
│  - PostgreSQL: Docker Compose                 │
│  - CORS: localhost:19006                     │
└─────────────────────────────────────────────────────┘
```

### Production Environment

```
┌─────────────────────────────────────────────────────┐
│  Cloudflare Tunnel Deployment         │
├─────────────────────────────────────────────────────┤
│  Client:                                    │
│  - NODE_ENV=production                    │
│  - API: https://your-domain.com             │
│  - WS: wss://your-domain.com/ws              │
│  - TURN: wss://turn.your-domain.com:5349  │
│  (Cloudflare Tunnel terminates TLS)          │
│                                        │
│  Server:                                    │
│  - SECURE HTTPS (Cloudflare handles)        │
│  - SECURE WSS (Cloudflare handles)        │
│  - PostgreSQL: Managed or Cloud               │
│  - Rate limiting enabled                   │
│  - Maintenance scheduler running             │
└─────────────────────────────────────────────────────┘
```

---

## Scaling Considerations

### Current Capacity
- **Max WebSocket Connections**: 10,000 (hardcoded in `state.py`)
- **DB Connection Pool**: 5-20 (configurable via env)
- **Message Retention**: 30 days (auto-cleanup)
- **Prekey Retention**: 7 days used keys (auto-cleanup)

### Bottlenecks
- **Single-server architecture**: No horizontal scaling
- **In-memory connection tracking**: Doesn't scale beyond one instance
- **No message queue**: WebSocket sends directly to recipients
- **Pending message query**: All messages loaded at once (no pagination)

### Future Scalability Options
1. **WebSocket Connection Manager**: Use Redis Pub/Sub for multi-server deployments
2. **Message Queue**: Add Kafka/RabbitMQ for message delivery guarantees
3. **Load Balancer**: Multiple FastAPI instances behind Nginx
4. **Read Replicas**: PostgreSQL read replicas for query scaling

---

## Monitoring & Observability

### Logging Architecture
- **Client**: `Logger` class (dev: console, prod: error queue)
- **Server**: Structured JSON logging with `CorrelationLogger`
- **Format**: All logs include `request_id` for tracing

### Key Metrics to Track
- WebSocket connection count
- Message throughput (messages/sec)
- Authentication success/failure rate
- Database connection pool utilization
- Prekey exhaustion rate
- API latency percentiles (p50, p95, p99)
- TURN credential issuance rate

### Health Checks
- `GET /health`: Server health (returns `{"status": "healthy"}`)
- Database connectivity check
- WebSocket connection check
- TURN server availability check

---

## Threat Model & Mitigations

### Threat 1: Server Compromise
**Impact**: Attacker gains access to server
**Mitigation**: Server cannot decrypt messages (zero-knowledge), only stores public keys
**Remaining Risk**: Attacker can inject/modify encrypted blobs

### Threat 2: Interception (MITM)
**Impact**: Attacker intercepts traffic
**Mitigation**: Enforce HTTPS/WSS with valid TLS certificates
**Implementation**: Cloudflare Tunnel + TLS TURN servers

### Threat 3: Replay Attacks
**Impact**: Attacker replays captured messages/tokens
**Mitigation**: JWT short expiration (30 min), nonce per auth request

### Threat 4: Brute Force on Phone Hash
**Impact**: Attacker attempts to impersonate users
**Mitigation**: Rate limiting (10/min auth, 10/hour register), Ed25519 signature requirement

### Threat 5: Key Extraction
**Impact**: Malware extracts private keys from device
**Mitigation**: Keystore with biometry, WHEN_UNLOCKED_THIS_DEVICE_ONLY restriction

---

## Data Flow Diagram: End-to-End Encryption

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Alice's Device                                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│  1. Input: "Hello, Bob!"                                      │
│                                                                 │
│  2. Get Bob's Key Bundle                                        │
│     GET /keys/{bob_phone_hash}                                   │
│     ↓                                                          │
│     {identity_key, signed_prekey, prekey_signature, otpk}             │
│                                                                 │
│  3. Create X3DH Session                                         │
│     SignalProtocol.createSession(                                     │
│       aliceIdentityPriv, bobIdentityPub, bobSignedPreKey,              │
│       bobPreKeySig, bobOtpk)                                     │
│     ↓                                                          │
│     shared_secret (ECDH + key derivation)                             │
│                                                                 │
│  4. Encrypt Message                                             │
│     SignalProtocol.encrypt(session, "Hello, Bob!")                    │
│     ↓                                                          │
│     {type, registrationId, body: ENCRYPTED_BLOB}                    │
│                                                                 │
│  5. Send to Server (POST)                                       │
│     /api/v1/messages OR /ws (encrypted_message)                  │
│     ↓                                                          │
│     Server stores in pending_messages (if Bob offline)                 │
│     OR forwards to Bob's WebSocket (if Bob online)                     │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
                          │
                          ↓ Server (Blind Relay - cannot decrypt)
                          │
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Bob's Device                                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│  6. Receive Encrypted Message                                    │
│     WebSocket message: {type: "encrypted_message", payload, sender}     │
│                                                                 │
│  7. Decrypt Message                                             │
│     SignalProtocol.decrypt(session, ENCRYPTED_BLOB)                    │
│     ↓                                                          │
│     shared_secret (from session) + decrypt                            │
│                                                                 │
│  8. Output: "Hello, Bob!"                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Critical Observation**: Server never sees plaintext "Hello, Bob!" - only opaque encrypted blob.
