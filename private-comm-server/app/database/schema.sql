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
CREATE INDEX idx_pending_messages_delivery ON pending_messages(recipient_id, timestamp DESC);
CREATE INDEX idx_pending_messages_timestamp ON pending_messages(timestamp);
CREATE INDEX idx_one_time_prekeys_available ON one_time_prekeys(user_id, used) WHERE NOT used;
CREATE INDEX idx_one_time_prekeys_fresh ON one_time_prekeys(user_id, created_at) WHERE NOT used;
