from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            phone_hash VARCHAR(64) UNIQUE NOT NULL,
            identity_key BYTEA NOT NULL,
            signed_prekey BYTEA NOT NULL,
            prekey_signature BYTEA NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            last_seen TIMESTAMP DEFAULT NOW()
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS one_time_prekeys (
            id SERIAL PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            key_id INTEGER NOT NULL,
            public_key BYTEA NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, key_id)
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS pending_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
            sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
            encrypted_payload BYTEA NOT NULL,
            timestamp TIMESTAMP DEFAULT NOW()
        );
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS push_tokens (
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(512) NOT NULL,
            platform VARCHAR(10) DEFAULT 'android',
            PRIMARY KEY (user_id, token)
        );
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_pending_messages_recipient
        ON pending_messages(recipient_id);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_pending_messages_delivery
        ON pending_messages(recipient_id, timestamp DESC);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_one_time_prekeys_available
        ON one_time_prekeys(user_id, used) WHERE NOT used;
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_one_time_prekeys_fresh
        ON one_time_prekeys(user_id, created_at) WHERE NOT used;
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_one_time_prekeys_fresh;")
    op.execute("DROP INDEX IF EXISTS idx_one_time_prekeys_available;")
    op.execute("DROP INDEX IF EXISTS idx_pending_messages_delivery;")
    op.execute("DROP INDEX IF EXISTS idx_pending_messages_recipient;")
    op.execute("DROP TABLE IF EXISTS push_tokens;")
    op.execute("DROP TABLE IF EXISTS pending_messages;")
    op.execute("DROP TABLE IF EXISTS one_time_prekeys;")
    op.execute("DROP TABLE IF EXISTS users;")
