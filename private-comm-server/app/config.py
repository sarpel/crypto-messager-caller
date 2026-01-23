import os
from typing import Optional


class Settings:
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", "5432"))
    DB_USER: str = os.getenv("DB_USER", "privcomm")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_NAME: str = os.getenv("DB_NAME", "privcomm")

    CLOUDFLARE_TUNNEL_ID: Optional[str] = os.getenv("CLOUDFLARE_TUNNEL_ID")
    CLOUDFLARE_CREDENTIALS_FILE: str = os.getenv(
        "CLOUDFLARE_CREDENTIALS_FILE", "/root/.cloudflared/your-tunnel-id.json"
    )

    TURN_USERNAME: str = os.getenv(
        "TURN_USERNAME", "turnuser"
    )  # Must be overridden in production
    TURN_PASSWORD: str = os.getenv(
        "TURN_PASSWORD", "turnpassword"
    )  # Must be overridden in production
    TURN_HOST: str = os.getenv("TURN_HOST", "turn.yourdomain.com")
    TURN_PORT: int = int(os.getenv("TURN_PORT", "3478"))
    TURN_TLS_PORT: int = int(os.getenv("TURN_TLS_PORT", "5349"))

    SECRET_KEY: str = os.getenv("SECRET_KEY", "")

    if not SECRET_KEY:
        raise ValueError("SECRET_KEY environment variable is required")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    DB_POOL_MIN_SIZE: int = int(os.getenv("DB_POOL_MIN_SIZE", "5"))
    DB_POOL_MAX_SIZE: int = int(os.getenv("DB_POOL_MAX_SIZE", "20"))

    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:19006")

    def validate_production_settings(self) -> None:
        """Validate that required settings are set in production"""
        if self.ENVIRONMENT == "production":
            if not self.SECRET_KEY:
                raise ValueError("SECRET_KEY must be set in production environment")
            if self.TURN_PASSWORD == "turnpassword":
                raise ValueError("TURN_PASSWORD must be set in production environment")


settings = Settings()
settings.validate_production_settings()
