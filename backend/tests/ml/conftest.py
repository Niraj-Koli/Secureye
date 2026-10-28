from pathlib import Path

import cv2
import pytest

from app.core.config import Settings
from app.ml.detector import ImageBGR
from app.ml.registry import ModelRegistry, load_registry

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        if "tests/ml/" in item.nodeid.replace("\\", "/"):
            item.add_marker(pytest.mark.ml)


@pytest.fixture(scope="session")
def real_models() -> ModelRegistry:
    """The real YOLO weights, loaded once for the whole session."""
    return load_registry(Settings(_env_file=None))


def read_fixture(name: str) -> ImageBGR:
    image = cv2.imread(str(FIXTURES / name))
    assert image is not None, name
    return image  # type: ignore[return-value]
