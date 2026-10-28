"""Management commands.

    uv run python -m app.cli create-superuser --email admin@example.com --name "Admin"
    uv run python -m app.cli export-openapi ../frontend/openapi.json

The password is prompted for (or read from SECUREYE_SUPERUSER_PASSWORD for scripted setups).
"""

import argparse
import asyncio
import getpass
import json
import os
import sys
from pathlib import Path

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.core.config import Environment, get_settings
from app.core.password_policy import password_problems
from app.core.security import hash_password
from app.db.session import create_engine, create_session_factory
from app.models.user import User
from app.services.auth import normalize_email


async def create_superuser(name: str, email: str, password: str) -> User:
    settings = get_settings()
    engine = create_engine(settings)
    try:
        async with create_session_factory(engine)() as db:
            if await db.scalar(select(User).where(User.email == email)) is not None:
                raise SystemExit(f"A user with email {email} already exists.")
            user = User(
                name=name,
                email=email,
                password_hash=hash_password(password),
                is_active=True,
                is_staff=True,
                is_superuser=True,
            )
            db.add(user)
            await db.commit()
            return user
    finally:
        await engine.dispose()


def _read_password(name: str, email: str) -> str:
    password = os.environ.get("SECUREYE_SUPERUSER_PASSWORD")
    if password is None:
        password = getpass.getpass("Password: ")
        if getpass.getpass("Password (again): ") != password:
            raise SystemExit("Passwords do not match.")
    problems = password_problems(password, name=name, email=email)
    if problems:
        raise SystemExit("\n".join(problems))
    return password


def export_openapi(path: Path) -> None:
    """Write the API schema the frontend generates its types from (no server or database needed)."""
    from app.main import create_app  # imported here: it loads the ML stack, which only this needs

    # Production settings hide the schema, so always build the development app here.
    settings = get_settings().model_copy(update={"environment": Environment.DEVELOPMENT})
    schema = create_app(settings).openapi()
    path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-superuser", help="Create an active admin account.")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    export = commands.add_parser("export-openapi", help="Write the OpenAPI schema to a file.")
    export.add_argument("path", type=Path)
    args = parser.parse_args(argv)

    if args.command == "export-openapi":
        export_openapi(args.path)
        sys.stdout.write(f"OpenAPI schema written to {args.path}.\n")
        return

    try:
        email = normalize_email(TypeAdapter(EmailStr).validate_python(args.email))
    except ValidationError:
        raise SystemExit(f"Invalid email: {args.email}") from None

    password = _read_password(args.name, email)
    user = asyncio.run(create_superuser(args.name, email, password))
    sys.stdout.write(f"Superuser {user.email} created (id={user.id}).\n")


if __name__ == "__main__":
    main()
