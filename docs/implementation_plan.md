# Private E2EE Communication Platform - Implementation Plan

> **Target Audience:** AI Coding Agents  
> **Project Type:** End-to-End Encrypted Messaging & Voice Platform

---

## Executive Technical Summary

### Chosen Stack
| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Server** | Python 3.11+ with FastAPI | Async WebSocket support, excellent crypto libraries |
| **Database** | PostgreSQL | ACID compliance for message queuing |
| **Client** | Expo Development Build | Required for native WebRTC and crypto modules |
| **Crypto** | libsignal-protocol | Industry-standard Double Ratchet implementation |
| **Voice** | WebRTC + coturn | P2P with TURN fallback for NAT traversal |
| **Tunnel** | Cloudflare Tunnel | Zero-trust network exposure |

### Key Trade-offs
- **Privacy > Features**: No message storage on server, no metadata logging
- **Latency > Quality**: Opus codec at 24kbps for voice (acceptable quality, minimal delay)
- **Expo Dev Build > Expo Go**: Native modules required, larger APK but full functionality

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BARE METAL SERVER                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  FastAPI        │  │  PostgreSQL     │  │  coturn             │  │
│  │  Signaling      │  │  User Registry  │  │  STUN/TURN Server   │  │
│  │  Server         │  │  Key Storage    │  │  UDP/TCP Relay      │  │
│  │  (WSS:8000)     │  │  (Port 5432)    │  │  (UDP:3478,49152+)  │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │             │
│           └────────────────────┼──────────────────────┘             │
│                                │                                    │
│  ┌─────────────────────────────┴─────────────────────────────────┐  │
│  │                    Cloudflare Tunnel                          │  │
│  │              (cloudflared daemon - Zero Trust)                │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                          HTTPS/WSS + UDP
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────┴─────┐             ┌─────┴─────┐
              │  Android  │   P2P Call  │  Android  │
              │  Client A │◄───────────►│  Client B │
              │  (Expo)   │   (SRTP)    │  (Expo)   │
              └───────────┘             └───────────┘
```

### Data Flow Summary
1. **Registration**: Client generates keypair → sends public key to server
2. **Messaging**: Client A encrypts with Signal Protocol → Server relays blind → Client B decrypts
3. **Calling**: Signaling via WebSocket → ICE candidates exchanged → Direct P2P SRTP

---

## Phase 1: Server Setup

### 1.1 Environment Setup

**File: `requirements.txt`**
```txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
websockets==12.0
asyncpg==0.29.0
pydantic==2.5.3
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6
httpx==0.26.0
ed25519==1.5
cryptography==42.0.0
```

**Commands to execute:**
```bash
# Create project structure
mkdir -p private-comm-server/{app,config,tests}
cd private-comm-server

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# OR: .\venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
```

### 1.2 Database Schema

**File: `app/database/schema.sql`**
```sql
-- User registration and key storage
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_hash VARCHAR(64) UNIQUE NOT NULL,  -- SHA-256 of phone number
    identity_key BYTEA NOT NULL,              -- Ed25519 public key
    signed_prekey BYTEA NOT NULL,             -- Signed pre-key bundle
    prekey_signature BYTEA NOT NULL,          -- Signature of signed_prekey
    created_at TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW()
);

-- One-time prekeys for X3DH
CREATE TABLE one_time_prekeys (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL,
    public_key BYTEA NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, key_id)
);

-- Pending messages (encrypted blobs only)
CREATE TABLE pending_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    encrypted_payload BYTEA NOT NULL,  -- Server CANNOT decrypt this
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Device push tokens
CREATE TABLE push_tokens (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(512) NOT NULL,
    platform VARCHAR(10) DEFAULT 'android',
    PRIMARY KEY (user_id, token)
);

CREATE INDEX idx_pending_messages_recipient ON pending_messages(recipient_id);
CREATE INDEX idx_one_time_prekeys_available ON one_time_prekeys(user_id, used) WHERE NOT used;
```

### 1.3 FastAPI Signaling Server

**File: `app/main.py`**
```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncpg
import json
import os
from typing import Dict, Optional
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection pool
db_pool: Optional[asyncpg.Pool] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    db_pool = await asyncpg.create_pool(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        user=os.getenv("DB_USER", "privcomm"),
        password=os.getenv("DB_PASSWORD", "secure_password"),
        database=os.getenv("DB_NAME", "privcomm"),
        min_size=5,
        max_size=20
    )
    yield
    await db_pool.close()

