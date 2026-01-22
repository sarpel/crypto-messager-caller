from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/health", tags=["health"])


@router.get("/")
async def health_check():
    """Health check for monitoring and load balancers"""
    from app.main import db_pool

    health = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "database": "unknown",
        },
    }

    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            health["services"]["database"] = "connected"
        except Exception as e:
            health["status"] = "degraded"
            health["services"]["database"] = f"error: {str(e)}"
            logger.error(f"Health check failed for database: {e}")
    else:
        health["status"] = "degraded"
        health["services"]["database"] = "not initialized"

    status_code = 200 if health["status"] == "healthy" else 503

    return health
