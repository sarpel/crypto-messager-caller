from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.main import manager, db_pool, active_connections
from app.routes.auth import decode_websocket_token
import json
import base64
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT authentication token"),
):
    user_id = decode_websocket_token(token)
    if not user_id:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    await manager.connect(user_id, websocket)

    try:
        async with db_pool.acquire() as conn:
            pending = await conn.fetch(
                """
                SELECT id, sender_id, encrypted_payload, timestamp
                FROM pending_messages
                WHERE recipient_id = $1
                ORDER BY timestamp
            """,
                user_id,
            )

            for msg in pending:
                await websocket.send_json(
                    {
                        "type": "encrypted_message",
                        "sender_id": str(msg["sender_id"]),
                        "payload": base64.b64encode(msg["encrypted_payload"]).decode(),
                        "timestamp": msg["timestamp"].isoformat(),
                    }
                )
                await conn.execute(
                    "DELETE FROM pending_messages WHERE id = $1", msg["id"]
                )

        while True:
            data = await websocket.receive_json()
            await handle_message(user_id, data)

    except WebSocketDisconnect:
        manager.disconnect(user_id)


async def handle_message(sender_id: str, data: dict):
    msg_type = data.get("type")
    recipient_id = data.get("recipient_id")

    if not msg_type or not recipient_id:
        return

    if msg_type == "encrypted_message":
        payload = data.get("payload")
        if not payload:
            return

        delivered = await manager.send_to_user(
            recipient_id,
            {
                "type": "encrypted_message",
                "sender_id": sender_id,
                "payload": payload,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

        if not delivered:
            async with db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO pending_messages (recipient_id, sender_id, encrypted_payload)
                    VALUES ($1, $2, $3)
                """,
                    recipient_id,
                    sender_id,
                    base64.b64decode(payload),
                )

    elif msg_type in [
        "call_offer",
        "call_answer",
        "ice_candidate",
        "call_reject",
        "call_end",
    ]:
        await manager.send_to_user(
            recipient_id,
            {
                "type": msg_type,
                "sender_id": sender_id,
                **{k: v for k, v in data.items() if k not in ["type", "recipient_id"]},
            },
        )
