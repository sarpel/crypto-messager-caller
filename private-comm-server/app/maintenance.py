import asyncpg
import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.config import settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

db_pool = None


def set_db_pool(pool):
    global db_pool
    db_pool = pool


async def cleanup_old_messages():
    """Delete pending messages older than 30 days"""
    if not db_pool:
        logger.warning("Database pool not available for cleanup")
        return

    try:
        async with db_pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM pending_messages WHERE timestamp < NOW() - INTERVAL '30 days'"
            )
            deleted_count = result.split()[-1]
            if deleted_count != "0":
                logger.info(f"Cleaned up {deleted_count} old pending messages")
    except Exception as e:
        logger.error(f"Error during message cleanup: {e}")


async def cleanup_unused_prekeys():
    """Delete used one-time prekeys older than 7 days"""
    if not db_pool:
        logger.warning("Database pool not available for prekey cleanup")
        return

    try:
        async with db_pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM one_time_prekeys
                WHERE used = TRUE AND created_at < NOW() - INTERVAL '7 days'
                """
            )
            deleted_count = result.split()[-1]
            if deleted_count != "0":
                logger.info(f"Cleaned up {deleted_count} used prekeys")
    except Exception as e:
        logger.error(f"Error during prekey cleanup: {e}")


def start_scheduler():
    """Start the maintenance scheduler"""
    if settings.ENVIRONMENT == "test":
        logger.info("Skipping scheduler in test environment")
        return

    scheduler.add_job(
        cleanup_old_messages,
        "cron",
        hour=2,
        minute=0,
        id="message_cleanup",
        replace_existing=True,
    )

    scheduler.add_job(
        cleanup_unused_prekeys,
        "cron",
        hour=3,
        minute=0,
        id="prekey_cleanup",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Maintenance scheduler started")


def stop_scheduler():
    """Stop the maintenance scheduler"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Maintenance scheduler stopped")