app = FastAPI(title="Private Communication Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active WebSocket connections: user_id -> WebSocket
active_connections: Dict[str, WebSocket] = {}


class ConnectionManager:
    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        active_connections[user_id] = websocket
        logger.info(f"User {user_id[:8]}... connected")

    def disconnect(self, user_id: str):
        if user_id in active_connections:
            del active_connections[user_id]
            logger.info(f"User {user_id[:8]}... disconnected")

    async def send_to_user(self, user_id: str, message: dict) -> bool:
        if user_id in active_connections:
            await active_connections[user_id].send_json(message)
            return True
        return False

manager = ConnectionManager()
```

**File: `app/routes/registration.py`**
```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncpg
from typing import List
import base64

router = APIRouter(prefix="/api/v1", tags=["registration"])

class RegisterRequest(BaseModel):
    phone_hash: str  # SHA-256 hash of phone number
    identity_key: str  # Base64 encoded Ed25519 public key
    signed_prekey: str  # Base64 encoded signed pre-key
    prekey_signature: str  # Base64 encoded signature
    one_time_prekeys: List[dict]  # [{key_id: int, public_key: str}]

class KeyBundleResponse(BaseModel):
    identity_key: str
    signed_prekey: str
    prekey_signature: str
    one_time_prekey: dict | None

@router.post("/register")
async def register_user(request: RegisterRequest):
    """Register a new user with their key bundle."""
    from app.main import db_pool
    
    async with db_pool.acquire() as conn:
        # Check if user exists
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE phone_hash = $1",
            request.phone_hash
        )
        
        if existing:
            # Update keys for existing user
            await conn.execute("""
                UPDATE users SET 
                    identity_key = $1,
                    signed_prekey = $2,
                    prekey_signature = $3,
                    last_seen = NOW()
                WHERE phone_hash = $4
            """, 
                base64.b64decode(request.identity_key),
                base64.b64decode(request.signed_prekey),
                base64.b64decode(request.prekey_signature),
                request.phone_hash
            )
            user_id = existing['id']
        else:
            # Insert new user
            user_id = await conn.fetchval("""
                INSERT INTO users (phone_hash, identity_key, signed_prekey, prekey_signature)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            """,
                request.phone_hash,
                base64.b64decode(request.identity_key),
                base64.b64decode(request.signed_prekey),
                base64.b64decode(request.prekey_signature)
            )
        
        # Store one-time prekeys
        for otpk in request.one_time_prekeys:
            await conn.execute("""
                INSERT INTO one_time_prekeys (user_id, key_id, public_key)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id, key_id) DO UPDATE SET public_key = $3, used = FALSE
            """, user_id, otpk['key_id'], base64.b64decode(otpk['public_key']))
    
    return {"status": "registered", "user_id": str(user_id)}

@router.get("/keys/{phone_hash}", response_model=KeyBundleResponse)
async def get_key_bundle(phone_hash: str):
    """Fetch a user's key bundle for initiating encrypted session."""
    from app.main import db_pool
    
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("""
            SELECT id, identity_key, signed_prekey, prekey_signature
            FROM users WHERE phone_hash = $1
        """, phone_hash)
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get and mark one-time prekey as used
        otpk = await conn.fetchrow("""
            UPDATE one_time_prekeys
            SET used = TRUE
            WHERE id = (
                SELECT id FROM one_time_prekeys
                WHERE user_id = $1 AND NOT used
                ORDER BY created_at
                LIMIT 1
            )
            RETURNING key_id, public_key
        """, user['id'])
        
        return {
            "identity_key": base64.b64encode(user['identity_key']).decode(),
            "signed_prekey": base64.b64encode(user['signed_prekey']).decode(),
            "prekey_signature": base64.b64encode(user['prekey_signature']).decode(),
            "one_time_prekey": {
                "key_id": otpk['key_id'],
                "public_key": base64.b64encode(otpk['public_key']).decode()
            } if otpk else None
        }
```

**File: `app/routes/websocket.py`**
```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.main import manager, db_pool, active_connections
import json
import base64
from datetime import datetime

