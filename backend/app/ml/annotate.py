"""Draws detections onto images.

Reproduces the original app's look (Ultralytics 8.0's palette and OpenCV box/label style), so
results look the same as before. Drawing here instead of with `Results.plot()` also avoids newer
Ultralytics' font lookup, which tries to download Arial over the network when it isn't installed
(the case in slim Linux containers), on every image.
"""

from collections.abc import Iterable, Sequence

import cv2

from app.ml.detector import Detection, ImageBGR

# Ultralytics 8.0.x default palette (RGB hex), indexed by class id. Same colors as the old app:
# Rifle (4) is yellow-green #CFD231, Soldier (5) green #48F90A.
_PALETTE_HEX = (
    "FF3838", "FF9D97", "FF701F", "FFB21D", "CFD231", "48F90A", "92CC17", "3DDB86", "1A9334",
    "00D4BB", "2C99A8", "00C2FF", "344593", "6473FF", "0018EC", "8438FF", "520085", "CB38FF",
    "FF95C8", "FF37C7",
)  # fmt: skip
_PALETTE_BGR = tuple((int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)) for h in _PALETTE_HEX)
_WHITE = (255, 255, 255)


def color_for(class_index: int) -> tuple[int, int, int]:
    return _PALETTE_BGR[class_index % len(_PALETTE_BGR)]


def draw_detections(
    image: ImageBGR,
    detections: Iterable[Detection],
    class_names: Sequence[str],
    *,
    labels: Iterable[str] | None = None,
    line_width: int | None = None,
) -> ImageBGR:
    """Return a copy of `image` with each detection's box and label drawn.

    `labels` overrides the default "<class> <confidence>" text (e.g. to show track ids).
    """
    canvas = image.copy()
    height, width = canvas.shape[:2]
    line = line_width or max(round((height + width) / 2 * 0.003), 2)
    thickness = max(line - 1, 1)
    scale = line / 3

    detections = list(detections)
    texts = (
        list(labels)
        if labels is not None
        else [f"{d.class_name} {d.confidence:.2f}" for d in detections]
    )
    pairs = list(zip(detections, texts, strict=True))
    # Least confident first, so where labels overlap the most confident one ends up on top.
    pairs.sort(key=lambda pair: pair[0].confidence)
    for detection, text in pairs:
        known = detection.class_name in class_names
        color = color_for(class_names.index(detection.class_name) if known else 0)
        box = detection.box
        p1 = (int(box.x1), int(box.y1))
        p2 = (int(box.x2), int(box.y2))
        cv2.rectangle(canvas, p1, p2, color, line, lineType=cv2.LINE_AA)

        (text_w, text_h), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)
        outside = p1[1] - text_h >= 3  # label above the box if there's room, else inside
        label_p2 = (p1[0] + text_w, p1[1] - text_h - 3 if outside else p1[1] + text_h + 3)
        cv2.rectangle(canvas, p1, label_p2, color, -1, lineType=cv2.LINE_AA)
        cv2.putText(
            canvas,
            text,
            (p1[0], p1[1] - 2 if outside else p1[1] + text_h + 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            scale,
            _WHITE,
            thickness,
            lineType=cv2.LINE_AA,
        )
    return canvas
