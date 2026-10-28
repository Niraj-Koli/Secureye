from pydantic import SecretStr

from app.core.config import Settings
from app.models.user import User
from app.services import auth_emails
from app.services.email import (
    ConsoleEmailSender,
    InMemoryEmailSender,
    SmtpEmailSender,
    create_email_sender,
)

SETTINGS = Settings(
    _env_file=None,
    frontend_url="https://app.example",
    secret_key=SecretStr("x" * 40),
)


def _user() -> User:
    return User(id=5, name="Jane <b>Doe</b>", email="jane@example.com", password_hash="h")


def test_activation_email_links_to_frontend_route() -> None:
    message = auth_emails.activation_email(_user(), "NQ", "tok.en.sig", SETTINGS)

    link = "https://app.example/activate/NQ/tok.en.sig"
    assert message.to == "jane@example.com"
    assert link in message.text
    assert link in message.html
    assert "48 hours" in message.text


def test_password_reset_email_links_to_frontend_route() -> None:
    message = auth_emails.password_reset_email(_user(), "NQ", "tok", SETTINGS)

    assert "https://app.example/password/reset/confirm/NQ/tok" in message.text
    assert "2 hours" in message.text


def test_password_changed_email_offers_reset_link() -> None:
    message = auth_emails.password_changed_email(_user(), SETTINGS)

    assert "https://app.example/reset-password" in message.html


def test_html_is_escaped() -> None:
    message = auth_emails.activation_email(_user(), "NQ", "tok", SETTINGS)

    assert "Jane &lt;b&gt;Doe&lt;/b&gt;" in message.html
    assert "<b>Doe</b>" not in message.html


def test_sender_selection() -> None:
    assert isinstance(create_email_sender(SETTINGS), SmtpEmailSender)
    assert isinstance(
        create_email_sender(SETTINGS.model_copy(update={"email_backend": "console"})),
        ConsoleEmailSender,
    )
    assert isinstance(
        create_email_sender(SETTINGS.model_copy(update={"email_backend": "memory"})),
        InMemoryEmailSender,
    )
