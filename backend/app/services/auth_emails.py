"""Builds the account emails. Link formats match the original app's frontend routes."""

from app.core.config import Settings
from app.models.user import User
from app.services.email import EmailMessage, render_email


def activation_email(user: User, uid: str, token: str, settings: Settings) -> EmailMessage:
    return render_email(
        "activation",
        to=user.email,
        subject="Activate your Secureye account",
        name=user.name,
        link=f"{settings.frontend_url}/activate/{uid}/{token}",
        expires_hours=settings.activation_token_ttl_hours,
    )


def password_reset_email(user: User, uid: str, token: str, settings: Settings) -> EmailMessage:
    return render_email(
        "password_reset",
        to=user.email,
        subject="Reset your Secureye password",
        name=user.name,
        link=f"{settings.frontend_url}/password/reset/confirm/{uid}/{token}",
        expires_hours=settings.password_reset_token_ttl_hours,
    )


def password_changed_email(user: User, settings: Settings) -> EmailMessage:
    return render_email(
        "password_changed",
        to=user.email,
        subject="Your Secureye password was changed",
        name=user.name,
        reset_link=f"{settings.frontend_url}/reset-password",
    )
