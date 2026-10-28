from datetime import datetime

from sqlalchemy import String, false
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    # Always stored lower-cased (see services.auth.normalize_email), so uniqueness is
    # case-insensitive without needing citext.
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=False, server_default=false())
    is_staff: Mapped[bool] = mapped_column(default=False, server_default=false())
    is_superuser: Mapped[bool] = mapped_column(default=False, server_default=false())
    last_login: Mapped[datetime | None]

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"
