"""Cryptographic primitives: password hashing, access tokens, one-time tokens, refresh tokens.

Nothing here touches the database or HTTP; services compose these functions.
"""

import base64
import binascii
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

_JWT_ALGORITHM = "HS256"
_ISSUER = "secureye"

_password_hasher = PasswordHash((Argon2Hasher(),))
# Verified against when the email is unknown, so login takes the same time either way.
_DUMMY_HASH = _password_hasher.hash(secrets.token_urlsafe(16))


class InvalidTokenError(Exception):
    """Token is malformed, expired, tampered with, or meant for something else."""


# ------------------------------------------------------------------ passwords


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> tuple[bool, str | None]:
    """Return (is_valid, new_hash). `new_hash` is set when the stored hash should be upgraded."""
    if password_hash is None:
        _password_hasher.verify(password, _DUMMY_HASH)
        return False, None
    return _password_hasher.verify_and_update(password, password_hash)


# ------------------------------------------------------------------ access tokens


@dataclass(frozen=True, slots=True)
class AccessToken:
    token: str
    expires_in: int  # seconds


def create_access_token(user_id: int, *, secret: str, ttl: timedelta) -> AccessToken:
    now = datetime.now(UTC)
    claims = {
        "iss": _ISSUER,
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + ttl,
        "jti": secrets.token_hex(8),
    }
    token = jwt.encode(claims, secret, algorithm=_JWT_ALGORITHM)
    return AccessToken(token=token, expires_in=int(ttl.total_seconds()))


def decode_access_token(token: str, *, secret: str) -> int:
    """Return the user id in a valid access token."""
    claims = _decode(token, secret)
    if claims.get("type") != "access":
        raise InvalidTokenError("Not an access token.")
    return _user_id(claims)


# ------------------------------------------------------------------ one-time tokens


class TokenPurpose(StrEnum):
    ACTIVATION = "activation"
    PASSWORD_RESET = "password_reset"  # noqa: S105  # nosec B105  # a purpose name, not a secret


def user_state_fingerprint(
    *, user_id: int, password_hash: str, is_active: bool, last_login: datetime | None
) -> str:
    """Digest of the user state a one-time token is bound to.

    Activating the account, logging in, or changing the password changes the fingerprint,
    so each emailed token works exactly once without storing it anywhere.
    """
    state = f"{user_id}|{password_hash}|{is_active}|{last_login.timestamp() if last_login else ''}"
    return hashlib.sha256(state.encode()).hexdigest()[:32]


def create_one_time_token(
    *, user_id: int, purpose: TokenPurpose, fingerprint: str, secret: str, ttl: timedelta
) -> str:
    now = datetime.now(UTC)
    claims = {
        "iss": _ISSUER,
        "sub": str(user_id),
        "type": purpose.value,
        "fp": fingerprint,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(claims, secret, algorithm=_JWT_ALGORITHM)


@dataclass(frozen=True, slots=True)
class OneTimeTokenClaims:
    user_id: int
    fingerprint: str


def decode_one_time_token(token: str, *, purpose: TokenPurpose, secret: str) -> OneTimeTokenClaims:
    claims = _decode(token, secret)
    fingerprint = claims.get("fp")
    if claims.get("type") != purpose.value or not isinstance(fingerprint, str):
        raise InvalidTokenError("Token was issued for a different purpose.")
    return OneTimeTokenClaims(user_id=_user_id(claims), fingerprint=fingerprint)


def fingerprints_match(expected: str, actual: str) -> bool:
    return hmac.compare_digest(expected, actual)


# ------------------------------------------------------------------ refresh tokens


def generate_refresh_token() -> str:
    """Opaque random token handed to the client; only its hash is stored."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ------------------------------------------------------------------ uid encoding


def encode_uid(user_id: int) -> str:
    """URL-safe user id for email links (`/activate/{uid}/{token}`), as Djoser produced."""
    return base64.urlsafe_b64encode(str(user_id).encode()).decode().rstrip("=")


def decode_uid(uid: str) -> int:
    try:
        padded = uid + "=" * (-len(uid) % 4)
        return int(base64.urlsafe_b64decode(padded.encode()).decode())
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise InvalidTokenError("Malformed uid.") from exc


# ------------------------------------------------------------------ helpers


def _decode(token: str, secret: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=[_JWT_ALGORITHM],
            issuer=_ISSUER,
            options={"require": ["exp", "iat", "sub", "type"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc


def _user_id(claims: dict[str, Any]) -> int:
    try:
        return int(claims["sub"])
    except (KeyError, ValueError) as exc:
        raise InvalidTokenError("Invalid subject.") from exc
