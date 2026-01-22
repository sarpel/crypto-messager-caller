# Private Communication Platform - AI Agent Ruleset

> **Purpose:** System prompt, rules, and guidelines for AI coding agents working on this E2EE messaging/voice platform.  
> **Usage:** Include this file in every session context or as a system prompt preamble.

---

## 🎯 Direct System Prompt (Copy This)

```
You are implementing a private End-to-End Encrypted (E2EE) communication platform. This is a SECURITY-CRITICAL project.

CORE PRINCIPLES:
1. ZERO-KNOWLEDGE: The server must NEVER have access to encryption keys or plaintext messages
2. SECURITY > FEATURES: Never sacrifice security for convenience
3. PRIVACY BY DEFAULT: All data handling must assume hostile observers

TECH STACK (DO NOT CHANGE):
- Server: Python 3.11+ with FastAPI + asyncpg + PostgreSQL
- Client: React Native with Expo Development Build (NOT Expo Go)
- Crypto: Signal Protocol (libsignal) for messaging
- Voice: WebRTC with coturn TURN server
- Tunnel: Cloudflare Tunnel for server exposure

Before writing ANY code, ask yourself:
- Does the server ever see unencrypted user data? (MUST be NO)
- Could this code leak metadata? (timing, message sizes, patterns)
- Is this the minimal code needed? (reduce attack surface)
```

---

## 🚨 Critical Security Rules

### Rule 1: Server is Blind
```
❌ NEVER DO:
- Store plaintext messages on server
- Log message contents or user activity
- Decrypt anything server-side
- Store private keys anywhere except client device

✅ ALWAYS DO:
- Treat server as untrusted relay
- Encrypt BEFORE sending to server
- Verify encryption client-side only
```

### Rule 2: Key Management
```
❌ NEVER DO:
- Generate keys server-side
- Transmit private keys over network
- Store keys in SharedPreferences/AsyncStorage
- Use hardcoded keys or secrets

✅ ALWAYS DO:
- Generate keys on user device
- Store private keys in Android Keystore (via react-native-keychain)
- Rotate keys per Signal Protocol spec
- Delete one-time prekeys after use
```

### Rule 3: Cryptographic Standards
```
REQUIRED ALGORITHMS:
- Key exchange: X25519 (Curve25519 Diffie-Hellman)
- Signing: Ed25519
- Symmetric encryption: AES-256-GCM
- Hashing: SHA-256 or BLAKE2b
- KDF: HKDF-SHA256

FORBIDDEN:
- MD5, SHA1 (broken)
- RSA < 2048 bits
- ECB mode for any cipher
- Custom/homemade crypto implementations
```

### Rule 4: Data Handling
```
PHONE NUMBERS:
- Always hash before sending to server
- Use: SHA256(phone_number + app_secret_salt)
- Server stores ONLY hashes, never raw numbers

CONTACTS:
- Hash locally before server comparison
- Never upload raw contact list
- Intersection done via hash matching

MESSAGES:
- Max retention on server: 30 days (for offline delivery)
- Delete immediately after successful delivery
- No backup of encrypted blobs
```

---

## 📁 Project Structure Rules

```
private-comm-server/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Environment config (NO secrets in code)
│   ├── database/
│   │   ├── connection.py    # asyncpg pool
│   │   └── schema.sql       # PostgreSQL schema
│   ├── routes/
│   │   ├── registration.py  # User/key registration
│   │   ├── messages.py      # Message relay endpoints
│   │   └── websocket.py     # WebSocket handling
│   ├── models/              # Pydantic models
│   └── utils/               # Helpers (NO crypto here)
├── config/
│   ├── cloudflared.yml
│   └── turnserver.conf
├── tests/
└── docker-compose.yml

private-comm-client/
├── src/
│   ├── crypto/              # ALL crypto code lives here
│   │   ├── SignalProtocol.ts
│   │   └── KeyManager.ts
│   ├── services/
│   │   ├── WebSocketService.ts
│   │   ├── WebRTCService.ts
│   │   └── ApiService.ts
│   ├── screens/
│   ├── components/
│   ├── store/               # Zustand state
│   └── utils/
├── app.json
└── eas.json
```

---

## ⚙️ Code Quality Rules

### TypeScript (Client)
```typescript
// ✅ ALWAYS use strict null checks
const user: User | null = await getUser(id);
if (!user) throw new Error('User not found');

// ✅ ALWAYS type crypto operations
interface EncryptedPayload {
  ciphertext: string;  // Base64
  nonce: string;       // Base64, unique per message
  mac: string;         // Base64, authentication tag
}

// ❌ NEVER use 'any' for crypto data
const encrypted: any = await encrypt(msg); // FORBIDDEN

// ✅ ALWAYS handle errors in crypto
try {
  const plaintext = await decrypt(message);
} catch (error) {
  // Log error type only, NEVER log ciphertext/keys
  console.error('Decryption failed:', error.name);
  throw new DecryptionError('Message could not be decrypted');
}
```

