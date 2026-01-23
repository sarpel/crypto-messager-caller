# Error Code Reference

Private Communication Platform - Comprehensive Error Codes and Troubleshooting

---

## HTTP Status Codes

| Code | Name | When Occurs | Client Action |
|-------|------|---------------|---------------|
| **200** | OK | Success - Request succeeded | Proceed |
| **400** | Bad Request | Invalid request data | Fix validation errors, check response detail |
| **401** | Unauthorized | Authentication failed | Check phone hash, verify signature, refresh token |
| **404** | Not Found | User/key not found | Verify recipient exists |
| **429** | Too Many Requests | Rate limit exceeded | Wait and retry with backoff |
| **500** | Internal Server Error | Server error | Report bug, check server logs |
| **503** | Service Unavailable | Database/Turn unavailable | Retry later, check service status |

---

## WebSocket Close Codes

| Code | Name | Reason | Client Action |
|-------|------|---------|---------------|
| **1000** | Normal Closure | Normal connection closure | Clean reconnect if needed |
| **1001** | Going Away | Server shutting down | Wait for server restart |
| **1006** | Abnormal Closure | Connection lost unexpectedly | Reconnect with backoff |
| **1008** | Policy Violation | Invalid or expired JWT token | Get fresh token and reconnect |
| **1013** | Try Again Later | Server at capacity (>10,000 connections) | Wait and retry later |

---

## Client Error Messages

### Signal Protocol Errors

| Error | Location | Cause | Solution |
|--------|-----------|--------|----------|
| `"Identity key not found"` | `KeyManager.ts` | Keys not stored in Keystore | Run registration flow again |
| `"No session established. Call initSession first."` | `SignalProtocol.ts:266` | Attempted to encrypt without session | Call `initSession(recipientId, theirBundle)` first |
| `"Decryption failed"` | `SignalProtocol.ts:127` | Session corruption or wrong key | Delete session and re-init |
| `"Native SignalCrypto module is required"` | `SignalCryptoBridge.ts:208` | Native module not loaded | Ensure native module is compiled and installed |

### WebSocket Errors

| Error | Location | Cause | Solution |
|--------|-----------|--------|----------|
| `"Cannot send message - WebSocket not connected"` | `WebSocketService.ts:122` | Connection lost or not established | Wait for `'connected'` state |
| `"WebSocket connection fails"` | `WebSocketService.ts:86` | Network issue or server down | Check internet, verify server URL |
| `"Max reconnection attempts reached"` | `WebSocketService.ts:62` | Persistent connection failure | Report connectivity issue, restart app |

### WebRTC Errors

| Error | Location | Cause | Solution |
|--------|-----------|--------|----------|
| `"Cannot start call in state: {state}"` | `WebRTCService.ts:133` | Call already in progress | End current call first |
| `"TURN server may not be configured"` | `WebRTCService.ts:58` | No TURN credentials available | Wait for `/api/v1/turn-credentials` response |
| `"Failed to fetch TURN credentials from server"` | `WebRTCService.ts:100` | Server error or endpoint missing | Check server logs, ensure TURN is configured |
| `"ICE connection state: failed"` | `WebRTCService.ts:122` | NAT traversal failed | Ensure TURN server is working, check firewall |
| `"Failed to add ICE candidate"` | `WebRTCService.ts:259` | ICE candidate rejected by peer | WebRTC incompatibility, log for debug |
| `"Received answer but no peer connection"` | `WebRTCService.ts:237` | Race condition in signaling | Peer disconnected before answer arrived, ignore |

### API Service Errors

| Error | Location | Cause | Solution |
|--------|-----------|--------|----------|
| `"API request failed: {code}"` | `ApiService.ts:57` | HTTP error | Check status code, see HTTP Status Codes above |
| `"Failed to fetch TURN credentials from server"` | `ApiService.ts:100` | TURN endpoint error | Check TURN server availability, verify `/api/v1/turn-credentials` |

### Keychain Errors

| Error | Location | Cause | Solution |
|--------|-----------|--------|----------|
| `"Signed prekey {keyId} not found in keychain"` | `KeyManager.ts:46` | Prekey not stored | Check key registration, regenerate if needed |
| `"One-time prekey {keyId} not found in keychain"` | `KeyManager.ts:73` | Prekey not stored | Check key registration, regenerate if needed |
| `"Failed to retrieve signed prekey {keyId}"` | `KeyManager.ts:51` | Keystore error | User may need to re-authenticate with biometrics |
| `"Failed to delete keys for service {service}"` | `KeyManager.ts:102` | Keystore permission error | Check app permissions, user revoked access |

---

## Server Error Responses

### Authentication Errors