router = APIRouter()

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """
    WebSocket endpoint for real-time messaging and call signaling.
    
    Message Types:
    - encrypted_message: Relay encrypted message to recipient
    - call_offer: WebRTC SDP offer for initiating call
    - call_answer: WebRTC SDP answer
    - ice_candidate: ICE candidate for NAT traversal
    - call_reject: Reject incoming call
    - call_end: End active call
    """
    await manager.connect(user_id, websocket)
    
    try:
        # Deliver pending messages
        async with db_pool.acquire() as conn:
            pending = await conn.fetch("""
                SELECT id, sender_id, encrypted_payload, timestamp
                FROM pending_messages
                WHERE recipient_id = $1
                ORDER BY timestamp
            """, user_id)
            
            for msg in pending:
                await websocket.send_json({
                    "type": "encrypted_message",
                    "sender_id": str(msg['sender_id']),
                    "payload": base64.b64encode(msg['encrypted_payload']).decode(),
                    "timestamp": msg['timestamp'].isoformat()
                })
                await conn.execute("DELETE FROM pending_messages WHERE id = $1", msg['id'])
        
        # Main message loop
        while True:
            data = await websocket.receive_json()
            await handle_message(user_id, data)
            
    except WebSocketDisconnect:
        manager.disconnect(user_id)

