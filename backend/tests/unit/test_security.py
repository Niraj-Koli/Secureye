from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core import security
from app.core.security import InvalidTokenError, TokenPurpose

SECRET = "unit-test-secret-key-0123456789abcdef"


def test_password_hash_roundtrip() -> None:
    hashed = security.hash_password("Correct-Horse-9")

    assert hashed.startswith("$argon2")
    assert security.verify_password("Correct-Horse-9", hashed) == (True, None)
    assert security.verify_password("wrong", hashed)[0] is False


def test_verify_against_missing_hash_is_false() -> None:
    assert security.verify_password("anything", None) == (False, None)


def test_access_token_roundtrip() -> None:
    token = security.create_access_token(42, secret=SECRET, ttl=timedelta(minutes=5))

    assert token.expires_in == 300
    assert security.decode_access_token(token.token, secret=SECRET) == 42


def test_expired_access_token_is_rejected() -> None:
    token = security.create_access_token(42, secret=SECRET, ttl=timedelta(seconds=-1))

    with pytest.raises(InvalidTokenError):
        security.decode_access_token(token.token, secret=SECRET)


def test_access_token_signed_with_another_key_is_rejected() -> None:
    token = security.create_access_token(
        42, secret="another-secret-key-0123456789abcdef", ttl=timedelta(minutes=5)
    )

    with pytest.raises(InvalidTokenError):
        security.decode_access_token(token.token, secret=SECRET)


def test_unsigned_token_is_rejected() -> None:
    forged = jwt.encode(
        {
            "iss": "secureye",
            "sub": "1",
            "type": "access",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        key=None,
        algorithm="none",
    )

    with pytest.raises(InvalidTokenError):
        security.decode_access_token(forged, secret=SECRET)


def test_one_time_token_cannot_be_used_as_access_token() -> None:
    token = security.create_one_time_token(
        user_id=1,
        purpose=TokenPurpose.ACTIVATION,
        fingerprint="fp",
        secret=SECRET,
        ttl=timedelta(hours=1),
    )

    with pytest.raises(InvalidTokenError):
        security.decode_access_token(token, secret=SECRET)


def test_one_time_token_is_bound_to_its_purpose() -> None:
    token = security.create_one_time_token(
        user_id=7,
        purpose=TokenPurpose.ACTIVATION,
        fingerprint="abc",
        secret=SECRET,
        ttl=timedelta(hours=1),
    )

    claims = security.decode_one_time_token(token, purpose=TokenPurpose.ACTIVATION, secret=SECRET)
    assert (claims.user_id, claims.fingerprint) == (7, "abc")

    with pytest.raises(InvalidTokenError):
        security.decode_one_time_token(token, purpose=TokenPurpose.PASSWORD_RESET, secret=SECRET)


def test_access_token_cannot_be_used_as_one_time_token() -> None:
    token = security.create_access_token(1, secret=SECRET, ttl=timedelta(minutes=5))

    with pytest.raises(InvalidTokenError):
        security.decode_one_time_token(token.token, purpose=TokenPurpose.ACTIVATION, secret=SECRET)


def test_fingerprint_changes_with_user_state() -> None:
    base = {"user_id": 1, "password_hash": "h1", "is_active": False, "last_login": None}
    fp = security.user_state_fingerprint(**base)  # type: ignore[arg-type]

    assert fp == security.user_state_fingerprint(**base)  # type: ignore[arg-type]
    for change in (
        {"password_hash": "h2"},
        {"is_active": True},
        {"last_login": datetime.now(UTC)},
    ):
        assert fp != security.user_state_fingerprint(**{**base, **change})  # type: ignore[arg-type]


def test_refresh_tokens_are_random_and_hashed() -> None:
    first, second = security.generate_refresh_token(), security.generate_refresh_token()

    assert first != second
    assert len(security.hash_refresh_token(first)) == 64
    assert security.hash_refresh_token(first) == security.hash_refresh_token(first)


@pytest.mark.parametrize("user_id", [1, 42, 10**12])
def test_uid_roundtrip(user_id: int) -> None:
    assert security.decode_uid(security.encode_uid(user_id)) == user_id


@pytest.mark.parametrize("uid", ["", "!!!", "bm90LWFuLWludA"])  # last one is "not-an-int"
def test_malformed_uid_is_rejected(uid: str) -> None:
    with pytest.raises(InvalidTokenError):
        security.decode_uid(uid)
