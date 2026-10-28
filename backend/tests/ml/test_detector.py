"""Behavior of the real models, including parity with the original app's output."""

import json

import numpy as np
import pytest

from app.ml.detector import Box, Detection
from app.ml.registry import ModelRegistry
from tests.ml.conftest import FIXTURES, read_fixture

CLASSES = ["Army Vehicle", "Handgun", "Helicopter", "RPG", "Rifle", "Soldier", "Tank"]


def iou(a: Box, b: Box) -> float:
    ix = max(0.0, min(a.x2, b.x2) - max(a.x1, b.x1))
    iy = max(0.0, min(a.y2, b.y2) - max(a.y1, b.y1))
    inter = ix * iy
    union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter
    return inter / union if union else 0.0


def test_models_expose_the_seven_trained_classes(real_models: ModelRegistry) -> None:
    assert real_models.image.class_names == CLASSES
    assert real_models.live.class_names == CLASSES
    assert (real_models.image.name, real_models.live.name) == ("bestM", "bestS")


def test_image_detection_matches_the_original_app(real_models: ModelRegistry) -> None:
    """Every detection the old app produced on this image is found again.

    Old reference: Old/public/afterSliderImage.jpg (Ultralytics 8.0.228, torch 2.1). Newer
    Ultralytics also reports a couple of extra low-confidence soldiers; those are allowed only
    below 0.3 confidence.
    """
    golden = json.loads((FIXTURES / "soldiers.golden.json").read_text())
    image = read_fixture("soldiers.jpg")
    scale = image.shape[1] / golden["reference_width"]

    result = real_models.image.detect(image, confidence=0.2, iou=0.3)

    unmatched: list[Detection] = list(result.detections)
    for expected in golden["detections"]:
        box = Box(*(v * scale for v in expected["box"]))
        match = next(
            (
                d
                for d in unmatched
                if d.class_name == expected["class_name"]
                and iou(d.box, box) >= 0.9
                and abs(d.confidence - expected["confidence"]) <= 0.05
            ),
            None,
        )
        assert match is not None, f"old detection not reproduced: {expected}"
        unmatched.remove(match)

    assert all(d.confidence < 0.3 for d in unmatched), unmatched


def test_no_detections_on_an_image_without_threats(real_models: ModelRegistry) -> None:
    result = real_models.image.detect(read_fixture("no_threats.jpg"), confidence=0.2, iou=0.3)

    assert result.detections == []


def test_results_are_well_formed(real_models: ModelRegistry) -> None:
    image = read_fixture("soldiers.jpg")
    height, width = image.shape[:2]

    result = real_models.image.detect(image, confidence=0.2, iou=0.3)

    assert result.annotated.shape == image.shape
    assert not np.array_equal(result.annotated, image)  # boxes were drawn
    assert result.inference_ms > 0
    confidences = [d.confidence for d in result.detections]
    assert confidences == sorted(confidences, reverse=True)
    for d in result.detections:
        assert d.class_name in CLASSES
        assert 0.2 <= d.confidence <= 1
        assert 0 <= d.box.x1 < d.box.x2 <= width
        assert 0 <= d.box.y1 < d.box.y2 <= height


def test_confidence_threshold_is_respected(real_models: ModelRegistry) -> None:
    image = read_fixture("soldiers.jpg")

    low = real_models.image.detect(image, confidence=0.2, iou=0.3).detections
    high = real_models.image.detect(image, confidence=0.45, iou=0.3).detections

    assert len(high) < len(low)
    assert all(d.confidence >= 0.45 for d in high)


def test_live_model_detects_soldiers(real_models: ModelRegistry) -> None:
    result = real_models.live.detect(read_fixture("soldiers.jpg"), confidence=0.4, iou=0.3)

    assert "Soldier" in {d.class_name for d in result.detections}


@pytest.mark.parametrize("shape", [(1, 1, 3), (17, 4000, 3)])
def test_extreme_shapes_do_not_crash(
    real_models: ModelRegistry, shape: tuple[int, int, int]
) -> None:
    result = real_models.image.detect(np.zeros(shape, dtype=np.uint8), confidence=0.2, iou=0.3)

    assert result.annotated.shape == shape


async def test_registry_runs_inference_off_the_event_loop(real_models: ModelRegistry) -> None:
    result = await real_models.detect(
        real_models.image, read_fixture("no_threats.jpg"), confidence=0.2, iou=0.3
    )

    assert result.detections == []


def test_upload_decoding_is_unaffected_by_ultralytics_pillow_patch(
    real_models: ModelRegistry,
) -> None:
    """Ultralytics monkey-patches PIL.Image.open to pip-install a HEIF plugin on unknown files.

    Uploads must still be decoded by plain Pillow: a non-image is rejected cleanly (422),
    with no install attempt.
    """
    import os

    from PIL import Image

    from app.services.images import InvalidImageError, decode_image

    assert Image.open.__module__ != "PIL.Image"  # the patch is active in this process
    assert os.environ["YOLO_AUTOINSTALL"] == "false"
    with pytest.raises(InvalidImageError):
        decode_image(b"definitely not an image", max_pixels=1_000_000)
