from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from typing import Optional
import logging

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])

SECRET_KEY: Optional[str] = None


def set_secret_key(key: str):
    global SECRET_KEY
    SECRET_KEY = key


def create_access_token(user_id: str) -> str:
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY not configured")

    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=5),
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


@router.post("/token")
@limiter.limit("10/minute")
async def get_websocket_token(request: Request, phone_hash: str):
    """Get a short-lived JWT token for WebSocket authentication.
    
    Requires phone_hash to verify user exists before issuing token.
    """
    if not SECRET_KEY:
        raise HTTPException(status_code=500, detail="Server not configured properly")

    # Import here to avoid circular imports
    from app.internal.state import db_pool

    if not db_pool:
        raise HTTPException(status_code=503, detail="Database not available")

    # Verify user exists before issuing token
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id FROM users WHERE phone_hash = $1", phone_hash
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

    user_id = str(user["id"])
    token = create_access_token(user_id)
    return {"token": token, "expires_in": 300, "user_id": user_id}
