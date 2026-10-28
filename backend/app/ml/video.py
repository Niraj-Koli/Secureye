"""Video detection + tracking, frame by frame (synchronous; run it in a worker thread/process).

Behavior carried over from the original app:
- frames are sampled at `target_fps` (10 by default),
- each tracked object gets an id, the time it was first seen, and its own clip made of the
  (unannotated) frames it appears in,
- annotated frames (boxes labelled "id:<n> <class>") are streamed as a live preview.

Changes: sampling follows the video's real timestamps instead of assuming 30 fps, clips are H.264
(playable in browsers, the old mp4v ones weren't), and each run has its own tracker.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import cast

import av
import av.error
import cv2
from cv2.typing import MatLike

from app.ml.annotate import draw_detections
from app.ml.detector import Detector, ImageBGR
from app.ml.tracking import ObjectTracker, TrackedObject

# Close a track's clip when it hasn't been seen for this long (ByteTrack forgets lost tracks
# after 30 processed frames, i.e. 3 s at 10 fps, so it would get a new id anyway).
_CLIP_IDLE_SECONDS = 5.0


class InvalidVideoError(ValueError):
    pass


class VideoCancelledError(Exception):
    pass


# ------------------------------------------------------------------ probing


@dataclass(frozen=True, slots=True)
class VideoInfo:
    width: int
    height: int
    fps: float
    duration_seconds: float
    codec: str


def probe_video(path: Path) -> VideoInfo:
    """Read a video's metadata and decode its first frame (proves it's actually playable)."""
    try:
        with av.open(str(path)) as container:
            if not container.streams.video:
                raise InvalidVideoError("The file has no video track.")
            # FFmpeg opens still images as one-frame "videos" (image2, png_pipe, gif, ...).
            fmt = container.format.name
            if fmt in {"image2", "gif", "apng"} or fmt.endswith("_pipe"):
                raise InvalidVideoError("This is an image, not a video.")
            stream = container.streams.video[0]
            rate = stream.average_rate or stream.guessed_rate
            fps = float(rate) if rate else 0.0

            if stream.duration is not None and stream.time_base is not None:
                duration = float(stream.duration * stream.time_base)
            elif container.duration is not None:
                duration = container.duration / av.time_base
            else:
                duration = 0.0

            first = next(container.decode(stream), None)
            if first is None:
                raise InvalidVideoError("The video has no decodable frames.")
            width, height = first.width, first.height
    except (av.error.FFmpegError, UnicodeDecodeError, IndexError) as exc:
        raise InvalidVideoError("The file is not a valid video.") from exc

    if duration <= 0 or fps <= 0:
        raise InvalidVideoError("Could not determine the video's duration or frame rate.")
    return VideoInfo(
        width=width,
        height=height,
        fps=round(fps, 3),
        duration_seconds=round(duration, 3),
        codec=stream.codec_context.name,
    )


# ------------------------------------------------------------------ clip writing


class ClipWriter:
    """Writes BGR frames to an H.264 MP4 that browsers can play."""

    def __init__(self, path: Path, *, width: int, height: int, fps: float) -> None:
        # yuv420p (required for broad browser support) needs even dimensions.
        self._width, self._height = width - width % 2, height - height % 2
        rate = Fraction(fps).limit_denominator(1000)
        # faststart moves the index to the front so playback can begin before full download.
        self._container = av.open(str(path), mode="w", options={"movflags": "faststart"})
        self._stream = self._container.add_stream("libx264", rate=rate)
        self._stream.width = self._width
        self._stream.height = self._height
        self._stream.pix_fmt = "yuv420p"
        self._stream.options = {"preset": "veryfast", "crf": "23"}
        self._time_base = 1 / rate
        self.frames = 0

    def write(self, image: ImageBGR) -> None:
        frame = av.VideoFrame.from_ndarray(image[: self._height, : self._width], format="bgr24")
        frame.pts = self.frames
        frame.time_base = self._time_base
        self._container.mux(self._stream.encode(frame))
        self.frames += 1

    def close(self) -> None:
        self._container.mux(self._stream.encode(None))  # flush buffered frames
        self._container.close()


# ------------------------------------------------------------------ processing


@dataclass
class TrackSummary:
    track_id: int
    class_name: str
    first_seen_seconds: float
    last_seen_seconds: float
    best_confidence: float
    frames: int = 0
    clip_filename: str | None = None


@dataclass(frozen=True, slots=True)
class FrameUpdate:
    """Sent after each analysed frame."""

    time_seconds: float
    progress: float  # 0..1
    tracks_found: int
    preview_jpeg: bytes  # annotated frame, downscaled


@dataclass
class VideoSummary:
    tracks: list[TrackSummary] = field(default_factory=list)  # ordered by track id
    frames_processed: int = 0


@dataclass(frozen=True, slots=True)
class ProcessingOptions:
    confidence: float
    iou: float
    agnostic_nms: bool
    target_fps: float
    preview_max_width: int = 960
    preview_jpeg_quality: int = 70


def _clip_filename(track_id: int, class_name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", class_name).strip("-").lower() or "object"
    return f"track_{track_id}_{slug}.mp4"


def encode_preview(image: ImageBGR, *, max_width: int, quality: int) -> bytes:
    """Downscale to `max_width` and JPEG-encode, for streaming to the browser."""
    height, width = image.shape[:2]
    preview: MatLike = image
    if width > max_width:
        size = (max_width, round(height * max_width / width))
        preview = cv2.resize(image, size, interpolation=cv2.INTER_AREA)
    ok, buffer = cv2.imencode(".jpg", preview, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("JPEG encoding failed.")
    return buffer.tobytes()


def process_video(
    source: Path,
    detector: Detector,
    *,
    options: ProcessingOptions,
    clips_dir: Path,
    on_frame: Callable[[FrameUpdate], None] = lambda _: None,
    is_cancelled: Callable[[], bool] = lambda: False,
) -> VideoSummary:
    info = probe_video(source)
    tracker = ObjectTracker(detector.class_names)
    summary = VideoSummary()
    tracks: dict[int, TrackSummary] = {}
    writers: dict[int, ClipWriter] = {}
    interval = 1 / options.target_fps
    next_sample = 0.0

    try:
        with av.open(str(source)) as container:
            stream = container.streams.video[0]
            stream.thread_type = "AUTO"
            for index, frame in enumerate(container.decode(stream)):
                t = float(frame.time) if frame.time is not None else index / info.fps
                if t + 1e-6 < next_sample:
                    continue
                while next_sample <= t + 1e-6:
                    next_sample += interval
                if is_cancelled():
                    raise VideoCancelledError

                # bgr24 always yields uint8 (PyAV types it as a union of array types).
                image = cast(ImageBGR, frame.to_ndarray(format="bgr24"))
                prediction = detector.predict(
                    image,
                    confidence=options.confidence,
                    iou=options.iou,
                    agnostic_nms=options.agnostic_nms,
                )
                tracked = tracker.update(prediction.detections, image.shape)
                summary.frames_processed += 1

                for obj in tracked:
                    _record(obj, t, tracks)
                    writer = writers.get(obj.track_id)
                    if writer is None:
                        filename = _clip_filename(obj.track_id, obj.detection.class_name)
                        tracks[obj.track_id].clip_filename = filename
                        writer = ClipWriter(
                            clips_dir / filename,
                            width=image.shape[1],
                            height=image.shape[0],
                            fps=options.target_fps,
                        )
                        writers[obj.track_id] = writer
                    writer.write(image)
                    tracks[obj.track_id].frames += 1

                for track_id in [
                    tid for tid in writers if t - tracks[tid].last_seen_seconds > _CLIP_IDLE_SECONDS
                ]:
                    writers.pop(track_id).close()

                annotated = draw_detections(
                    image,
                    [obj.detection for obj in tracked],
                    detector.class_names,
                    labels=[f"id:{o.track_id} {o.detection.class_name}" for o in tracked],
                    line_width=2,
                )
                on_frame(
                    FrameUpdate(
                        time_seconds=round(t, 3),
                        progress=min(t / info.duration_seconds, 1.0),
                        tracks_found=len(tracks),
                        preview_jpeg=encode_preview(
                            annotated,
                            max_width=options.preview_max_width,
                            quality=options.preview_jpeg_quality,
                        ),
                    )
                )
    finally:
        for writer in writers.values():
            writer.close()

    summary.tracks = sorted(tracks.values(), key=lambda s: s.track_id)
    return summary


def _record(obj: TrackedObject, t: float, tracks: dict[int, TrackSummary]) -> None:
    summary = tracks.get(obj.track_id)
    if summary is None:
        tracks[obj.track_id] = TrackSummary(
            track_id=obj.track_id,
            class_name=obj.detection.class_name,
            first_seen_seconds=round(t, 3),
            last_seen_seconds=round(t, 3),
            best_confidence=obj.detection.confidence,
        )
        return
    summary.last_seen_seconds = round(t, 3)
    summary.best_confidence = max(summary.best_confidence, obj.detection.confidence)
