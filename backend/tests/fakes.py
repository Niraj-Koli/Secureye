"""Test doubles for the ML layer."""

from pathlib import Path

import av
import cv2
import numpy as np

from app.ml.detector import Box, Detection, DetectionResult, ImageBGR, Prediction
from app.ml.registry import ModelRegistry


class FakeDetector:
    """Deterministic stand-in: 'finds' one Soldier covering the central quarter of the image."""

    def __init__(self, name: str = "fake-model") -> None:
        self._name = name
        self.calls: list[tuple[tuple[int, ...], float, float]] = []

    @property
    def name(self) -> str:
        return self._name

    @property
    def class_names(self) -> list[str]:
        return ["Soldier"]

    def predict(
        self, image: ImageBGR, *, confidence: float, iou: float, agnostic_nms: bool = False
    ) -> Prediction:
        self.calls.append((image.shape, confidence, iou))
        h, w = image.shape[:2]
        box = Box(x1=w / 4, y1=h / 4, x2=w * 3 / 4, y2=h * 3 / 4)
        return Prediction(
            detections=[Detection(class_name="Soldier", confidence=0.87, box=box)],
            inference_ms=12.5,
        )

    def detect(self, image: ImageBGR, *, confidence: float, iou: float) -> DetectionResult:
        prediction = self.predict(image, confidence=confidence, iou=iou)
        box = prediction.detections[0].box
        annotated = image.copy()
        cv2.rectangle(
            annotated, (int(box.x1), int(box.y1)), (int(box.x2), int(box.y2)), (0, 255, 0), 2
        )
        return DetectionResult(
            detections=prediction.detections, annotated=annotated, inference_ms=12.5
        )


def fake_registry() -> ModelRegistry:
    return ModelRegistry(image=FakeDetector("fake-image"), live=FakeDetector("fake-live"))


def jpeg_bytes(
    width: int = 64, height: int = 48, color: tuple[int, int, int] = (40, 90, 160)
) -> bytes:
    image = np.full((height, width, 3), color, dtype=np.uint8)
    ok, buffer = cv2.imencode(".jpg", image)
    assert ok
    return buffer.tobytes()


class BlobDetector:
    """'Detects' bright rectangles as Soldiers. Pairs with `make_test_video` for pipeline tests."""

    name = "blob-detector"

    def __init__(self) -> None:
        self.class_names = ["Soldier", "Rifle"]
        self.calls = 0

    def predict(
        self, image: ImageBGR, *, confidence: float, iou: float, agnostic_nms: bool = False
    ) -> Prediction:
        self.calls += 1
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        detections = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w * h >= 100:
                detections.append(Detection("Soldier", 0.9, Box(x, y, x + w, y + h)))
        return Prediction(detections=detections, inference_ms=1.0)

    def detect(self, image: ImageBGR, *, confidence: float, iou: float) -> DetectionResult:
        prediction = self.predict(image, confidence=confidence, iou=iou)
        return DetectionResult(prediction.detections, image.copy(), prediction.inference_ms)


def make_test_video(
    path: Path,
    *,
    seconds: float = 3.0,
    fps: int = 30,
    size: tuple[int, int] = (320, 240),
    squares: tuple[tuple[float, float], ...] = ((1.0, 3.0),),
) -> Path:
    """Dark video with white squares moving left to right.

    `squares` lists (appears_at, disappears_at) times in seconds, one square per entry, each on
    its own row so the tracker can tell them apart.
    """
    width, height = size
    with av.open(str(path), mode="w") as container:
        stream = container.add_stream("libx264", rate=fps)
        stream.width, stream.height, stream.pix_fmt = width, height, "yuv420p"
        for i in range(round(seconds * fps)):
            t = i / fps
            image = np.full((height, width, 3), 30, dtype=np.uint8)
            for row, (start, end) in enumerate(squares):
                if start <= t < end:
                    x = int(10 + (t - start) * 40)
                    y = 20 + row * 70
                    image[y : y + 40, x : x + 40] = 255
            frame = av.VideoFrame.from_ndarray(image, format="bgr24")
            container.mux(stream.encode(frame))
        container.mux(stream.encode(None))
    return path
