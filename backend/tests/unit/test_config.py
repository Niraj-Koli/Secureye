import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Environment, Settings


def make(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def test_cors_origins_are_parsed_from_comma_separated_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://a.example, https://b.example ,")

    assert make().cors_origins == ["http://a.example", "https://b.example"]


def test_invalid_database_url_is_rejected() -> None:
    with pytest.raises(ValidationError):
        make(database_url="not-a-url")


@pytest.mark.parametrize(
    ("environment", "log_json", "expected"),
    [
        (Environment.PRODUCTION, None, True),
        (Environment.DEVELOPMENT, None, False),
        (Environment.DEVELOPMENT, True, True),
        (Environment.PRODUCTION, False, False),
    ],
)
def test_json_logs_default_to_production_only(
    environment: Environment, log_json: bool | None, expected: bool
) -> None:
    settings = make(environment=environment, log_json=log_json, secret_key=SecretStr("x" * 40))

    assert settings.use_json_logs is expected


def test_production_refuses_the_development_secret_key() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        make(environment=Environment.PRODUCTION)


def test_production_refuses_a_short_secret_key() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        make(environment=Environment.PRODUCTION, secret_key=SecretStr("short"))


def test_production_defaults_to_secure_cookies() -> None:
    prod = make(environment=Environment.PRODUCTION, secret_key=SecretStr("x" * 40))

    assert prod.use_secure_cookies is True
    assert make().use_secure_cookies is False


def test_rate_limit_storage_defaults_to_redis() -> None:
    assert make(redis_url="redis://cache:6379/2").rate_limit_storage == "async+redis://cache:6379/2"
    assert make(rate_limit_storage_url="async+memory://").rate_limit_storage == "async+memory://"


def test_frontend_url_trailing_slash_is_removed() -> None:
    assert make(frontend_url="https://app.example/").frontend_url == "https://app.example"


def test_empty_smtp_credentials_mean_no_login() -> None:
    settings = Settings(_env_file=None, smtp_username="", smtp_password="")

    assert settings.smtp_username is None
    assert settings.smtp_password is None
