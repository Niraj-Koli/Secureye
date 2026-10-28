"""Account lifecycle: signup, activation, login, refresh-token rotation, logout, password reset."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import Settings
from app.core.errors import AppError
from app.core.password_policy import password_problems
from app.core.security import AccessToken, InvalidTokenError, TokenPurpose
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import SignupRequest

logger = structlog.get_logger(__name__)


class EmailAlreadyRegisteredError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "email_already_registered"


class InvalidCredentialsError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "invalid_credentials"


class InvalidLinkError(AppError):
    code = "invalid_or_expired_link"


class AlreadyActiveError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "already_active"


class InvalidRefreshTokenError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "invalid_refresh_token"


class WeakPasswordError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "weak_password"


def normalize_email(email: str) -> str:
    return email.strip().lower()


@dataclass(frozen=True, slots=True)
class Session:
    """Credentials issued at login/refresh: the access token and the raw refresh token."""

    user: User
    access: AccessToken
    refresh_token: str


class AuthService:
    def __init__(self, db: AsyncSession, settings: Settings) -> None:
        self._db = db
        self._settings = settings
        self._secret = settings.secret_key.get_secret_value()

    # ------------------------------------------------------------------ signup / activation

    async def signup(self, data: SignupRequest) -> User:
        email = normalize_email(data.email)
        if await self._get_by_email(email) is not None:
            raise EmailAlreadyRegisteredError("An account with this email already exists.")

        user = User(
            name=data.name,
            email=email,
            password_hash=security.hash_password(data.password),
            is_active=False,
        )
        self._db.add(user)
        try:
            await self._db.commit()
        except IntegrityError as exc:  # concurrent signup with the same email
            await self._db.rollback()
            raise EmailAlreadyRegisteredError("An account with this email already exists.") from exc

        logger.info("user_signed_up", user_id=user.id)
        return user

    def one_time_token(self, user: User, purpose: TokenPurpose) -> tuple[str, str]:
        """Return (uid, token) for an emailed link."""
        ttl_hours = (
            self._settings.activation_token_ttl_hours
            if purpose is TokenPurpose.ACTIVATION
            else self._settings.password_reset_token_ttl_hours
        )
        token = security.create_one_time_token(
            user_id=user.id,
            purpose=purpose,
            fingerprint=_fingerprint(user),
            secret=self._secret,
            ttl=timedelta(hours=ttl_hours),
        )
        return security.encode_uid(user.id), token

    async def activate(self, uid: str, token: str) -> User:
        user = await self._user_from_link(uid, token, TokenPurpose.ACTIVATION)
        if user.is_active:
            raise AlreadyActiveError("This account is already active.")
        user.is_active = True
        await self._db.commit()
        logger.info("user_activated", user_id=user.id)
        return user

    async def inactive_user_by_email(self, email: str) -> User | None:
        """For resending activation emails; None when unknown or already active."""
        user = await self._get_by_email(normalize_email(email))
        return user if user is not None and not user.is_active else None

    # ------------------------------------------------------------------ login / sessions

    async def authenticate(self, email: str, password: str) -> User:
        user = await self._get_by_email(normalize_email(email))
        valid, new_hash = security.verify_password(
            password, user.password_hash if user is not None else None
        )
        # Same response for unknown email, wrong password and inactive account, as before.
        if user is None or not valid or not user.is_active:
            raise InvalidCredentialsError("Invalid email or password.")

        if new_hash is not None:
            user.password_hash = new_hash
        user.last_login = datetime.now(UTC)
        await self._db.commit()
        return user

    async def start_session(self, user: User) -> Session:
        return await self._issue(user, family_id=uuid.uuid4())

    async def refresh_session(self, refresh_token: str) -> Session:
        token_hash = security.hash_refresh_token(refresh_token)
        stored = await self._db.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
        )
        now = datetime.now(UTC)

        if stored is None:
            raise InvalidRefreshTokenError("Session expired. Please log in again.")
        if stored.revoked_at is not None:
            # A rotated token came back: someone else holds a copy. Kill the whole session.
            await self._revoke_family(stored.family_id, now)
            await self._db.commit()
            logger.warning("refresh_token_reuse_detected", user_id=stored.user_id)
            raise InvalidRefreshTokenError("Session expired. Please log in again.")
        if stored.expires_at <= now:
            raise InvalidRefreshTokenError("Session expired. Please log in again.")

        user = await self._db.get(User, stored.user_id)
        if user is None or not user.is_active:
            raise InvalidRefreshTokenError("Session expired. Please log in again.")

        stored.revoked_at = now
        return await self._issue(user, family_id=stored.family_id)

    async def end_session(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        stored = await self._db.scalar(
            select(RefreshToken).where(
                RefreshToken.token_hash == security.hash_refresh_token(refresh_token)
            )
        )
        if stored is not None:
            await self._revoke_family(stored.family_id, datetime.now(UTC))
            await self._db.commit()

    # ------------------------------------------------------------------ password reset

    async def active_user_by_email(self, email: str) -> User | None:
        user = await self._get_by_email(normalize_email(email))
        return user if user is not None and user.is_active else None

    async def reset_password(self, uid: str, token: str, new_password: str) -> User:
        user = await self._user_from_link(uid, token, TokenPurpose.PASSWORD_RESET)
        problems = password_problems(new_password, name=user.name, email=user.email)
        if problems:
            raise WeakPasswordError(" ".join(problems))

        user.password_hash = security.hash_password(new_password)
        # Changing the password signs the user out everywhere.
        await self._db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        await self._db.commit()
        logger.info("password_reset", user_id=user.id)
        return user

    # ------------------------------------------------------------------ internals

    async def _get_by_email(self, email: str) -> User | None:
        return await self._db.scalar(select(User).where(User.email == email))

    async def _user_from_link(self, uid: str, token: str, purpose: TokenPurpose) -> User:
        message = "This link is invalid or has expired."
        try:
            user_id = security.decode_uid(uid)
            claims = security.decode_one_time_token(token, purpose=purpose, secret=self._secret)
        except InvalidTokenError as exc:
            raise InvalidLinkError(message) from exc

        user = await self._db.get(User, user_id)
        if user is None or claims.user_id != user.id:
            raise InvalidLinkError(message)
        if not security.fingerprints_match(claims.fingerprint, _fingerprint(user)):
            # Already used: the account state it was bound to has changed.
            if purpose is TokenPurpose.ACTIVATION and user.is_active:
                raise AlreadyActiveError("This account is already active.")
            raise InvalidLinkError(message)
        return user

    async def _issue(self, user: User, *, family_id: uuid.UUID) -> Session:
        raw = security.generate_refresh_token()
        self._db.add(
            RefreshToken(
                user_id=user.id,
                token_hash=security.hash_refresh_token(raw),
                family_id=family_id,
                expires_at=datetime.now(UTC)
                + timedelta(days=self._settings.refresh_token_ttl_days),
            )
        )
        await self._db.commit()
        access = security.create_access_token(
            user.id,
            secret=self._secret,
            ttl=timedelta(minutes=self._settings.access_token_ttl_minutes),
        )
        return Session(user=user, access=access, refresh_token=raw)

    async def _revoke_family(self, family_id: uuid.UUID, now: datetime) -> None:
        await self._db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )


def _fingerprint(user: User) -> str:
    return security.user_state_fingerprint(
        user_id=user.id,
        password_hash=user.password_hash,
        is_active=user.is_active,
        last_login=user.last_login,
    )