async def handle_message(sender_id: str, data: dict):
    """Route incoming WebSocket messages to appropriate handlers."""
    msg_type = data.get("type")
    recipient_id = data.get("recipient_id")
    
    if msg_type == "encrypted_message":
        # Relay encrypted message - server cannot read content
        delivered = await manager.send_to_user(recipient_id, {
            "type": "encrypted_message",
            "sender_id": sender_id,
            "payload": data.get("payload"),  # Already encrypted by client
            "timestamp": datetime.utcnow().isoformat()
        })
        
        if not delivered:
            # Store for later delivery
            async with db_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO pending_messages (recipient_id, sender_id, encrypted_payload)
                    VALUES ($1, $2, $3)
                """, recipient_id, sender_id, base64.b64decode(data.get("payload")))
    
    elif msg_type in ["call_offer", "call_answer", "ice_candidate", "call_reject", "call_end"]:
        # Forward call signaling directly - no storage
        await manager.send_to_user(recipient_id, {
            "type": msg_type,
            "sender_id": sender_id,
            **{k: v for k, v in data.items() if k not in ["type", "recipient_id"]}
        })
```

### 1.4 Cloudflare Tunnel Configuration

**File: `config/cloudflared.yml`**
```yaml
tunnel: your-tunnel-id
credentials-file: /root/.cloudflared/your-tunnel-id.json

ingress:
  # WebSocket signaling server
  - hostname: signal.yourdomain.com
    service: http://localhost:8000
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
      
  # TURN server (TCP fallback only - UDP bypasses tunnel)
  - hostname: turn.yourdomain.com
    service: tcp://localhost:3478
    
  # Catch-all
  - service: http_status:404
```

**Commands to execute:**
```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Login and create tunnel
cloudflared tunnel login
cloudflared tunnel create privcomm-tunnel

# Configure DNS
cloudflared tunnel route dns privcomm-tunnel signal.yourdomain.com

# Run as service
cloudflared service install
systemctl start cloudflared
```

---

## Phase 2: Cryptography Implementation

### 2.1 Signal Protocol Overview

The Signal Protocol provides:
- **X3DH (Extended Triple Diffie-Hellman)**: Initial key agreement
- **Double Ratchet**: Forward secrecy via continuous key rotation
- **Sealed Sender**: Optional metadata protection

### 2.2 Client-Side Crypto Module (React Native)

**File: `src/crypto/SignalProtocol.ts`**
```typescript
import { NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { Buffer } from 'buffer';

// Native bridge to libsignal
const { SignalCrypto } = NativeModules;

export interface KeyBundle {
  identityKey: string;      // Base64 Ed25519 public key
  signedPreKey: string;     // Base64 signed pre-key
  preKeySignature: string;  // Base64 signature
  oneTimePreKey?: {
    keyId: number;
    publicKey: string;
  };
}

export interface EncryptedMessage {
  type: number;           // 1 = PreKeyMessage, 2 = Message
  registrationId: number;
  deviceId: number;
  body: string;           // Base64 ciphertext
}

class SignalProtocolManager {
  private sessionStore: Map<string, any> = new Map();
  
  /**
   * Generate identity key pair and store securely.
   * Called once during initial app setup.
   */
  async generateIdentity(): Promise<{ publicKey: string; privateKey: string }> {
    // Generate Ed25519 key pair using native module
    const keyPair = await SignalCrypto.generateIdentityKeyPair();
    
    // Store private key in Android Keystore via Keychain
    await Keychain.setGenericPassword(
      'identity_private_key',
      keyPair.privateKey,
      {
        service: 'privcomm_identity',
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }
    );
    
    return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
  }
  
  /**
   * Generate signed pre-key bundle for registration.
   */
  async generateSignedPreKey(identityPrivateKey: string): Promise<{
    publicKey: string;
    signature: string;
    keyId: number;
  }> {
    const keyId = Math.floor(Math.random() * 0xFFFFFF);
    const result = await SignalCrypto.generateSignedPreKey(identityPrivateKey, keyId);
    
    await Keychain.setGenericPassword(
      `signed_prekey_${keyId}`,
      result.privateKey,
      { service: 'privcomm_prekeys' }
    );
    
    return {
      publicKey: result.publicKey,
      signature: result.signature,
      keyId,
    };
  }
  
  /**
   * Generate batch of one-time pre-keys.
   */
  async generateOneTimePreKeys(count: number = 100): Promise<Array<{
    keyId: number;
    publicKey: string;
  }>> {
    const preKeys: Array<{ keyId: number; publicKey: string }> = [];
    
    for (let i = 0; i < count; i++) {
      const keyId = Date.now() + i;
      const keyPair = await SignalCrypto.generatePreKey(keyId);
      
      await Keychain.setGenericPassword(
        `onetime_prekey_${keyId}`,
        keyPair.privateKey,
        { service: 'privcomm_otpk' }
      );
      
      preKeys.push({ keyId, publicKey: keyPair.publicKey });
    }
    
    return preKeys;
  }
  
  /**
   * Initialize session with recipient using their key bundle (X3DH).
   */
  async initSession(recipientId: string, theirBundle: KeyBundle): Promise<void> {
    const credentials = await Keychain.getGenericPassword({ service: 'privcomm_identity' });
    if (!credentials) throw new Error('Identity key not found');
    
    const session = await SignalCrypto.createSession(
      credentials.password, // our identity private key
      theirBundle.identityKey,
      theirBundle.signedPreKey,
      theirBundle.preKeySignature,
      theirBundle.oneTimePreKey?.publicKey
    );
    
    this.sessionStore.set(recipientId, session);
  }
  
  /**
   * Encrypt a message for a recipient.
   */
  async encrypt(recipientId: string, plaintext: string): Promise<EncryptedMessage> {
    let session = this.sessionStore.get(recipientId);
    
    if (!session) {
      throw new Error('No session established. Call initSession first.');
    }
    
    const result = await SignalCrypto.encrypt(session, plaintext);
    
    // Update session with new ratchet state
    this.sessionStore.set(recipientId, result.updatedSession);
    
    return {
      type: result.messageType,
      registrationId: result.registrationId,
      deviceId: 1,
      body: result.ciphertext,
    };
  }
  
  /**
   * Decrypt a received message.
   */
  async decrypt(senderId: string, message: EncryptedMessage): Promise<string> {
    let session = this.sessionStore.get(senderId);
    
    const credentials = await Keychain.getGenericPassword({ service: 'privcomm_identity' });
    if (!credentials) throw new Error('Identity key not found');
    
    const result = await SignalCrypto.decrypt(
      session,
      credentials.password,
      message.body,
      message.type
    );
    
    // Update session with new ratchet state
    this.sessionStore.set(senderId, result.updatedSession);
    
    return result.plaintext;
  }
}

export const signalProtocol = new SignalProtocolManager();
```

---

## Phase 3: Expo Client Development

### 3.1 Project Initialization

**Commands to execute:**
```bash
# Create Expo project with development build
npx create-expo-app@latest private-comm-client --template blank-typescript
cd private-comm-client

# Install required dependencies
npx expo install expo-dev-client
npm install react-native-webrtc @notifee/react-native
npm install react-native-keychain
npm install @react-navigation/native @react-navigation/native-stack
npm install react-native-screens react-native-safe-area-context
npm install zustand  # State management
npm install socket.io-client  # Alternative WebSocket client

# Configure for development build
npx expo prebuild --platform android
```

### 3.2 App Configuration

**File: `app.json`**
```json
{
  "expo": {
    "name": "Private Comm",
    "slug": "private-comm",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#1a1a2e"
    },
    "android": {
      "package": "com.yourorg.privatecomm",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1a1a2e"
      },
      "permissions": [
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.READ_CONTACTS",
        "android.permission.READ_PHONE_STATE",
        "android.permission.RECEIVE_SMS",
        "android.permission.READ_SMS",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.CAMERA",
        "android.permission.VIBRATE",
        "android.permission.WAKE_LOCK",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.RECEIVE_BOOT_COMPLETED"
      ]
    },
    "plugins": [
      "expo-dev-client",
      [
        "@notifee/react-native",
        {
          "android": {
            "compileSdkVersion": 34
          }
        }
      ]
    ]
  }
}
```

### 3.3 Permission Handling

**File: `src/utils/permissions.ts`**
```typescript
import { PermissionsAndroid, Platform, Alert } from 'react-native';

export type PermissionType = 'microphone' | 'contacts' | 'sms' | 'camera';

const PERMISSION_MAP: Record<PermissionType, string> = {
  microphone: PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  contacts: PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
  sms: PermissionsAndroid.PERMISSIONS.READ_SMS,
  camera: PermissionsAndroid.PERMISSIONS.CAMERA,
};

const PERMISSION_RATIONALE: Record<PermissionType, { title: string; message: string }> = {
  microphone: {
    title: 'Microphone Access Required',
    message: 'Private Comm needs microphone access to make encrypted voice calls.',
  },
  contacts: {
    title: 'Contacts Access',
    message: 'Allow access to find friends who also use Private Comm. Contact data never leaves your device unencrypted.',
  },
  sms: {
    title: 'SMS Verification',
    message: 'Used only for automatic verification code detection.',
  },
  camera: {
    title: 'Camera Access',
    message: 'Required for future video calling feature.',
  },
};

export async function requestPermission(type: PermissionType): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  
  try {
    const permission = PERMISSION_MAP[type];
    const rationale = PERMISSION_RATIONALE[type];
    
    const granted = await PermissionsAndroid.request(permission, rationale);
    
    if (granted === PermissionsAndroid.RESULTS.GRANTED) {
      return true;
    } else if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      Alert.alert(
        'Permission Required',
        `Please enable ${type} permission in Settings to use this feature.`,
        [{ text: 'OK' }]
      );
      return false;
    }
    
    return false;
  } catch (err) {
    console.error(`Permission request failed for ${type}:`, err);
    return false;
  }
}

export async function requestMultiplePermissions(types: PermissionType[]): Promise<Record<PermissionType, boolean>> {
  const results: Record<PermissionType, boolean> = {} as any;
  
  for (const type of types) {
    results[type] = await requestPermission(type);
  }
  
  return results;
}

export async function checkPermission(type: PermissionType): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  
  const permission = PERMISSION_MAP[type];
  const result = await PermissionsAndroid.check(permission);
  return result;
}
```

---

## Phase 4: WebRTC Voice Implementation

### 4.1 TURN Server Setup (coturn)

**File: `config/turnserver.conf`**
```ini
# coturn TURN server configuration
listening-port=3478
tls-listening-port=5349

# Use public IP or domain
external-ip=YOUR_PUBLIC_IP
realm=turn.yourdomain.com

# Authentication
lt-cred-mech
user=turnuser:turnpassword

# Relay ports for media
min-port=49152
max-port=65535

# TLS certificates (use Let's Encrypt)
cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem

# Performance tuning
total-quota=100
stale-nonce=600
no-multicast-peers

# Security
no-cli
no-loopback-peers

# Logging
log-file=/var/log/coturn/turnserver.log
verbose
```

**Commands to execute:**
```bash
# Install coturn
apt-get update && apt-get install -y coturn

# Enable coturn service
echo "TURNSERVER_ENABLED=1" >> /etc/default/coturn

# Start coturn
systemctl enable coturn
systemctl start coturn
```

### 4.2 WebRTC Client Implementation

**File: `src/services/WebRTCService.ts`**
```typescript
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { websocketService } from './WebSocketService';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:turn.yourdomain.com:3478' },
  {
    urls: 'turn:turn.yourdomain.com:3478',
    username: 'turnuser',
    credential: 'turnpassword',
  },
  {
    urls: 'turns:turn.yourdomain.com:5349',
    username: 'turnuser',
    credential: 'turnpassword',
  },
];

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connected' | 'ended';

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentCallId: string | null = null;
  private onStateChange: ((state: CallState) => void) | null = null;
  private onRemoteStream: ((stream: MediaStream) => void) | null = null;

  setCallbacks(callbacks: {
    onStateChange: (state: CallState) => void;
    onRemoteStream: (stream: MediaStream) => void;
  }) {
    this.onStateChange = callbacks.onStateChange;
    this.onRemoteStream = callbacks.onRemoteStream;
  }

  private async createPeerConnection(): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });

    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate && this.currentCallId) {
        websocketService.send({
          type: 'ice_candidate',
          recipient_id: this.currentCallId,
          candidate: event.candidate.toJSON(),
        });
      }
    });

    pc.addEventListener('track', (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStream?.(this.remoteStream);
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.onStateChange?.('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.endCall();
      }
    });

    return pc;
  }

  async startCall(recipientId: string): Promise<void> {
    try {
      this.currentCallId = recipientId;
      this.onStateChange?.('outgoing');

      // Get local audio stream
      this.localStream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.peerConnection = await this.createPeerConnection();

      // Add local tracks to peer connection
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // Create and send offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      
      await this.peerConnection.setLocalDescription(offer);

      websocketService.send({
        type: 'call_offer',
        recipient_id: recipientId,
        sdp: offer.sdp,
      });
    } catch (error) {
      console.error('Failed to start call:', error);
      this.endCall();
      throw error;
    }
  }

  async handleIncomingOffer(senderId: string, sdp: string): Promise<void> {
    try {
      this.currentCallId = senderId;
      this.onStateChange?.('incoming');

      this.localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.peerConnection = await this.createPeerConnection();

      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp })
      );

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      websocketService.send({
        type: 'call_answer',
        recipient_id: senderId,
        sdp: answer.sdp,
      });
    } catch (error) {
      console.error('Failed to handle offer:', error);
      this.endCall();
    }
  }

  async handleAnswer(sdp: string): Promise<void> {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp })
      );
    }
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.peerConnection) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  endCall(): void {
    if (this.currentCallId) {
      websocketService.send({
        type: 'call_end',
        recipient_id: this.currentCallId,
      });
    }

    this.localStream?.getTracks().forEach((track) => track.stop());
    this.peerConnection?.close();

    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.currentCallId = null;
    this.onStateChange?.('ended');
  }

  toggleMute(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled; // Returns true if muted
      }
    }
    return false;
  }
}

export const webRTCService = new WebRTCService();
```

---

## Phase 5: Deployment

### 5.1 Server Deployment

**File: `docker-compose.yml`**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_USER=privcomm
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=privcomm
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./app/database/schema.sql:/docker-entrypoint-initdb.d/init.sql
    environment:
      - POSTGRES_USER=privcomm
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=privcomm
    restart: unless-stopped

  coturn:
    image: coturn/coturn:latest
    network_mode: host
    volumes:
      - ./config/turnserver.conf:/etc/coturn/turnserver.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro
    restart: unless-stopped

volumes:
  postgres_data:
```

### 5.2 Android APK Build

**Commands to execute:**
```bash
# Build development APK
cd private-comm-client
eas build --platform android --profile development

# For production APK (after testing)
eas build --platform android --profile production

# Local APK build (without EAS)
cd android
./gradlew assembleRelease
# APK will be at: android/app/build/outputs/apk/release/app-release.apk
```

---

## Verification Plan

### Automated Tests
```bash
# Server unit tests
cd private-comm-server
pytest tests/ -v --cov=app

# Client tests
cd private-comm-client
npm test
```

### Manual Verification
1. **Registration Flow**: Register two test devices, verify key bundles stored correctly
2. **Message Exchange**: Send message A→B, verify B receives and decrypts
3. **Voice Call**: Initiate call, verify audio flows both directions
4. **Offline Messages**: Send message while recipient offline, verify delivery on reconnect

---

> **Next Steps**: Review this plan and approve to proceed with implementation. Each phase should be completed and verified before moving to the next.
