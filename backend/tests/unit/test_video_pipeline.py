"""The video pipeline with a synthetic video and a deterministic stand-in detector."""

from pathlib import Path

import av
import cv2
import numpy as np
import pytest

from app.ml.video import (
    ClipWriter,
    FrameUpdate,
    InvalidVideoError,
    ProcessingOptions,
    VideoCancelledError,
    probe_video,
    process_video,
)
from tests.fakes import BlobDetector, make_test_video

OPTIONS = ProcessingOptions(confidence=0.5, iou=0.6, agnostic_nms=True, target_fps=10)


def _decode(path: Path) -> tuple[str, int, int, int]:
    with av.open(str(path)) as container:
        stream = container.streams.video[0]
        frames = sum(1 for _ in container.decode(stream))
        return stream.codec_context.name, stream.width, stream.height, frames


# ------------------------------------------------------------------ probing


def test_probe_reads_metadata(tmp_path: Path) -> None:
    video = make_test_video(tmp_path / "v.mp4", seconds=2, fps=25, size=(320, 240))

    info = probe_video(video)

    assert (info.width, info.height, info.fps, info.codec) == (320, 240, 25.0, "h264")
    assert info.duration_seconds == pytest.approx(2.0, abs=0.05)


@pytest.mark.parametrize(
    "content", [b"", b"not a video at all", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64]
)
def test_probe_rejects_non_videos(tmp_path: Path, content: bytes) -> None:
    path = tmp_path / "bad.mp4"
    path.write_bytes(content)

    with pytest.raises(InvalidVideoError):
        probe_video(path)


def test_probe_rejects_a_still_image(tmp_path: Path) -> None:
    fixture = Path(__file__).resolve().parent.parent / "fixtures" / "no_threats.jpg"

    with pytest.raises(InvalidVideoError):
        probe_video(fixture)


# ------------------------------------------------------------------ clips


def test_clip_writer_produces_browser_playable_h264(tmp_path: Path) -> None:
    clip = tmp_path / "clip.mp4"
    writer = ClipWriter(clip, width=321, height=241, fps=10)  # odd sizes are trimmed to even
    for i in range(12):
        writer.write(np.full((241, 321, 3), i * 20, dtype=np.uint8))
    writer.close()

    assert _decode(clip) == ("h264", 320, 240, 12)
    with av.open(str(clip)) as container:
        assert container.streams.video[0].format.name == "yuv420p"
    # faststart: the index ("moov") is written before the media data ("mdat")
    data = clip.read_bytes()
    assert data.index(b"moov") < data.index(b"mdat")


# ------------------------------------------------------------------ processing


def test_tracks_timestamps_and_clips(tmp_path: Path) -> None:
    # square A visible 1.0-3.0 s (row 0), square B 0.5-2.0 s (row 1)
    video = make_test_video(tmp_path / "v.mp4", seconds=4, squares=((1.0, 3.0), (0.5, 2.0)))
    updates: list[FrameUpdate] = []

    summary = process_video(
        video, BlobDetector(), options=OPTIONS, clips_dir=tmp_path, on_frame=updates.append
    )

    assert summary.frames_processed == 40  # 4 s sampled at 10 fps
    assert [t.track_id for t in summary.tracks] == [1, 2]
    first_b, first_a = summary.tracks  # B appears first, so it is track 1
    # ByteTrack confirms a new object on its second sighting: reported one sample (0.1 s) late.
    assert first_b.first_seen_seconds == pytest.approx(0.6, abs=0.01)
    assert first_a.first_seen_seconds == pytest.approx(1.1, abs=0.01)
    assert first_b.last_seen_seconds == pytest.approx(1.9, abs=0.01)
    for track in summary.tracks:
        assert track.class_name == "Soldier"
        assert track.clip_filename == f"track_{track.track_id}_soldier.mp4"
        codec, width, height, frames = _decode(tmp_path / track.clip_filename)
        assert (codec, width, height) == ("h264", 320, 240)
        assert frames == track.frames > 10


def test_progress_updates_and_previews(tmp_path: Path) -> None:
    video = make_test_video(tmp_path / "v.mp4", seconds=2, size=(1280, 720))
    updates: list[FrameUpdate] = []

    process_video(
        video, BlobDetector(), options=OPTIONS, clips_dir=tmp_path, on_frame=updates.append
    )

    progress = [u.progress for u in updates]
    assert len(updates) == 20
    assert progress == sorted(progress)
    assert 0 <= progress[0] < 0.1 and 0.9 < progress[-1] <= 1
    preview = updates[-1].preview_jpeg
    assert preview[:3] == b"\xff\xd8\xff"
    # the 1280 px wide source is downscaled for streaming to the configured width
    decoded = cv2.imdecode(np.frombuffer(preview, np.uint8), cv2.IMREAD_COLOR)
    assert decoded is not None
    assert decoded.shape[1] == OPTIONS.preview_max_width


@pytest.mark.parametrize(("fps", "seconds"), [(15, 2), (25, 2), (60, 2)])
def test_sampling_follows_real_timestamps(tmp_path: Path, fps: int, seconds: int) -> None:
    """The original assumed 30 fps input (every 3rd frame); now any frame rate gives 10 fps."""
    video = make_test_video(tmp_path / "v.mp4", seconds=seconds, fps=fps)
    detector = BlobDetector()

    summary = process_video(video, detector, options=OPTIONS, clips_dir=tmp_path)

    assert summary.frames_processed == detector.calls == seconds * 10


def test_input_below_target_fps_processes_every_frame(tmp_path: Path) -> None:
    video = make_test_video(tmp_path / "v.mp4", seconds=2, fps=5)

    summary = process_video(video, BlobDetector(), options=OPTIONS, clips_dir=tmp_path)

    assert summary.frames_processed == 10


def test_no_objects_means_no_tracks_or_clips(tmp_path: Path) -> None:
    video = make_test_video(tmp_path / "v.mp4", seconds=1, squares=())

    summary = process_video(video, BlobDetector(), options=OPTIONS, clips_dir=tmp_path)

    assert summary.tracks == []
    assert not list(tmp_path.glob("track_*.mp4"))


def test_cancellation_stops_processing(tmp_path: Path) -> None:
    video = make_test_video(tmp_path / "v.mp4", seconds=4)
    detector = BlobDetector()
    checks = iter(range(100))

    with pytest.raises(VideoCancelledError):
        process_video(
            video,
            detector,
            options=OPTIONS,
            clips_dir=tmp_path,
            is_cancelled=lambda: next(checks) >= 5,
        )

    assert detector.calls == 5
    # open clips were finalized (closed) on the way out, so they're still valid files
    for clip in tmp_path.glob("track_*.mp4"):
        assert _decode(clip)[0] == "h264"
