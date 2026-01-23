# API Documentation

Private Communication Platform - REST API Reference

Base URL: `http://localhost:8000` (development) | `https://your-domain.com` (production)

---

## Authentication

### Get WebSocket Token

Proves identity ownership using Ed25519 signature challenge before issuing JWT token for WebSocket authentication.

**Endpoint:** `POST /api/v1/auth/token`

**Rate Limit:** 10 requests per minute

**Authentication Flow:**
1. Client generates a random 32-byte nonce
2. Client signs the nonce with their Ed25519 identity private key
3. Client sends `phone_hash`, `nonce`, and `signature` to server
4. Server verifies signature using stored Ed25519 public key
5. Server issues JWT token if signature is valid

**Request Body:**
```json
{
  "phone_hash": "SHA256 hash of phone number",
  "nonce": "64-character hex string",
  "signature": "128-character hex string"
}
```

**Request Validation:**
- `phone_hash`: Exactly 64 hex characters (SHA-256)
- `nonce`: 32-64 hex characters
- `signature`: 128 hex characters (64 bytes for Ed25519)

**Response (200 OK):**
```json
{
  "token": "JWT token for WebSocket connection",
  "expires_in": 1800,
  "user_id": "UUID string"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid signature format
- `401 Unauthorized`: User not found or invalid signature
- `500 Internal Server Error`: Verification failed
- `503 Service Unavailable`: Database not available

---

## Registration

### Register User / Update Keys

Registers a new user or updates existing user's cryptographic keys (X3DH key bundle).

**Endpoint:** `POST /api/v1/register`

**Rate Limit:** 10 requests per hour

**Request Body:**
```json
{
  "phone_hash": "SHA256 hash of phone number",
  "identity_key": "Base64-encoded Ed25519 public key (32 bytes)",
  "signed_prekey": "Base64-encoded signed prekey",
  "prekey_signature": "Base64-encoded signature",
  "one_time_prekeys": [
    {
      "key_id": 12345,
      "public_key": "Base64-encoded public key (32 bytes)"
    }
  ]
}
```

**Request Validation:**
- `phone_hash`: Exactly 64 hex characters (SHA-256)
- `identity_key`, `signed_prekey`, `prekey_signature`: Valid Base64 strings
- `one_time_prekeys`: 1-200 entries

**Response (200 OK):**
```json
{
  "status": "registered",
  "user_id": "UUID string"
}
```

**Behavior:**
- Creates new user if `phone_hash` doesn't exist
- Updates keys if `phone_hash` exists (no new user_id created)
- Upserts one-time prekeys (inserts or updates existing `key_id`)

---

## Key Bundle Retrieval

### Get User Key Bundle

Retrieves a user's X3DH key bundle for establishing an encrypted session. Includes one-time prekey if available.

**Endpoint:** `GET /api/v1/keys/{phone_hash}`

**Rate Limit:** 5 requests per minute

**Path Parameter:**
- `phone_hash`: SHA-256 hash of recipient's phone number

**Response (200 OK):**
```json
{
  "identity_key": "Base64-encoded Ed25519 public key",
  "signed_prekey": "Base64-encoded signed prekey",
  "prekey_signature": "Base64-encoded signature",
  "one_time_prekey": {
    "key_id": 12345,
    "public_key": "Base64-encoded public key (32 bytes)"
  } | null
}
```

**Behavior:**
- Returns `null` for `one_time_prekey` if user has exhausted their prekeys
- Marks prekey as "used" atomically with `FOR UPDATE SKIP LOCKED`

**Error Responses:**
- `404 Not Found`: User doesn't exist

---

## TURN Credentials

### Get TURN Server Credentials

Returns TURN server credentials for WebRTC NAT traversal.

**Endpoint:** `GET /api/v1/turn-credentials`

**Authentication:** Requires valid JWT token in Authorization header

**Response (200 OK):**
```json
{
  "urls": [
    "turn:turn.example.com:3478",
    "turns:turn.example.com:5349"
  ],
  "username": "temporary username",
  "credential": "temporary password",
  "ttl": 3600
}
```

**Behavior:**
- Generates time-limited credentials (1 hour TTL)
- Includes both UDP and TCP/TURN-over-TLS endpoints

---

## WebSocket API

### Connect to WebSocket

**Endpoint:** `GET /ws?token={jwt_token}`

**Connection Flow:**
1. Client sends JWT token as query parameter
2. Server validates token and extracts `user_id`
3. Server flushes pending messages (encrypted blobs) to client
4. Connection remains open for real-time message relay

**Connection Close Codes:**
- `1008 (Policy Violation)`: Invalid or expired JWT token
- `1013 (Try Again Later)`: Server at capacity (>10,000 connections)

### WebSocket Message Types

#### Encrypted Message
Relays encrypted message from sender to recipient.

```json
{
  "type": "encrypted_message",
  "recipient_id": "UUID of recipient",
  "payload": "Base64-encoded encrypted payload"
}
```

**Behavior:**
- Delivers immediately if recipient is online (connected to WebSocket)
- Stores in `pending_messages` table if recipient is offline
- Payload is opaque to server - no decryption occurs

#### Call Offer
Initiates a WebRTC voice call.

```json
{
  "type": "call_offer",
  "recipient_id": "UUID of recipient",
  "sdp": "Session Description Protocol (SDP) offer"
}
```

#### Call Answer
Accepts an incoming call.

```json
{
  "type": "call_answer",
  "recipient_id": "UUID of caller",
  "sdp": "SDP answer"
}
```

#### ICE Candidate
Exchanges ICE candidates for WebRTC connection establishment.

```json
{
  "type": "ice_candidate",
  "recipient_id": "UUID of peer",
  "candidate": {
    "candidate": "ICE candidate string",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

#### Call Reject
Rejects an incoming call.

```json
{
  "type": "call_reject",
  "recipient_id": "UUID of caller"
}
```

#### Call End
Terminates an active call.

```json
{
  "type": "call_end",
  "recipient_id": "UUID of peer"
}
```

---

## Security Notes

### Zero-Knowledge Architecture
- **Server never decrypts messages**: All payloads are treated as opaque bytes
- **Server never sees private keys**: Only stores public keys
- **Authentication**: Ed25519 signature proof-of-ownership prevents impersonation

### Message Retention
- **Pending messages**: Automatically deleted after 30 days
- **Used one-time prekeys**: Automatically deleted after 7 days

### Rate Limiting
- `/api/v1/auth/token`: 10/minute per IP
- `/api/v1/register`: 10/hour per IP
- `/api/v1/keys/*`: 5/minute per IP

---

## HTTP Status Codes

| Code | Name | Usage |
|-------|------|--------|
| 200 | OK | Request succeeded |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Authentication failed |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Database/Turn server unavailable |

---

## Error Response Format

All error responses follow this structure:

```json
{
  "detail": "Human-readable error message"
}
```

For validation errors (400), `detail` includes specific field issues:

```json
{
  "detail": [
    "phone_hash: must be 64-char hex string",
    "signature: invalid format"
  ]
}
```