| Error Code | JSON Response | Cause | Solution |
|-------------|---------------|--------|----------|
| **AUTH_001** | `{"detail": "Authorization failed"}` | User not found | Verify phone hash is correct |
| **AUTH_002** | `{"detail": "Invalid signature"}` | Signature verification failed | Ensure nonce is fresh, check private key |
| **AUTH_003** | `{"detail": "Invalid signature format"}` | Malformed signature hex | Debug client signature generation |
| **AUTH_004** | `{"detail": "Server not configured properly"}` | SECRET_KEY not set | Set SECRET_KEY environment variable |
| **AUTH_005** | `{"detail": "Database not available"}` | DB connection failed | Check PostgreSQL is running |
| **AUTH_006** | `{"detail": "Verification failed"}` | Crypto verification error | Check Ed25519 implementation |

### Registration Errors

| Error Code | JSON Response | Cause | Solution |
|-------------|---------------|--------|----------|
| **REG_001** | `{"detail": "Authorization failed"}` | User not found (key bundle) | Verify phone hash exists |
| **REG_002** | `{"detail": "phone_hash: must be 64-char hex string"}` | Invalid phone hash format | Ensure SHA-256 hex string |
| **REG_003** | `{"detail": "Must be valid Base64 string"}` | Malformed Base64 key data | Verify key encoding |
| **REG_004** | `{"detail": "one_time_prekeys must have at least 1 entry"}` | No one-time prekeys provided | Generate and send 1-100 OTPKs |
| **REG_005** | `{"detail": "one_time_prekeys cannot exceed 200 entries"}` | Too many prekeys | Limit to 200 OTPKs per request |

### WebSocket Errors

| Error Code | JSON Response | Cause | Solution |
|-------------|---------------|--------|----------|
| **WS_001** | Close code 1008 (Policy Violation) | Invalid/expired JWT | Get fresh auth token |
| **WS_002** | Close code 1013 (Try Again Later) | Server capacity | Wait and retry later |

---

## Common Troubleshooting Scenarios

### Scenario 1: User Cannot Register

**Symptoms:**
- 401 Unauthorized response from `/api/v1/register`
- "User not found" error

**Diagnosis Steps:**
1. Verify phone number is hashed correctly (SHA-256, 64 hex chars)
2. Check identity key is properly Base64-encoded (32 bytes = 44 base64 chars)
3. Verify one-time prekeys array is not empty

**Solution:**
- Debug client phone hash generation
- Verify keys are valid before sending to server
- Check server logs for validation errors

---

### Scenario 2: Messages Not Delivering

**Symptoms:**
- Sender sees message "sent" but recipient never receives
- No errors on sender side

**Diagnosis Steps:**
1. Check recipient is online (connected to WebSocket)
2. Verify recipient's `recipient_id` matches their actual user ID
3. Check server logs for message relay errors

**Solutions:**
- If recipient offline: Check `pending_messages` table
- If recipient online: Check WebSocket connection state
- Verify sender and recipient using same API version

---

### Scenario 3: Voice Calls Failing

**Symptoms:**
- "ICE connection state: failed" error
- Call connects but no audio
- WebRTC connection hangs

**Diagnosis Steps:**
1. Check TURN server is running: `turnutils_uclient -T -u user -w pass turn:port`
2. Verify TURN credentials are fresh (TTL 1 hour)
3. Check NAT/firewall allows TURN traffic (TCP 3478, TLS 5349)
4. Check both peers have compatible WebRTC versions

**Solutions:**
- Ensure TURN server is configured and accessible
- Test with: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
- Verify STUN server (`stun:stun.l.google.com:19302`) is reachable
- Check if using correct TURN protocol (UDP vs TCP)

---

### Scenario 4: Frequent Reconnections

**Symptoms:**
- WebSocket disconnects repeatedly
- "Max reconnection attempts reached" errors

**Diagnosis Steps:**
1. Check network stability (packet loss, jitter)
2. Verify server is not restarting (check logs)
3. Check internet connection (mobile data vs WiFi)
4. Monitor server resource usage (high CPU/memory causing restarts)

**Solutions:**
- Implement exponential backoff (already implemented: 1s → 2s → 4s → ... → 30s max)
- Add connection quality monitoring
- Consider WebSocket compression for unstable networks
- Ensure server has sufficient resources

---

### Scenario 5: Authentication Token Expired

**Symptoms:**
- WebSocket closes with code 1008 (Policy Violation)
- All subsequent WebSocket requests fail

**Diagnosis Steps:**
1. Check JWT token expiration time (30 minutes from issuance)
2. Verify system clock is synchronized
3. Check if client is caching tokens too long

**Solutions:**
- Implement automatic token refresh before expiration
- Call `/api/v1/auth/token` with fresh signature
- Reconnect WebSocket with new token
- Handle 1008 close code with automatic retry logic

---

### Scenario 6: Keystore Issues

**Symptoms:**
- "Identity key not found" errors during encryption/decryption
- "Failed to retrieve signed prekey" errors

