"""Loads the detection models once and runs inference off the event loop."""

from dataclasses import dataclass, field
from functools import partial

import anyio
import structlog

from app.core.config import Settings
from app.ml.detector import DetectionResult, Detector, ImageBGR, YoloDetector

logger = structlog.get_logger(__name__)


@dataclass
class ModelRegistry:
    image: Detector  # image + video detection (bestM)
    live: Detector  # live camera detection (bestS)
    # Caps simultaneous inferences across the process; each one already saturates the CPU.
    limiter: anyio.CapacityLimiter = field(default_factory=lambda: anyio.CapacityLimiter(1))

    async def detect(
        self, detector: Detector, image: ImageBGR, *, confidence: float, iou: float
    ) -> DetectionResult:
        run = partial(detector.detect, image, confidence=confidence, iou=iou)
        return await anyio.to_thread.run_sync(run, limiter=self.limiter)


def load_registry(settings: Settings) -> ModelRegistry:
    """Load and warm up both models (blocking; call from a worker thread)."""
    detectors = {}
    for role, filename in (
        ("image", settings.image_model_file),
        ("live", settings.live_model_file),
    ):
        detector = YoloDetector(settings.models_dir / filename, device=settings.inference_device)
        detector.warm_up()
        detectors[role] = detector
        logger.info("model_loaded", role=role, model=detector.name, classes=detector.class_names)

    return ModelRegistry(
        image=detectors["image"],
        live=detectors["live"],
        limiter=anyio.CapacityLimiter(settings.inference_concurrency),
    )
