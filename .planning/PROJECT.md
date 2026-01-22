# Private E2EE Communication Platform

## What This Is

A secure, self-hosted End-to-End Encrypted messaging and voice calling platform for Android devices. Uses Signal Protocol for message encryption and WebRTC for voice calls. Server is a blind relay that never sees plaintext communications or user keys.

## Core Value

Zero-knowledge encryption prevents government surveillance and online threats from accessing your communications - the server cannot decrypt your messages or see who you're talking to.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] End-to-end encrypted 1-on-1 text messaging using Signal Protocol
- [ ] Encrypted voice calls using WebRTC with P2P connections
- [ ] User registration with hashed phone numbers (server never sees raw phone numbers)
- [ ] Secure key storage in Android Keystore via react-native-keychain
- [ ] WebSocket signaling for real-time message delivery and call setup
- [ ] Offline message queuing (server stores encrypted blobs, delivers when recipient online)
- [ ] Self-hosted server infrastructure (no cloud dependencies)

### Out of Scope

- **Video calling** — Keep voice-only for v1 to reduce complexity and attack surface
- **Group messaging** — Start with 1-on-1 communication only
- **File sharing** — Messages only, no attachments or media sharing
- **Desktop/web client** — Android app only (mobile-only constraint)
- **Public cloud hosting** — Must run on own server (self-hosted constraint)
- **Closed-source dependencies** — Must use fully auditable open-source components

## Context

This project addresses privacy concerns against government surveillance, online threats, and data collection. The implementation follows security-critical patterns: server is a blind relay, all encryption happens client-side, private keys never leave the device, and metadata is minimized through phone number hashing.

Technical foundation established in implementation_plan.md with detailed architecture for FastAPI server, PostgreSQL database, React Native client with Expo Development Build, Signal Protocol integration, and WebRTC voice with coturn TURN server.

## Constraints

- **Tech Stack**: Server must use Python 3.11+ with FastAPI + asyncpg + PostgreSQL — chosen for async WebSocket support and proven crypto libraries
- **Client Platform**: React Native with Expo Development Build (NOT Expo Go) — required for native WebRTC and crypto modules
- **Cryptography**: Signal Protocol (libsignal) for messaging — industry-standard Double Ratchet implementation with X3DH key exchange
- **Hosting**: Must run on own server — complete self-hosting, no cloud services or managed databases
- **Platform**: Mobile only (Android) — no desktop or web clients
- **Open Source**: All code must be fully auditable — no proprietary or closed-source dependencies
- **Security**: Server must never see plaintext — zero-knowledge architecture enforced through client-side encryption only
- **Network Exposure**: Cloudflare Tunnel for WebSocket signaling — TURN server requires direct public IP for UDP media traffic

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| **FastAPI + asyncpg + PostgreSQL** | Async WebSocket support, proven crypto libraries, ACID compliance for message queuing | — Pending |
| **Expo Development Build (not Expo Go)** | Native modules required for react-native-webrtc and secure key storage | — Pending |
| **Signal Protocol (libsignal)** | Industry-standard Double Ratchet implementation with X3DH key exchange | — Pending |
| **WebRTC + coturn TURN** | P2P voice calls with NAT traversal fallback for restrictive networks | — Pending |
| **Cloudflare Tunnel for signaling** | Zero-trust network exposure without opening ports (WebSocket only) | — Pending |
| **Direct TURN server exposure** | UDP media traffic cannot be reliably tunneled through Cloudflare | — Pending |
| **Phone number hashing with app salt** | Server stores only hashes, never raw phone numbers, prevents rainbow table attacks | — Pending |
| **react-native-keychain with Android Keystore** | Secure private key storage protected by hardware-backed key storage | — Pending |
| **Voice-only v1** | Reduces complexity and attack surface, ships faster to validate core value | — Pending |

---
*Last updated: 2026-01-21 after initialization*