### Python (Server)
```python
# ✅ ALWAYS use type hints
async def relay_message(
    sender_id: UUID,
    recipient_id: UUID,
    encrypted_payload: bytes  # Server doesn't know contents
) -> bool:
    ...

# ✅ ALWAYS use parameterized queries (prevent SQL injection)
await conn.execute(
    "INSERT INTO messages (recipient_id, payload) VALUES ($1, $2)",
    recipient_id, encrypted_payload
)

# ❌ NEVER use string formatting in SQL
query = f"SELECT * FROM users WHERE id = '{user_id}'"  # FORBIDDEN

# ✅ ALWAYS log safely
logger.info(f"Message relayed to user {recipient_id[:8]}...")  # Truncate IDs
# ❌ NEVER log this:
logger.info(f"Payload: {encrypted_payload}")  # FORBIDDEN
```

---

## 🔧 Common Pitfalls & Solutions

### Pitfall 1: WebSocket Authentication
```
PROBLEM: WebSocket connections need authentication but can't use headers easily

SOLUTION:
1. Initial HTTP request gets short-lived token (JWT, 5min expiry)
2. Token sent as first WebSocket message after connect
3. Server validates, then upgrades connection state
4. Re-authenticate if connection drops and reconnects
```

### Pitfall 2: Expo Native Modules
```
PROBLEM: react-native-webrtc and libsignal need native code

SOLUTION:
1. MUST use Expo Development Build, NOT Expo Go
2. Run: npx expo prebuild --platform android
3. Build with: eas build --platform android --profile development
4. Install native deps BEFORE prebuild
```

### Pitfall 3: WebRTC NAT Traversal
```
PROBLEM: Calls fail behind restrictive NATs (university, corporate)

SOLUTION:
1. Always configure TURN as fallback (not just STUN)
2. Use BOTH TCP and UDP TURN
3. Include turns:// (TURN over TLS) for strict firewalls
4. Test with: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
```

### Pitfall 4: Message Ordering
```
PROBLEM: WebSocket messages can arrive out of order

SOLUTION:
1. Include monotonic counter in each message
2. Client buffers and reorders if needed
3. For Signal Protocol: use session message counter (built-in)
```

### Pitfall 5: Key Exhaustion
```
PROBLEM: Running out of one-time prekeys

SOLUTION:
1. Client monitors remaining prekey count
2. When < 20 remaining, generate and upload 100 more
3. Server returns remaining count in key bundle response
4. Background task checks weekly
```

---

## 🧪 Testing Requirements

### Before Any Commit
```bash
# Server
pytest tests/ -v --cov=app --cov-fail-under=80

# Client
npm test -- --coverage --watchAll=false
```

### Security Tests (Required)
```
□ Verify server cannot decrypt test message
□ Verify keys never appear in server logs
□ Verify phone numbers are hashed before API calls
□ Verify private keys are in Keystore, not AsyncStorage
□ Verify WebSocket rejects invalid tokens
□ Verify TURN credentials aren't hardcoded in client
```

### Integration Tests
```
□ Registration flow: new user → keys stored → keys retrievable
□ Message flow: A→B with B offline → B comes online → B receives
□ Call flow: offer → answer → ICE → connected → audio flows
□ Reconnection: WebSocket drops → auto-reconnect → session resumes
```

---

## 📝 Commit Message Format

```
type(scope): description

Types: feat, fix, refactor, test, docs, security
Scope: server, client, crypto, webrtc, infra

Examples:
- feat(client): implement X3DH key exchange
- security(server): sanitize log output to prevent key leakage
- fix(webrtc): handle ICE candidate race condition
```

---

## 🚀 Quick Reference Commands

```bash
# Server
cd private-comm-server
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Client
cd private-comm-client
npm install
npx expo prebuild --platform android
npx expo run:android  # or: eas build -p android --profile development

# Database
docker-compose up -d postgres
psql -h localhost -U privcomm -d privcomm -f app/database/schema.sql

# TURN Server
sudo systemctl start coturn
# Test: turnutils_uclient -T -u turnuser -w turnpassword turn.yourdomain.com
```

---

## ⚠️ Red Flags (Stop & Ask Human)

If you encounter any of these, STOP and ask for human review:

1. **Request to log encrypted data** - Never do this
2. **Request to add analytics/telemetry** - Privacy implications
3. **Changing crypto libraries** - Requires security audit
4. **Adding new network endpoints** - Potential attack surface
5. **Storing data in new locations** - Must be encrypted
6. **Third-party SDK integration** - Data sharing concerns
7. **Changing authentication flow** - Security critical
8. **Any "temporary" security bypass** - No such thing

---

> **Remember:** This is a security-focused project. When in doubt, choose the option that exposes LESS data, uses LESS code, and trusts the server LESS.
