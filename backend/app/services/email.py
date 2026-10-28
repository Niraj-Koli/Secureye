"""Outgoing email: rendering (Jinja2) and delivery (pluggable senders)."""

from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from pathlib import Path
from typing import Protocol

import aiosmtplib
import structlog
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.core.config import Settings

logger = structlog.get_logger(__name__)

_TEMPLATES = Environment(
    loader=FileSystemLoader(Path(__file__).resolve().parent.parent / "templates" / "email"),
    autoescape=select_autoescape(["html"]),
    undefined=StrictUndefined,
)


@dataclass(frozen=True, slots=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: str


def render_email(template: str, *, to: str, subject: str, **context: object) -> EmailMessage:
    """Render `<template>.txt` and `<template>.html` from app/templates/email."""
    context = {"subject": subject, **context}
    return EmailMessage(
        to=to,
        subject=subject,
        text=_TEMPLATES.get_template(f"{template}.txt").render(context),
        html=_TEMPLATES.get_template(f"{template}.html").render(context),
    )


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class SmtpEmailSender:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def send(self, message: EmailMessage) -> None:
        s = self._settings
        mime = MimeMessage()
        mime["From"] = s.email_from
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime.set_content(message.text)
        mime.add_alternative(message.html, subtype="html")

        await aiosmtplib.send(
            mime,
            hostname=s.smtp_host,
            port=s.smtp_port,
            username=s.smtp_username,
            password=s.smtp_password.get_secret_value() if s.smtp_password else None,
            start_tls=s.smtp_starttls,
            use_tls=s.smtp_tls,
            timeout=s.smtp_timeout_seconds,
            local_hostname=s.smtp_local_hostname,
        )


class ConsoleEmailSender:
    """Logs emails instead of sending them; useful without an SMTP server."""

    async def send(self, message: EmailMessage) -> None:
        logger.info("email_console", to=message.to, subject=message.subject, body=message.text)


class InMemoryEmailSender:
    """Collects emails in `outbox`; used by tests."""

    def __init__(self) -> None:
        self.outbox: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.outbox.append(message)


def create_email_sender(settings: Settings) -> EmailSender:
    match settings.email_backend:
        case "smtp":
            return SmtpEmailSender(settings)
        case "console":
            return ConsoleEmailSender()
        case "memory":
            return InMemoryEmailSender()


async def send_safely(sender: EmailSender, message: EmailMessage) -> None:
    """Deliver from a background task: failures are logged, never raised to the client."""
    try:
        await sender.send(message)
        logger.info("email_sent", to=message.to, subject=message.subject)
    except Exception:
        logger.exception("email_send_failed", to=message.to, subject=message.subject)
