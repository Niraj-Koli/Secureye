"""Video tracking with the real model on a synthetic camera pan across the soldiers photo."""

from pathlib import Path

import av
import cv2
import numpy as np

from app.ml.registry import ModelRegistry
from app.ml.video import ProcessingOptions, process_video
from tests.ml.conftest import read_fixture

# The original video endpoint's settings.
OPTIONS = ProcessingOptions(confidence=0.5, iou=0.6, agnostic_nms=True, target_fps=10)


def _pan_video(path: Path, *, seconds: int = 3, fps: int = 30) -> Path:
    """A 1280x720 window sliding left to right across the 2880x1920 photo."""
    photo = np.asarray(cv2.resize(read_fixture("soldiers.jpg"), (1920, 1280)), dtype=np.uint8)
    width, height = 1280, 720
    frames = seconds * fps
    with av.open(str(path), mode="w") as container:
        stream = container.add_stream("libx264", rate=fps)
        stream.width, stream.height, stream.pix_fmt = width, height, "yuv420p"
        for i in range(frames):
            x = round((1920 - width) * i / (frames - 1))
            window = photo[300 : 300 + height, x : x + width]
            container.mux(stream.encode(av.VideoFrame.from_ndarray(window, format="bgr24")))
        container.mux(stream.encode(None))
    return path


def test_soldiers_are_tracked_through_a_camera_pan(
    real_models: ModelRegistry, tmp_path: Path
) -> None:
    video = _pan_video(tmp_path / "pan.mp4")

    summary = process_video(video, real_models.image, options=OPTIONS, clips_dir=tmp_path)

    assert summary.frames_processed == 30
    soldiers = [t for t in summary.tracks if t.class_name == "Soldier"]
    assert soldiers, summary.tracks
    # ids are per-video and start at 1
    assert [t.track_id for t in summary.tracks] == list(range(1, len(summary.tracks) + 1))
    # a soldier visible from the start is followed for most of the pan under one id,
    # rather than being re-detected as new objects every frame
    longest = max(soldiers, key=lambda t: t.frames)
    assert longest.frames >= 15
    assert longest.best_confidence >= 0.5
    with av.open(str(tmp_path / longest.clip_filename)) as clip:  # type: ignore[operator]
        assert clip.streams.video[0].codec_context.name == "h264"
