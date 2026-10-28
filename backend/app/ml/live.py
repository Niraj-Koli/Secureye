"""Live detection: per-session processing and server-side camera capture (synchronous).

Behavior carried over from the original live mode:
- each newly seen tracked object produces one event (the report row and the alert sound),
- every tracked object gets a clip of the *annotated* frames it appears in, filed under a
  folder named after the date.
"""

import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import cv2

from app.ml.annotate import draw_detections
from app.ml.detector import Detector, ImageBGR
from app.ml.tracking import ObjectTracker, TrackedObject
from app.ml.video import ClipWriter

_CLIP_IDLE_SECONDS = 5.0


@dataclass(frozen=True, slots=True)
class NewObject:
    track_id: int
    class_name: str
    confidence: float
    detected_at: datetime


@dataclass(frozen=True, slots=True)
class FinishedClip:
    track_id: int
    path: Path
    relative_name: str  # "<YYYY-MM-DD>/<HHMMSSam>_track_<id>_<class>.mp4"


@dataclass(frozen=True, slots=True)
class LiveFrameResult:
    tracked: list[TrackedObject]
    new_objects: list[NewObject]
    annotated: ImageBGR
    inference_ms: float
    finished_clips: list[FinishedClip] = field(default_factory=list)


@dataclass
class _OpenClip:
    writer: ClipWriter
    path: Path
    relative_name: str
    last_seen: float


class LiveProcessor:
    """Detection, tracking, events and clip recording for one live session."""

    def __init__(
        self,
        detector: Detector,
        *,
        confidence: float,
        iou: float,
        clips_dir: Path,
        fps: float,
    ) -> None:
        self._detector = detector
        self._confidence = confidence
        self._iou = iou
        self._clips_dir = clips_dir
        self._fps = fps
        self._tracker = ObjectTracker(detector.class_names)
        self._seen: set[int] = set()
        self._clips: dict[int, _OpenClip] = {}
        self.frames_processed = 0

    def process(self, image: ImageBGR, now: datetime) -> LiveFrameResult:
        prediction = self._detector.predict(image, confidence=self._confidence, iou=self._iou)
        tracked = self._tracker.update(prediction.detections, image.shape)
        self.frames_processed += 1

        new_objects = [
            NewObject(o.track_id, o.detection.class_name, o.detection.confidence, now)
            for o in tracked
            if o.track_id not in self._seen
        ]
        self._seen.update(o.track_id for o in tracked)

        annotated = draw_detections(
            image,
            [o.detection for o in tracked],
            self._detector.class_names,
            labels=[f"id:{o.track_id} {o.detection.class_name}" for o in tracked],
            line_width=2,
        )
        clock = time.monotonic()
        for obj in tracked:
            clip = self._clips.get(obj.track_id)
            if clip is None:
                clip = self._open_clip(obj, image, now, clock)
            clip.writer.write(annotated)  # the original recorded annotated live frames
            clip.last_seen = clock

        idle = [tid for tid, c in self._clips.items() if clock - c.last_seen > _CLIP_IDLE_SECONDS]
        return LiveFrameResult(
            tracked=tracked,
            new_objects=new_objects,
            annotated=annotated,
            inference_ms=prediction.inference_ms,
            finished_clips=[self._close(tid) for tid in idle],
        )

    def finish(self) -> list[FinishedClip]:
        """Close every open clip (end of session)."""
        return [self._close(tid) for tid in list(self._clips)]

    def _open_clip(
        self, obj: TrackedObject, image: ImageBGR, now: datetime, clock: float
    ) -> _OpenClip:
        slug = re.sub(r"[^A-Za-z0-9]+", "-", obj.detection.class_name).strip("-").lower()
        # Same layout as the original: a folder per day, files named by time of day.
        relative = (
            f"{now:%Y-%m-%d}/{now.strftime('%I%M%S%p').lower()}"
            f"_track_{obj.track_id}_{slug or 'object'}.mp4"
        )
        path = self._clips_dir / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        writer = ClipWriter(path, width=image.shape[1], height=image.shape[0], fps=self._fps)
        clip = _OpenClip(writer=writer, path=path, relative_name=relative, last_seen=clock)
        self._clips[obj.track_id] = clip
        return clip

    def _close(self, track_id: int) -> FinishedClip:
        clip = self._clips.pop(track_id)
        clip.writer.close()
        return FinishedClip(track_id=track_id, path=clip.path, relative_name=clip.relative_name)


class CameraUnavailableError(RuntimeError):
    pass


class CameraReader:
    """Reads a server-side camera in a background thread, always holding the newest frame.

    Reading continuously (instead of on demand) keeps OpenCV's internal buffer from serving
    stale frames when detection is slower than the camera. Local video files are paced at
    their own frame rate, which makes them usable as stand-in cameras (demos, tests).
    """

    def __init__(self, source: str, *, timeout_seconds: float = 5.0) -> None:
        """Blocks while connecting (up to `timeout_seconds` for streams): call it off the loop."""
        target: int | str = int(source) if source.isdigit() else source
        if isinstance(target, int):
            self._capture = cv2.VideoCapture(target)
        else:
            # OpenCV's FFmpeg default waits 30 s on an unreachable stream; fail faster.
            timeout_ms = int(timeout_seconds * 1000)
            self._capture = cv2.VideoCapture(
                target,
                cv2.CAP_FFMPEG,
                [
                    cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
                    timeout_ms,
                    cv2.CAP_PROP_READ_TIMEOUT_MSEC,
                    timeout_ms,
                ],
            )
        if not self._capture.isOpened():
            self._capture.release()
            raise CameraUnavailableError("The camera could not be opened.")
        is_file = isinstance(target, str) and Path(target).is_file()
        fps = self._capture.get(cv2.CAP_PROP_FPS)
        self._frame_interval = 1 / fps if is_file and fps > 0 else 0.0
        self._lock = threading.Lock()
        self._frame: ImageBGR | None = None
        self._sequence = 0
        self._stopped = threading.Event()
        self.ended = threading.Event()  # source ran out (file end / camera unplugged)
        self._thread = threading.Thread(target=self._run, name="camera-reader", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        try:
            while not self._stopped.is_set():
                started = time.monotonic()
                ok, frame = self._capture.read()
                if not ok:
                    self.ended.set()
                    return
                with self._lock:
                    self._frame = frame  # type: ignore[assignment]
                    self._sequence += 1
                if self._frame_interval:
                    delay = self._frame_interval - (time.monotonic() - started)
                    if delay > 0:
                        self._stopped.wait(delay)
        finally:
            self._capture.release()

    def latest(self, after: int) -> tuple[int, ImageBGR] | None:
        """The newest frame if it's newer than sequence number `after`."""
        with self._lock:
            if self._frame is None or self._sequence <= after:
                return None
            return self._sequence, self._frame

    def close(self) -> None:
        self._stopped.set()
        self._thread.join(timeout=5)
