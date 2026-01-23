from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from typing import Optional
from pydantic import BaseModel, Field
import logging
import ed25519

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])

SECRET_KEY: Optional[str] = None


def set_secret_key(key: str):
    global SECRET_KEY
    SECRET_KEY = key


def verify_ed25519_signature(
    public_key_bytes: bytes, message: bytes, signature_bytes: bytes
) -> bool:
    try:
        public_key = ed25519.VerifyingKey(public_key_bytes)
        return public_key.verify(signature_bytes, message)
    except Exception:
        logger.warning("Signature verification failed")
        return False


def create_access_token(user_id: str) -> str:
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY not configured")

    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=30),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_websocket_token(token: str) -> Optional[str]:
    if not SECRET_KEY:
        logger.error("SECRET_KEY not configured")
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            return None
        return user_id
    except JWTError as e:
        logger.warning(f"Invalid JWT token: {e}")
        return None


class TokenRequest(BaseModel):
    phone_hash: str = Field(..., min_length=64, max_length=64)
    nonce: str = Field(..., min_length=32, max_length=64)
    signature: str = Field(..., min_length=128, max_length=128)


@router.post("/token")
@limiter.limit("10/minute")
async def get_websocket_token(request: Request, token_req: TokenRequest):
    """Get a short-lived JWT token for WebSocket authentication.

    Requires phone_hash, nonce, and signature proving ownership of identity key.
    Client signs the nonce with their Ed25519 private key.
    """
    if not SECRET_KEY:
        raise HTTPException(status_code=500, detail="Server not configured properly")

    # Import here to avoid circular imports
    from app.internal.state import db_pool

    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    async with db_pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, identity_key FROM users WHERE phone_hash = $1",
            token_req.phone_hash,
        )
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        try:
            signature_bytes = bytes.fromhex(token_req.signature)
            message_bytes = token_req.nonce.encode("utf-8")

            if not verify_ed25519_signature(
                user["identity_key"], message_bytes, signature_bytes
            ):
                logger.warning(
                    f"Invalid signature for user {token_req.phone_hash[:8]}..."
                )
                raise HTTPException(status_code=401, detail="Invalid signature")

        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid signature format")
        except Exception as e:
            logger.error(f"Signature verification error: {e}")
            raise HTTPException(status_code=500, detail="Verification failed")

        user_id = str(user["id"])
        token = create_access_token(user_id)
        return {"token": token, "expires_in": 1800, "user_id": user_id}
