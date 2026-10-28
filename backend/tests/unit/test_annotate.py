import numpy as np
import pytest

from app.ml.annotate import color_for, draw_detections
from app.ml.detector import Box, Detection

CLASSES = ["Army Vehicle", "Handgun", "Helicopter", "RPG", "Rifle", "Soldier", "Tank"]


def _blank(h: int = 200, w: int = 300) -> np.ndarray:
    return np.zeros((h, w, 3), dtype=np.uint8)


def test_original_app_colors() -> None:
    assert color_for(CLASSES.index("Soldier")) == (0x0A, 0xF9, 0x48)  # #48F90A as BGR
    assert color_for(CLASSES.index("Rifle")) == (0x31, 0xD2, 0xCF)  # #CFD231 as BGR
    assert color_for(25) == color_for(5)  # palette wraps


def test_box_is_drawn_in_the_class_color_without_touching_the_input() -> None:
    image = _blank()
    detection = Detection("Soldier", 0.9, Box(50, 60, 150, 160))

    annotated = draw_detections(image, [detection], CLASSES)

    assert not image.any()  # input untouched
    assert tuple(annotated[110, 50]) == color_for(5)  # left edge of the box
    assert not annotated[110, 100].any()  # inside the box stays clear


def test_label_goes_inside_the_box_when_there_is_no_room_above() -> None:
    annotated = draw_detections(_blank(), [Detection("Rifle", 0.5, Box(10, 0, 200, 100))], CLASSES)

    assert annotated[5:15, 12:40].any()  # label background drawn just inside the top edge


def test_custom_labels() -> None:
    detections = [Detection("Tank", 0.8, Box(10, 40, 100, 100))]

    with_id = draw_detections(_blank(), detections, CLASSES, labels=["#7 Tank"])
    default = draw_detections(_blank(), detections, CLASSES)

    assert not np.array_equal(with_id, default)
    with pytest.raises(ValueError):
        draw_detections(_blank(), detections, CLASSES, labels=["a", "b"])


def test_most_confident_label_is_drawn_on_top() -> None:
    weak = Detection("Rifle", 0.2, Box(20, 60, 200, 150))
    strong = Detection("Soldier", 0.9, Box(20, 60, 200, 150))

    annotated = draw_detections(_blank(), [strong, weak], CLASSES)

    # Same box, and the strong label is wider: it must completely cover the weak one.
    label_band = annotated[40:59, 20:200].reshape(-1, 3)
    pixels = {tuple(int(c) for c in px) for px in label_band}
    assert color_for(5) in pixels  # Soldier (green) label visible
    assert color_for(4) not in pixels  # Rifle (yellow) label hidden underneath


def test_unknown_class_does_not_crash() -> None:
    annotated = draw_detections(_blank(), [Detection("Mystery", 0.5, Box(10, 40, 50, 90))], CLASSES)

    assert annotated.any()
