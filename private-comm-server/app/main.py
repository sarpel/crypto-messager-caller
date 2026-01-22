from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
import asyncpg

from app.config import settings
from app.utils import logging as app_logging
from app.routes import registration, websocket, auth, health
from app.internal import state
from app import maintenance

app_logging.setup_logging()
logger = app_logging.CorrelationLogger(__name__)

auth.set_secret_key(settings.SECRET_KEY)

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_pool = await asyncpg.create_pool(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        database=settings.DB_NAME,
        min_size=settings.DB_POOL_MIN_SIZE,
        max_size=settings.DB_POOL_MAX_SIZE,
    )

    # Set db_pool in state module for other modules to use
    state.set_db_pool(db_pool)
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


# Register all routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(registration.router)
app.include_router(websocket.router)
