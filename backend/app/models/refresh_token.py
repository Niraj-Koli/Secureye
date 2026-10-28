import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RefreshToken(Base):
    """A refresh token issued at login, stored only as a SHA-256 hash.

    Tokens are rotated on every use. All tokens descending from one login share a `family_id`;
    presenting an already-rotated token (a sign of theft) revokes the whole family.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    family_id: Mapped[uuid.UUID] = mapped_column(index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    expires_at: Mapped[datetime]
    # Set when the token is exchanged for a new one or explicitly revoked (logout, reset).
    revoked_at: Mapped[datetime | None]
