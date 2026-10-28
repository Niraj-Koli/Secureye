"""Password rules, matching the original app.

Client-side (old `Signup.jsx` / `Password.jsx`): more than 7 characters, no whitespace.
Server-side (old Django `AUTH_PASSWORD_VALIDATORS`): not too similar to the user's name/email,
minimum length, not a common password, not entirely numeric.

`data/common-passwords.txt.gz` is Django's list (BSD-3-Clause, © Django Software Foundation).
"""

import gzip
import re
from difflib import SequenceMatcher
from functools import cache
from pathlib import Path

MIN_LENGTH = 8
MAX_LENGTH = 128  # Argon2 handles long inputs, but unbounded input is a DoS vector.
_MAX_SIMILARITY = 0.7
_COMMON_PASSWORDS_FILE = Path(__file__).parent / "data" / "common-passwords.txt.gz"


@cache
def _common_passwords() -> frozenset[str]:
    with gzip.open(_COMMON_PASSWORDS_FILE, "rt", encoding="utf-8") as fh:
        return frozenset(line.strip().lower() for line in fh if line.strip())


def _too_similar(password: str, attribute: str) -> bool:
    """Same approach as Django's UserAttributeSimilarityValidator."""
    password = password.lower()
    value = attribute.lower()
    parts = [value, *re.split(r"\W+", value)]
    return any(
        part
        and SequenceMatcher(a=password, b=part).quick_ratio() >= _MAX_SIMILARITY
        and SequenceMatcher(a=password, b=part).ratio() >= _MAX_SIMILARITY
        for part in parts
    )


def password_problems(password: str, *, name: str = "", email: str = "") -> list[str]:
    """Return human-readable problems with `password`; an empty list means it is acceptable."""
    problems: list[str] = []

    if len(password) < MIN_LENGTH:
        problems.append(f"Password must be at least {MIN_LENGTH} characters long.")
    if len(password) > MAX_LENGTH:
        problems.append(f"Password must be at most {MAX_LENGTH} characters long.")
    if re.search(r"\s", password):
        problems.append("Password must not contain spaces.")
    if password.isdigit():
        problems.append("Password must not be entirely numeric.")
    if password.lower() in _common_passwords():
        problems.append("Password is too common.")
    if any(_too_similar(password, attr) for attr in (name, email) if attr):
        problems.append("Password is too similar to your name or email.")

    return problems
