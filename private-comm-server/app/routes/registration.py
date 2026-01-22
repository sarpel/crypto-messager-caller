from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, validator, Field
import asyncpg
from typing import List
import base64
import re
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/v1", tags=["registration"])

router = APIRouter(prefix="/api/v1", tags=["registration"])


class RegisterRequest(BaseModel):
    phone_hash: str = Field(..., min_length=64, max_length=64)
    identity_key: str
    signed_prekey: str
    prekey_signature: str
    one_time_prekeys: List[dict]

    @validator("phone_hash")
    def validate_phone_hash(cls, v):
        if not re.match(r"^[0-9a-f]{64}$", v):
            raise ValueError("phone_hash must be 64-char hex string")
        return v

    @validator("identity_key", "signed_prekey", "prekey_signature")
    def validate_base64(cls, v):
        try:
            base64.b64decode(v, validate=True)
        except Exception:
            raise ValueError("Must be valid Base64 string")
        return v


class KeyBundleResponse(BaseModel):
    identity_key: str
    signed_prekey: str
    prekey_signature: str
    one_time_prekey: dict | None


@router.post("/register")
@limiter.limit("10/hour")
async def register_user(request: Request, req: RegisterRequest):
    from app.main import db_pool

    async with db_pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE phone_hash = $1", req.phone_hash
        )

        if existing:
            await conn.execute(
                """
                UPDATE users SET
                    identity_key = $1,
                    signed_prekey = $2,
                    prekey_signature = $3,
                    last_seen = NOW()
                WHERE phone_hash = $4
            """,
                base64.b64decode(req.identity_key),
                base64.b64decode(req.signed_prekey),
                base64.b64decode(req.prekey_signature),
                req.phone_hash,
            )
            user_id = existing["id"]
        else:
            user_id = await conn.fetchval(
                """
                INSERT INTO users (phone_hash, identity_key, signed_prekey, prekey_signature)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            """,
                req.phone_hash,
                base64.b64decode(req.identity_key),
                base64.b64decode(req.signed_prekey),
                base64.b64decode(req.prekey_signature),
            )

        for otpk in req.one_time_prekeys:
            await conn.execute(
                """
                INSERT INTO one_time_prekeys (user_id, key_id, public_key)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id, key_id) DO UPDATE SET public_key = $3, used = FALSE
            """,
                user_id,
                otpk["key_id"],
                base64.b64decode(otpk["public_key"]),
            )

    return {"status": "registered", "user_id": str(user_id)}


@router.get("/keys/{phone_hash}", response_model=KeyBundleResponse)
@limiter.limit("5/minute")
async def get_key_bundle(request: Request, phone_hash: str):
    from app.main import db_pool

    async with db_pool.acquire() as conn:
        user = await conn.fetchrow(
            """
            SELECT id, identity_key, signed_prekey, prekey_signature
            FROM users WHERE phone_hash = $1
        """,
            phone_hash,
        )

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        otpk = await conn.fetchrow(
            """
            UPDATE one_time_prekeys
            SET used = TRUE
            WHERE id = (
                SELECT id FROM one_time_prekeys
                WHERE user_id = $1 AND NOT used
                ORDER BY created_at
                LIMIT 1
            )
            RETURNING key_id, public_key
        """,
            user["id"],
        )

        return {
            "identity_key": base64.b64encode(user["identity_key"]).decode(),
            "signed_prekey": base64.b64encode(user["signed_prekey"]).decode(),
            "prekey_signature": base64.b64encode(user["prekey_signature"]).decode(),
            "one_time_prekey": {
                "key_id": otpk["key_id"],
                "public_key": base64.b64encode(otpk["public_key"]).decode(),
            }
            if otpk
            else None,
        }
