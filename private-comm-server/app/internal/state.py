from fastapi import WebSocket
from typing import Dict, Optional
import asyncpg
import logging

logger = logging.getLogger(__name__)

# Global state
db_pool: Optional[asyncpg.Pool] = None
active_connections: Dict[str, WebSocket] = {}

class ConnectionManager:
    def __init__(self):
        self._lock = None

    async def _get_lock(self):
        if self._lock is None:
            import asyncio
            self._lock = asyncio.Lock()
        return self._lock

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        async with await self._get_lock():
            if user_id in active_connections:
                try:
                    await active_connections[user_id].close()
                except:
                    pass
            active_connections[user_id] = websocket
        logger.info(f"User {user_id[:8]}... connected")

    async def disconnect(self, user_id: str):
        async with await self._get_lock():
            if user_id in active_connections:
                del active_connections[user_id]
        logger.info(f"User {user_id[:8]}... disconnected")

    async def send_to_user(self, user_id: str, message: dict) -> bool:
        async with await self._get_lock():
            if user_id in active_connections:
                await active_connections[user_id].send_json(message)
                return True
        return False

manager = ConnectionManager()
