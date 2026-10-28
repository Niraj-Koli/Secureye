"""File storage for uploads and results, and signed download links.

Files are addressed by keys like `images/12/<uuid>/original.jpg`. `LocalStorage` keeps them on
disk; the interface is shaped so an S3-compatible backend can replace it without touching callers.

Browsers can't attach an `Authorization` header to `<img src>`, so files are served through
short-lived **signed URLs** (like S3 presigned URLs): `/files/<key>?expires=…&signature=…`.
"""

import hashlib
import hmac
import re
import shutil
import time
from pathlib import Path, PurePosixPath
from typing import Protocol
from urllib.parse import quote, urlencode

import anyio

_KEY_PART = re.compile(r"^[A-Za-z0-9._-]+$")


class InvalidKeyError(ValueError):
    pass


def validate_key(key: str) -> str:
    parts = PurePosixPath(key).parts
    if not parts or any(p in {".", ".."} or not _KEY_PART.match(p) for p in parts):
        raise InvalidKeyError(f"Invalid storage key: {key!r}")
    return "/".join(parts)


class Storage(Protocol):
    async def save(self, key: str, data: bytes) -> None: ...

    async def save_file(self, key: str, source: Path) -> None:
        """Move a local file into storage (consumes `source`)."""
        ...

    async def read(self, key: str) -> bytes: ...

    async def delete(self, key: str) -> None: ...

    def local_path(self, key: str) -> Path: ...


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def local_path(self, key: str) -> Path:
        path = (self.root / validate_key(key)).resolve()
        if not path.is_relative_to(self.root):  # defense in depth; validate_key already forbids ..
            raise InvalidKeyError(f"Invalid storage key: {key!r}")
        return path

    async def save(self, key: str, data: bytes) -> None:
        path = anyio.Path(self.local_path(key))
        await path.parent.mkdir(parents=True, exist_ok=True)
        # Write to a temp name, then rename: readers never see a half-written file.
        tmp = path.with_name(path.name + ".part")
        await tmp.write_bytes(data)
        await tmp.replace(path)

    async def save_file(self, key: str, source: Path) -> None:
        path = self.local_path(key)
        await anyio.Path(path.parent).mkdir(parents=True, exist_ok=True)
        await anyio.to_thread.run_sync(shutil.move, source, path)

    async def read(self, key: str) -> bytes:
        return await anyio.Path(self.local_path(key)).read_bytes()

    async def delete(self, key: str) -> None:
        await anyio.Path(self.local_path(key)).unlink(missing_ok=True)


class FileSigner:
    """Creates and verifies expiring HMAC-signed links to stored files."""

    def __init__(self, secret: str, *, url_prefix: str, ttl_seconds: int) -> None:
        self._secret = secret.encode()
        self._prefix = url_prefix.rstrip("/")
        self._ttl = ttl_seconds

    def _signature(self, key: str, expires: int) -> str:
        message = f"file:{key}:{expires}".encode()
        return hmac.new(self._secret, message, hashlib.sha256).hexdigest()

    def url(self, key: str, *, now: float | None = None) -> str:
        key = validate_key(key)
        expires = int((now if now is not None else time.time()) + self._ttl)
        query = urlencode({"expires": expires, "signature": self._signature(key, expires)})
        return f"{self._prefix}/{quote(key)}?{query}"

    def verify(self, key: str, expires: int, signature: str, *, now: float | None = None) -> bool:
        if expires < (now if now is not None else time.time()):
            return False
        return hmac.compare_digest(self._signature(key, expires), signature)
