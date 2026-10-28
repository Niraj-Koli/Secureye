import pytest

from app.core.password_policy import password_problems


def test_strong_password_has_no_problems() -> None:
    assert password_problems("Gr4nite-Falcon!", name="Jane Doe", email="jane@example.com") == []


@pytest.mark.parametrize(
    ("password", "expected"),
    [
        ("Ab1!", "at least 8 characters"),
        ("has space 99X", "must not contain spaces"),
        ("8273641950", "entirely numeric"),
        ("password1", "too common"),
        ("Qwerty123", "too common"),
        ("x" * 129, "at most 128"),
    ],
)
def test_weak_passwords_are_rejected(password: str, expected: str) -> None:
    problems = password_problems(password)

    assert any(expected in problem for problem in problems), problems


@pytest.mark.parametrize(
    ("password", "name", "email"),
    [
        ("janedoe1", "Jane Doe", "someone@example.com"),
        ("johnsmith", "Someone", "johnsmith@example.com"),
    ],
)
def test_password_similar_to_identity_is_rejected(password: str, name: str, email: str) -> None:
    assert "Password is too similar to your name or email." in password_problems(
        password, name=name, email=email
    )
