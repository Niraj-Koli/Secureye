"""Application settings, loaded from environment variables (and `.env` in development)."""

from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import Field, PostgresDsn, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


_BACKEND_DIR = Path(__file__).resolve().parents[2]

# Only usable outside production; startup fails in production unless SECRET_KEY is set.
_DEV_SECRET_KEY = "dev-only-insecure-secret-key-change-me-0123456789"  # noqa: S105  # nosec B105  # rejected in prod


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Secureye API"
    environment: Environment = Environment.DEVELOPMENT
    log_level: str = "INFO"
    # Emit JSON log lines. Defaults to on in production, off elsewhere (human-readable).
    log_json: bool | None = None

    api_v1_prefix: str = "/api/v1"

    database_url: str = Field(
        default="postgresql+asyncpg://secureye:secureye@localhost:5433/secureye",
        description="SQLAlchemy async URL (postgresql+asyncpg://user:pass@host:port/db).",
    )
    database_echo: bool = False

    redis_url: str = "redis://localhost:6379/0"

    # ------------------------------------------------------------------ auth
    # Signs access tokens and one-time (activation / password reset) tokens.
    secret_key: SecretStr = SecretStr(_DEV_SECRET_KEY)
    access_token_ttl_minutes: int = Field(default=15, gt=0)
    refresh_token_ttl_days: int = Field(default=7, gt=0)
    activation_token_ttl_hours: int = Field(default=48, gt=0)
    password_reset_token_ttl_hours: int = Field(default=2, gt=0)
    refresh_cookie_name: str = "secureye_refresh"
    # Send the refresh cookie over HTTPS only. Defaults to on in production.
    cookie_secure: bool | None = None

    # Base URL of the web app; used to build links in emails.
    frontend_url: str = "http://localhost:5173"

    # ------------------------------------------------------------------ email
    # smtp: deliver via SMTP (Mailpit in development) · console: log only · memory: tests
    email_backend: Literal["smtp", "console", "memory"] = "smtp"
    email_from: str = "Secureye <no-reply@secureye.local>"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    # Upgrade a plain connection with STARTTLS (e.g. port 587) / connect over TLS (port 465).
    smtp_starttls: bool = False
    smtp_tls: bool = False
    smtp_timeout_seconds: float = 10.0
    # Name sent in EHLO. Unset = the machine's FQDN, whose reverse-DNS lookup can take
    # over a second on some hosts (notably Windows); set it to skip the lookup.
    smtp_local_hostname: str | None = None

    # ------------------------------------------------------------------ detection models
    models_dir: Path = _BACKEND_DIR.parent / "ml-models"
    # Image and video detection use the medium model; live detection the small, faster one
    # (same split as the original app).
    image_model_file: str = "bestM.pt"
    live_model_file: str = "bestS.pt"
    # Load and warm up models at startup. Tests turn this off and inject fakes.
    load_models_on_startup: bool = True
    # torch device: "cpu", "cuda", "cuda:0", "mps".
    inference_device: str = "cpu"
    # Inferences allowed to run at once. PyTorch already uses every core per inference.
    inference_concurrency: int = Field(default=1, ge=1)

    # Thresholds from the original image endpoint.
    image_confidence: float = Field(default=0.2, gt=0, lt=1)
    image_iou: float = Field(default=0.3, gt=0, lt=1)

    # Video detection (tracking) thresholds from the original video endpoint.
    video_confidence: float = Field(default=0.5, gt=0, lt=1)
    video_iou: float = Field(default=0.6, gt=0, lt=1)
    video_agnostic_nms: bool = True
    # Frames analysed per second of video (the original sampled 10 fps, assuming 30 fps input).
    video_target_fps: float = Field(default=10.0, gt=0, le=60)
    # Annotated preview frames streamed to the browser while a video is processed.
    video_preview_max_width: int = Field(default=960, ge=160)
    video_preview_jpeg_quality: int = Field(default=70, ge=10, le=95)

    # Live detection. Confidence 0.4 as in the original live mode; IoU 0.45 instead of the old 0.0,
    # which discarded any overlapping same-class objects (e.g. soldiers standing together).
    live_confidence: float = Field(default=0.4, gt=0, lt=1)
    live_iou: float = Field(default=0.45, gt=0, lt=1)
    # Frames analysed per second (server cameras; browser clients are told to send at this rate).
    live_target_fps: float = Field(default=10.0, gt=0, le=30)
    live_max_frame_bytes: int = Field(default=2 * 1024 * 1024, gt=0)
    live_max_frame_pixels: int = Field(default=1920 * 1080, gt=0)
    live_max_session_minutes: int = Field(default=60, gt=0)
    live_max_sessions_per_user: int = Field(default=2, ge=1)
    # The client must authenticate (first message) within this time.
    live_auth_timeout_seconds: float = Field(default=10.0, gt=0)

    # ------------------------------------------------------------------ background jobs
    # celery: video jobs run in a separate worker process (production)
    # inline: they run inside the API process (development without a worker, tests)
    job_runner: Literal["celery", "inline"] = "celery"
    # redis: progress events via Redis pub/sub (needed with celery) · memory: single process only
    job_events_backend: Literal["redis", "memory"] = "redis"
    # Defaults to REDIS_URL.
    celery_broker_url: str | None = None

    # ------------------------------------------------------------------ uploads & storage
    storage_dir: Path = _BACKEND_DIR / "storage"
    max_image_upload_mb: int = Field(default=15, gt=0)
    # Rejects decompression bombs (a tiny file that decodes to a gigantic bitmap).
    max_image_pixels: int = Field(default=50_000_000, gt=0)
    max_video_upload_mb: int = Field(default=500, gt=0)
    max_video_duration_seconds: int = Field(default=600, gt=0)
    max_video_pixels: int = Field(default=3840 * 2160, gt=0)  # 4K
    # Lifetime of signed links to stored files (images shown in the browser).
    file_url_ttl_seconds: int = Field(default=3600, gt=0)

    # ------------------------------------------------------------------ admin
    # Superuser-only admin site at /admin (SQLAdmin).
    admin_enabled: bool = True

    # ------------------------------------------------------------------ rate limiting
    rate_limit_enabled: bool = True
    # `limits` storage URI. Defaults to Redis (shared across workers); "async+memory://" in tests.
    rate_limit_storage_url: str | None = None

    # Comma-separated in the environment, e.g. "http://localhost:5173,https://app.example.com".
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url")
    @classmethod
    def _validate_database_url(cls, value: str) -> str:
        PostgresDsn(value)  # validates scheme/host/port/credentials shape
        return value

    @field_validator("smtp_username", "smtp_password", mode="before")
    @classmethod
    def _empty_means_unset(cls, value: object) -> object:
        # Docker Compose passes unset variables as empty strings; no credentials means no login.
        return None if value == "" else value

    @field_validator("frontend_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @model_validator(mode="after")
    def _require_real_secret_in_production(self) -> Self:
        if self.is_production:
            key = self.secret_key.get_secret_value()
            if key == _DEV_SECRET_KEY or len(key) < 32:
                raise ValueError("SECRET_KEY must be set to a random value of 32+ characters.")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment is Environment.PRODUCTION

    @property
    def use_json_logs(self) -> bool:
        return self.is_production if self.log_json is None else self.log_json

    @property
    def use_secure_cookies(self) -> bool:
        return self.is_production if self.cookie_secure is None else self.cookie_secure

    @property
    def broker_url(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def rate_limit_storage(self) -> str:
        if self.rate_limit_storage_url:
            return self.rate_limit_storage_url
        return "async+" + self.redis_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
