# Developer Integration Guide

Private Communication Platform - Developer Documentation

---

## Quick Start

### Prerequisites
- **Node.js** 18+
- **Python** 3.11+
- **Docker** for local PostgreSQL
- **Android Studio** for native modules
- **Expo CLI** installed globally

---

## Client Setup

### 1. Install Dependencies

```bash
cd private-comm-client
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in `private-comm-client/`:

```env
NODE_ENV=development
API_URL=http://localhost:8000
# Production example:
# NODE_ENV=production
# API_URL=https://your-domain.com
```

### 3. Prebuild for Android (Required)

**IMPORTANT**: This project uses native modules (`react-native-webrtc`, `react-native-keychain`, custom Signal crypto). Expo Go will NOT work.

```bash
npx expo prebuild --platform android
```

### 4. Install Native Signal Module

The app requires a native Signal Protocol module. Create it:

```bash
cd private-comm-client/android
mkdir -p app/src/main/java/com/yourorg/privatecomm/signal
```

Then implement the native module bridging to libsignal. Reference implementation in:
- `src/crypto/SignalCryptoBridge.ts` - Interface definition
- `src/crypto/SignalProtocol.ts` - Usage patterns

**Minimal Implementation Required:**
```java
package com.yourorg.privatecomm.signal;

import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableMap;

@ReactModule(name = "SignalCrypto")
public class SignalCryptoModule extends ReactContextBaseJavaModule {
  public SignalCryptoModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @ReactMethod
  public void generateIdentityKeyPair(Promise promise) {
    // Generate Ed25519 key pair
  }

  @ReactMethod
  public void signMessage(String privateKey, String message, Promise promise) {
    // Sign message with Ed25519
  }

  @ReactMethod
  public void verifySignature(String publicKey, String message, String signature, Promise promise) {
    // Verify Ed25519 signature
  }

  @ReactMethod
  public void createSession(/* params */, Promise promise) {
    // X3DH session creation
  }

  @ReactMethod
  public void encrypt(String session, String plaintext, Promise promise) {
    // AES-256-GCM encryption
  }

  @ReactMethod
  public void decrypt(String session, String ciphertext, int messageType, Promise promise) {
    // AES-256-GCM decryption
  }
}
```

### 5. Run Development Build

```bash
npx expo run:android
```

---

## Server Setup

### 1. Install Dependencies

```bash
cd private-comm-server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in `private-comm-server/`:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=privcomm
DB_PASSWORD=your-secure-password
DB_NAME=privcomm

# Authentication (REQUIRED - server will not start without this)
SECRET_KEY=your-secret-jwt-key-change-me-in-production

# TURN Server
TURN_USERNAME=turnuser
TURN_PASSWORD=your-turn-password
TURN_HOST=turn.yourdomain.com
TURN_PORT=3478
TURN_TLS_PORT=5349

# Environment
ENVIRONMENT=development
DB_POOL_MIN_SIZE=5
DB_POOL_MAX_SIZE=20
CORS_ORIGINS=http://localhost:19006
```

### 3. Start PostgreSQL

```bash
docker-compose up -d postgres
```

### 4. Run Database Migrations

```bash
cd private-comm-server
alembic upgrade head
```

### 5. Start Server

```bash
cd private-comm-server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## Development Workflow

### Registration Flow

1. **Client hashes phone number:**
   ```typescript
   const phoneHash = KeyManager.hashPhoneNumber(phoneNumber, 'server-provided-salt');
   ```

2. **Client generates keys:**
   ```typescript
   const identityKeyPair = await signalProtocol.generateIdentity();
   const signedPreKey = await signalProtocol.generateSignedPreKey(identityKeyPair.privateKey);
   const oneTimePreKeys = await signalProtocol.generateOneTimePreKeys(100);
   ```

3. **Client registers with server:**
   ```typescript
   await apiService.register(
     phoneHash,
     identityKeyPair.publicKey,
     signedPreKey.publicKey,
     signedPreKey.signature,
     oneTimePreKeys
   );
   ```

4. **Client stores keys securely:**
   ```typescript
   await Keychain.setGenericPassword('identity_private_key', identityKeyPair.privateKey, {
     service: 'privcomm_identity',
     accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
     accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
   });
   ```

### Message Flow

1. **Encrypt message:**
   ```typescript
   const encrypted = await signalProtocol.encrypt(recipientId, plaintext);
   ```

2. **Send to server (WebSocket):**
   ```typescript
   webSocketService.send({
     type: 'encrypted_message',
     recipient_id: recipientId,
     payload: encrypted.body,
   });
   ```

