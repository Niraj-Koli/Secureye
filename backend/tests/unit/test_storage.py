from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import anyio
import pytest

from app.services.storage import FileSigner, InvalidKeyError, LocalStorage, validate_key


async def test_save_read_delete(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)

    await storage.save("images/1/abc/original.jpg", b"data")

    assert await storage.read("images/1/abc/original.jpg") == b"data"
    assert await anyio.Path(storage.local_path("images/1/abc/original.jpg")).is_file()
    assert not [p async for p in anyio.Path(tmp_path).rglob("*.part")]  # renamed into place

    await storage.delete("images/1/abc/original.jpg")
    await storage.delete("images/1/abc/original.jpg")  # idempotent
    assert not await anyio.Path(storage.local_path("images/1/abc/original.jpg")).exists()


@pytest.mark.parametrize(
    "key",
    [
        "",
        "../secret",
        "images/../../etc/passwd",
        "/abs/path",
        "a//b/../c",
        "spaces in/name.jpg",
        "x/%2e%2e/y",
    ],
)
def test_unsafe_keys_are_rejected(key: str, tmp_path: Path) -> None:
    with pytest.raises(InvalidKeyError):
        LocalStorage(tmp_path).local_path(key)


def test_key_is_normalized() -> None:
    assert validate_key("images/1/a.jpg") == "images/1/a.jpg"


SIGNER = FileSigner("signing-secret", url_prefix="/api/v1/files", ttl_seconds=60)


def _parts(url: str) -> tuple[str, int, str]:
    split = urlsplit(url)
    query = parse_qs(split.query)
    key = split.path.removeprefix("/api/v1/files/")
    return key, int(query["expires"][0]), query["signature"][0]


def test_signed_url_verifies_until_it_expires() -> None:
    key, expires, signature = _parts(SIGNER.url("images/1/a.jpg", now=1_000))

    assert key == "images/1/a.jpg"
    assert expires == 1_060
    assert SIGNER.verify(key, expires, signature, now=1_059)
    assert not SIGNER.verify(key, expires, signature, now=1_061)


def test_signature_is_bound_to_key_and_expiry() -> None:
    key, expires, signature = _parts(SIGNER.url("images/1/a.jpg", now=1_000))

    assert not SIGNER.verify("images/2/a.jpg", expires, signature, now=1_000)
    assert not SIGNER.verify(key, expires + 3600, signature, now=1_000)
    assert not SIGNER.verify(key, expires, "0" * 64, now=1_000)


def test_signature_depends_on_secret() -> None:
    key, expires, signature = _parts(SIGNER.url("images/1/a.jpg", now=1_000))
    other = FileSigner("other-secret", url_prefix="/api/v1/files", ttl_seconds=60)

    assert not other.verify(key, expires, signature, now=1_000)
