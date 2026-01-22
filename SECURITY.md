# Security Policy

## Supported Versions

Current version: 1.0.0

Security updates are provided for the latest version only.

## Reporting a Vulnerability

**DO NOT** use GitHub issues for security vulnerabilities.

### How to Report

Email: security@example.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Proposed fix (if available)

### Response Timeline

- **Initial response**: Within 48 hours
- **Detailed review**: Within 7 days
- **Fix deployment**: Within 14 days (depending on severity)
- **Public disclosure**: After fix is deployed

## Security Best Practices

### For Developers

1. **Never commit secrets**: Encryption keys, passwords, API keys
2. **Never log plaintext**: User data, messages, keys
3. **Follow zero-trust**: Server must not access plaintext
4. **Use approved algorithms**: See cryptographic standards in README
5. **Review all crypto changes**: Require peer review for any cryptographic code

### For Users

1. **Keep app updated**: Security patches in new versions
2. **Verify contacts**: Confirm identity before sharing sensitive info
3. **Report suspicious activity**: Unknown messages, unexpected behavior
4. **Backup keys**: Store backup of encryption keys securely (encrypted)

## Critical Security Requirements

### Zero-Knowledge Architecture

- **Server**: Must NEVER see plaintext messages or keys
- **Client**: Encrypt ALL data before sending to server
- **Keys**: Generate and store on user device only

### Key Management

- **Storage**: Android Keystore (via react-native-keychain)
- **Transmission**: NEVER transmit private keys
- **Rotation**: Follow Signal Protocol specification
- **Deletion**: Remove one-time prekeys after use

### Data Handling

- **Phone Numbers**: Hash with SHA256 before sending to server
- **Contacts**: Hash locally before server comparison
- **Messages**: Max 30-day retention on server, delete after delivery

## Known Security Considerations

### Server-Side Risks
- ✅ Server cannot decrypt messages (by design)
- ✅ No plaintext logging
- ✅ No key storage on server

### Client-Side Risks
- ⚠️ Compromised device = compromised messages
- ⚠️ No message backup encryption (feature in progress)
- ⚠️ Screen capture may expose messages

### Network Risks
- ✅ E2EE protects against MITM attacks
- ✅ TLS for all API communications
- ✅ WebSocket authentication via short-lived tokens

## Encryption Standards

| Algorithm | Purpose | Key Size |
|-----------|---------|----------|
| X25519 | Key Exchange | 256-bit |
| Ed25519 | Digital Signatures | 256-bit |
| AES-256-GCM | Symmetric Encryption | 256-bit |
| SHA-256 | Hashing | 256-bit |
| HKDF-SHA256 | Key Derivation | 256-bit |

## Dependency Security

### Regular Audits

- Run security scans monthly
- Update dependencies when vulnerabilities are found
- Review all third-party packages before integration

### Currently Used

- **libsignal**: Signal Protocol implementation
- **react-native-webrtc**: WebRTC for React Native
- **react-native-keychain**: Secure key storage
- **fastapi**: Web framework
- **asyncpg**: PostgreSQL async driver

## Incident Response

### Severity Levels

- **Critical**: Immediate exploit possible, affects all users
- **High**: Exploit possible, affects significant users
- **Medium**: Exploit difficult, affects some users
- **Low**: Minor security impact

### Response Actions

1. **Critical**: Emergency patch within 24 hours, force update
2. **High**: Patch within 7 days, security advisory
3. **Medium**: Patch within 14 days, security note
4. **Low**: Fix in next release

## Disclosure Policy

- Coordinate with reporters before public disclosure
- Allow 90 days for fix deployment
- Provide credit to reporters (if desired)
- Publish security advisory after fix is available

## Compliance

This project aims to comply with:

- **GDPR**: User data protection
- **E2EE Standards**: Zero-knowledge architecture
- **Best Practices**: OWASP guidelines, NIST recommendations

## Questions?

For security-related questions or concerns, email: security@example.com

**Remember**: Security is everyone's responsibility. If you see something, say something.
