"""Object detection on a single image.

`Detector` is the interface the rest of the app depends on; `YoloDetector` implements it with
Ultralytics. Detectors are synchronous and CPU/GPU-bound: call them from a worker thread
(see `ModelRegistry.detect`), never directly on the event loop.
"""

import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

import numpy as np
from numpy.typing import NDArray

if TYPE_CHECKING:
    from ultralytics.engine.results import Results

# OpenCV-style image: height x width x 3, BGR, uint8.
ImageBGR = NDArray[np.uint8]


@dataclass(frozen=True, slots=True)
class Box:
    """Pixel coordinates in the input image (top-left x1/y1, bottom-right x2/y2)."""

    x1: float
    y1: float
    x2: float
    y2: float


@dataclass(frozen=True, slots=True)
class Detection:
    class_name: str
    confidence: float  # 0..1
    box: Box


@dataclass(frozen=True, slots=True)
class Prediction:
    detections: list[Detection]  # most confident first
    inference_ms: float


@dataclass(frozen=True, slots=True)
class DetectionResult:
    detections: list[Detection]
    annotated: ImageBGR  # input image with boxes and labels drawn on it
    inference_ms: float


class Detector(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def class_names(self) -> list[str]: ...

    def predict(
        self, image: ImageBGR, *, confidence: float, iou: float, agnostic_nms: bool = False
    ) -> Prediction:
        """Detections only (no drawing)."""
        ...

    def detect(self, image: ImageBGR, *, confidence: float, iou: float) -> DetectionResult:
        """Detections plus the annotated image."""
        ...


class YoloDetector:
    """Thread-safe: Ultralytics' predictor keeps per-call state, so calls are serialized."""

    def __init__(self, weights: Path, *, device: str = "cpu") -> None:
        # (Ultralytics' offline/no-autoinstall switches are set in app/ml/__init__.py.)
        # Imported lazily: torch/ultralytics take seconds to import and aren't needed by
        # code paths (or tests) that never run a real model.
        from ultralytics.models.yolo import YOLO

        if not weights.is_file():
            raise FileNotFoundError(f"Model weights not found: {weights}")
        self._model = YOLO(str(weights), task="detect")
        self._device = device
        self._name = weights.stem
        self._lock = threading.Lock()

    @property
    def name(self) -> str:
        return self._name

    @property
    def class_names(self) -> list[str]:
        names = self._model.names
        return [names[i] for i in sorted(names)]

    def predict(
        self, image: ImageBGR, *, confidence: float, iou: float, agnostic_nms: bool = False
    ) -> Prediction:
        with self._lock:
            started = time.perf_counter()
            # predict() is typed as returning tensors or a stream too; with an array source and
            # stream=False it returns one Results per image.
            results: list[Results] = self._model.predict(  # type: ignore[assignment]
                source=image,
                conf=confidence,
                iou=iou,
                agnostic_nms=agnostic_nms,
                device=self._device,
                verbose=False,
                stream=False,
            )
            elapsed_ms = (time.perf_counter() - started) * 1000

        result = results[0]
        boxes = result.boxes
        if boxes is None:  # only for non-detection tasks; kept for type safety
            raise RuntimeError(f"{self._name} is not an object detection model.")
        detections = [
            Detection(
                class_name=result.names[int(cls)],
                confidence=round(float(conf), 4),
                box=Box(*(round(float(v), 1) for v in xyxy)),
            )
            for cls, conf, xyxy in zip(
                boxes.cls.tolist(), boxes.conf.tolist(), boxes.xyxy.tolist(), strict=True
            )
        ]
        detections.sort(key=lambda d: d.confidence, reverse=True)
        return Prediction(detections=detections, inference_ms=elapsed_ms)

    def detect(self, image: ImageBGR, *, confidence: float, iou: float) -> DetectionResult:
        from app.ml.annotate import draw_detections  # annotate imports this module's types

        prediction = self.predict(image, confidence=confidence, iou=iou)
        annotated = draw_detections(image, prediction.detections, self.class_names)
        return DetectionResult(
            detections=prediction.detections,
            annotated=annotated,
            inference_ms=prediction.inference_ms,
        )

    def warm_up(self) -> None:
        """Run one dummy inference so the first real request doesn't pay initialization cost."""
        self.predict(np.zeros((320, 320, 3), dtype=np.uint8), confidence=0.5, iou=0.5)