3. **Server relays (blind):**
   - Server stores opaque encrypted payload in `pending_messages` if recipient offline
   - Server forwards immediately if recipient has active WebSocket connection

4. **Decrypt message:**
   ```typescript
   const plaintext = await signalProtocol.decrypt(senderId, encryptedMessage);
   ```

### Voice Call Flow

1. **Initiator starts call:**
   ```typescript
   await webRTCService.startCall(recipientId);
   ```

2. **Server relays offer via WebSocket**

3. **Recipient receives offer:**
   ```typescript
   await webRTCService.handleIncomingOffer(senderId, sdp);
   ```

4. **ICE exchange completes**
   - Both parties exchange ICE candidates through WebSocket
   - WebRTC peer connection established

---

## Testing Without Native Signal Module

For development without the native Signal module, the app will throw an error. To test authentication flow:

### Mock Mode (NOT FOR PRODUCTION)

1. Comment out the error throw in `SignalCryptoBridge.ts`:
   ```typescript
   export function getSignalCrypto(): SignalCryptoModule {
     if (NativeSignalCrypto) {
       return NativeSignalCrypto;
     }
     // TEMPORARY FOR DEV ONLY:
     cryptoInstance = new MockSignalCrypto() as unknown as SignalCryptoModule;
     return cryptoInstance;
   }
   ```

2. The mock will generate random "signatures" that won't verify properly

### Production Mode

- Ensure native Signal module is installed and working
- Mock will throw: `Native SignalCrypto module is required for production`

---

## Deployment

### Cloudflare Tunnel Setup

1. **Install cloudflared:**
   ```bash
   # Download from: https://github.com/cloudflare/cloudflared
   ```

2. **Create tunnel configuration:**
   ```yaml
   # config/cloudflared.yml
   tunnel: <your-tunnel-id>
   credentials-file: /root/.cloudflared/<your-tunnel-id>.json
   ```

3. **Start tunnel:**
   ```bash
   cloudflared tunnel --config config/cloudflared.yml run
   ```

4. **Update client URLs:**
   - Set `API_URL=https://your-domain.com` and `NODE_ENV=production`
   - WebSocket will automatically use `wss://`

### TURN Server Setup

1. **Install coturn:**
   ```bash
   sudo apt-get install coturn  # Debian/Ubuntu
   ```

2. **Configure:**
   ```bash
   # Edit /etc/turnserver.conf or use config/turnserver.conf
   ```
   **Required settings:**
   ```
   listening-port=3478
   tls-listening-port=5349
   lt-cred-mech
   user=<username>
   password=<secure-password>
   realm=yourdomain.com
   ```

3. **Start:**
   ```bash
   sudo systemctl start coturn
   ```

4. **Test:**
   ```bash
   turnutils_uclient -T -u turnuser -w turnpassword turn.yourdomain.com
   ```

---

## Troubleshooting

### "Native SignalCrypto module is required"

**Cause:** Native module not compiled/included in build

**Solution:**
1. Run `npx expo prebuild --platform android`
2. Ensure native module is in `android/app/src/main/java/...`
3. Rebuild: `npx expo run:android`

### "Authentication failed"

**Cause:** Invalid signature during token request

**Solution:**
1. Verify client is using correct identity private key for signing
2. Check phone hash generation uses correct salt
3. Ensure nonce is freshly generated per request

### "TURN server may not be configured"

**Cause:** No TURN credentials endpoint implemented or server not running TURN

**Solution:**
1. Ensure `/api/v1/turn-credentials` is implemented
2. Check `TURN_USERNAME`, `TURN_PASSWORD`, `TURN_HOST` in server `.env`
3. Test TURN server manually

### "WebSocket connection fails"

**Cause:** Expired or invalid JWT token

**Solution:**
1. Client must call `apiService.getWebSocketToken()` with fresh signature before connecting
2. Token expires after 30 minutes

---

## Security Checklist

Before deploying to production, verify:

- [ ] `SECRET_KEY` is set to strong random value (not "change-me-in-production")
- [ ] `TURN_PASSWORD` is set to strong random value
- [ ] `DB_PASSWORD` is set to strong random value
- [ ] `NODE_ENV=production` in client `.env`
- [ ] Native Signal module is properly compiled and tested
- [ ] Phone number salt is obtained from server (not hardcoded)
- [ ] TURN credentials are working (test with `turnutils_uclient`)
- [ ] Cloudflare tunnel is running and using `wss://`
- [ ] Rate limiting is tested
- [ ] HTTPS is enforced in production

---

## Next Steps

1. Implement native Signal Protocol module
2. Test full registration → messaging flow
3. Test voice call flow (offer/answer/ICE)
4. Deploy to production with proper environment variables
5. Monitor logs and implement error tracking
