"""Application configuration.

All settings are sourced from environment variables (twelve-factor,
Railway-first). No secrets are hardcoded.
"""

from functools import lru_cache
from typing import Annotated, List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly typed application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- Identity -----------------------------------------------------------
    PROJECT_NAME: str = "Ágora Civic Intelligence"
    API_PREFIX: str = "/api"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = Field(default="development")

    # --- Database -----------------------------------------------------------
    DATABASE_URL: str = Field(
        default="postgresql+psycopg://agora:agora@localhost:5432/agora",
        description="SQLAlchemy database URL. PostGIS-enabled PostgreSQL.",
    )

    # --- Security -----------------------------------------------------------
    SECRET_KEY: str = Field(default="change-me-in-production")
    ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60)
    # Fernet key for encrypting clave de elector at rest. No default: the app
    # must fail rather than store sensitive data in clear. Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    FERNET_KEY: str = Field(default="")

    # --- Object Storage (S3-compatible) ------------------------------------
    BUCKET_ENDPOINT: str = Field(default="")
    BUCKET_ACCESS_KEY_ID: str = Field(default="")
    BUCKET_SECRET_ACCESS_KEY: str = Field(default="")
    BUCKET_NAME: str = Field(default="")
    BUCKET_REGION: str = Field(default="us-east-1")

    # --- CORS ---------------------------------------------------------------
    # NoDecode: take the raw env value (comma-separated string) instead of
    # letting pydantic-settings JSON-decode it; the validator below splits it.
    CORS_ORIGINS: Annotated[List[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )

    # --- Compliance / Retention ---------------------------------------------
    RETENTION_ENABLED: bool = Field(default=False)
    RETENTION_DAYS_AFTER_ELECTION: int = Field(default=180)
    RETENTION_PURGE_SOFT_DELETED_DAYS: int = Field(default=30)

    # --- Hardening ----------------------------------------------------------
    LOGIN_RATE_LIMIT: str = Field(default="5/minute")
    SECURITY_HEADERS_ENABLED: bool = Field(default=True)

    # --- SPA ----------------------------------------------------------------
    FRONTEND_DIST: str = Field(default="../frontend/dist")

    # --- Validators ---------------------------------------------------------
    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _normalize_db_driver(cls, value: str) -> str:
        """Normalize the SQLAlchemy driver.

        Railway / Heroku-style URLs use ``postgres://`` or ``postgresql://``;
        we standardize on the psycopg 3 driver. SQLite (used in tests) and
        already-qualified URLs are left untouched.
        """
        if not isinstance(value, str):
            return value
        if value.startswith("postgres://"):
            return "postgresql+psycopg://" + value[len("postgres://") :]
        if value.startswith("postgresql://"):
            return "postgresql+psycopg://" + value[len("postgresql://") :]
        return value

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors_origins(cls, value):
        """Accept a comma-separated string or a list value."""
        if isinstance(value, str):
            if not value.strip():
                return []
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()


settings = get_settings()
