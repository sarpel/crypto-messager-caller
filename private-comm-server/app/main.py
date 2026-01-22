from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    HTTPException,
    Depends,
    Request,
)
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
import asyncpg
import json
import os
from typing import Dict, Optional
from datetime import datetime
import logging
from app.config import settings
from app.utils import logging as app_logging
from app.routes import registration, websocket, auth, health
from app import maintenance

app_logging.setup_logging()
logger = app_logging.CorrelationLogger(__name__)

auth.set_secret_key(settings.SECRET_KEY)

limiter = Limiter(key_func=get_remote_address)

db_pool: Optional[asyncpg.Pool] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    db_pool = await asyncpg.create_pool(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        database=settings.DB_NAME,
        min_size=settings.DB_POOL_MIN_SIZE,
        max_size=settings.DB_POOL_MAX_SIZE,
    )

    maintenance.set_db_pool(db_pool)
    maintenance.start_scheduler()

    yield

    await db_pool.close()
    maintenance.stop_scheduler()


app = FastAPI(title="Private Communication Server", lifespan=lifespan)

cors_origins = settings.CORS_ORIGINS.split(",")

app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exception_handler(request, exc):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded", "retry_after": exc.retry_after},
    )


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