**Diagnosis Steps:**
1. Check if user has revoked app permissions
2. Verify Keystore is accessible (biometrics unlock)
3. Check if keys were properly stored during registration

**Solutions:**
- Prompt user to re-authenticate with biometrics
- Clear and regenerate keys if corrupted
- Check `react-native-keychain` integration
- Verify app has proper permissions in `AndroidManifest.xml`

---

## Debug Mode

### Enabling Debug Logging

Client debug logging can be enabled to help troubleshoot:

```typescript
// In development
process.env.NODE_ENV = 'development'; // Logger uses console.log

// In production
process.env.NODE_ENV = 'production'; // Logger queues errors for reporting
```

### Server Debug Logging

Set log level in `.env`:

```env
LOG_LEVEL=DEBUG  # Options: DEBUG, INFO, WARNING, ERROR
```

### Safe Production Debugging

For production debugging without exposing sensitive data:

1. **Timestamps**: Log request/response timestamps, not data
2. **Request IDs**: Log correlation IDs, trace through distributed tracing
3. **Size Only**: Log message sizes, not contents
4. **Error Types Only**: Log exception types, not stack traces
5. **Hashed IDs**: Log SHA-256 of user IDs, not raw IDs

**Example:**
```javascript
// ❌ AVOID in production:
console.log('User authenticated: userId-abc123');

// ✅ ACCEPTABLE in production:
console.log(`User authenticated: ${userId.slice(0, 8)}...`);
```

---

## Error Escalation

### When to Report Bugs

If you encounter an error not covered in this document:

1. Check this document for similar issues and solutions
2. Enable debug logging to capture full error context
3. Search existing GitHub issues for similar problems
4. Create a new GitHub issue with:
   - Clear reproduction steps
   - Expected vs actual behavior
   - Full error messages and stack traces
   - Environment details (OS, app version, browser/native version)
   - Screenshots or logs (sanitized of sensitive data)

### Security Bug Escalation

For suspected security vulnerabilities:

1. **IMMEDIATE ACTION**: Stop using the affected system
2. **DO NOT COMMIT**: Security fixes should never be rushed
3. **DOCUMENT**: Clearly explain the vulnerability and its impact
4. **FIX IN PRIVATE BRANCH**: Work on fix in a separate branch
5. **SECURITY REVIEW**: Have another developer review the fix before merging
6. **CREDENTIAL ROTATION**: If any credentials were exposed, rotate them immediately

### Contact Information

For critical issues requiring human intervention:

- **Emergency Production Issue**: Contact platform admin via secure channel
- **Security Vulnerability**: Follow security disclosure policy (see SECURITY.md)
- **Feature Request**: Open GitHub issue with "enhancement" label
- **Bug Report**: Open GitHub issue with "bug" label

---

## Monitoring Integration

### Client Error Tracking

```typescript
// Example integration with error tracking service
try {
  await signalProtocol.encrypt(recipientId, message);
} catch (error) {
  // Sanitize for production
  const safeMessage = process.env.NODE_ENV === 'production'
    ? 'Encryption failed'
    : `Encryption failed: ${error.message}`;

  Logger.error(safeMessage, error);

  // Report to error tracking
  ErrorTracking.report({
    errorType: 'ENCRYPTION_ERROR',
    message: safeMessage,
    stack: error.stack,
    userId: currentUserId,
  });
}
```

### Server Error Tracking

```python
# Example: Add correlation ID to all logs
@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    correlation_id = str(uuid.uuid4())
    request.state.correlation_id = correlation_id

    response = await call_next(request)
    response.headers["X-Correlation-ID"] = correlation_id
    return response
```

Then query logs by correlation ID:
```bash
grep "X-Correlation-ID: abc123" /var/log/privcomm/*.log
```

---

## Glossary

| Term | Definition |
|-------|------------|
| **E2EE** | End-to-End Encryption - only sender and recipient can read messages |
| **X3DH** | Extended Triple Diffie-Hellman - key exchange protocol for Signal |
| **JWT** | JSON Web Token - authentication token format |
| **TURN** | Traversal Using Relays around NAT - helps WebRTC work behind firewalls |
| **STUN** | Session Traversal Utilities for NAT - helps discover public IP |
| **ICE** | Interactive Connectivity Establishment - WebRTC peer discovery protocol |
| **SDP** | Session Description Protocol - describes WebRTC session parameters |
| **Keystore** | Secure hardware storage for cryptographic keys on mobile devices |
| **Biometry** | Biometric authentication (fingerprint, face) to access Keystore |
| **Nonce** | Number used once - prevents replay attacks in cryptographic protocols |
| **Rate Limiting** | Restricting request rate to prevent abuse/DoS attacks |
| **Backoff** | Exponential delay between retry attempts (1s, 2s, 4s, 8s, ...) |
| **Opacity** | Server inability to decrypt data - security property of this system |
| **Zero-Knowledge** | Architecture where server cannot access plaintext data |
