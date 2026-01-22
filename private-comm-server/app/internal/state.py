from fastapi import WebSocket, HTTPException
from typing import Dict, Optional
import asyncpg
import asyncio
import logging

logger = logging.getLogger(__name__)

# Global state
db_pool: Optional[asyncpg.Pool] = None
active_connections: Dict[str, WebSocket] = {}
MAX_CONNECTIONS = 10000


def set_db_pool(pool: asyncpg.Pool) -> None:
    """Set the database pool from main.py lifespan"""
    global db_pool
    db_pool = pool


class ConnectionManager:
    def __init__(self):
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            if len(active_connections) >= MAX_CONNECTIONS:
                await websocket.close(code=1013, reason="Server at capacity")
                raise HTTPException(status_code=503, detail="Server at capacity")

            if user_id in active_connections:
                try:
                    await active_connections[user_id].close()
                except (ConnectionError, RuntimeError) as e:
                    logger.debug(
                        f"Error closing stale connection for {user_id[:8]}...: {type(e).__name__}"
                    )
            active_connections[user_id] = websocket
        logger.info(f"User {user_id[:8]}... connected")

    async def disconnect(self, user_id: str):
        async with self._lock:
            if user_id in active_connections:
                del active_connections[user_id]
        logger.info(f"User {user_id[:8]}... disconnected")

    async def send_to_user(self, user_id: str, message: dict) -> bool:
        # Get connection while holding lock, then send outside lock
        async with self._lock:
            ws = active_connections.get(user_id)

        if ws:
            try:
                await ws.send_json(message)
                return True
            except (ConnectionError, RuntimeError) as e:
                logger.debug(f"Send failed for {user_id[:8]}...: {type(e).__name__}")
                return False
        return False


manager = ConnectionManager()
