import time
from datetime import UTC, datetime
from pathlib import Path

import av
import numpy as np
import pytest

from app.ml.live import CameraReader, CameraUnavailableError, LiveProcessor
from tests.fakes import BlobDetector, make_test_video

NOW = datetime(2026, 10, 21, 15, 4, 5, tzinfo=UTC)


def _frame(x: int, *, squares: int = 1) -> np.ndarray:
    image = np.full((240, 320, 3), 30, dtype=np.uint8)
    for row in range(squares):
        image[20 + row * 70 : 60 + row * 70, x : x + 40] = 255
    return image


def _processor(tmp_path: Path) -> LiveProcessor:
    return LiveProcessor(BlobDetector(), confidence=0.4, iou=0.45, clips_dir=tmp_path, fps=10)


def test_each_object_is_announced_once(tmp_path: Path) -> None:
    processor = _processor(tmp_path)

    results = [processor.process(_frame(10 + 4 * i), NOW) for i in range(5)]

    assert [[o.track_id for o in r.tracked] for r in results] == [[1]] * 5
    assert [(n.track_id, n.class_name, n.detected_at) for n in results[0].new_objects] == [
        (1, "Soldier", NOW)
    ]
    assert all(r.new_objects == [] for r in results[1:])
    assert processor.frames_processed == 5


def test_second_object_gets_its_own_announcement(tmp_path: Path) -> None:
    processor = _processor(tmp_path)
    for i in range(3):
        processor.process(_frame(10 + 4 * i), NOW)

    first_sighting = processor.process(_frame(22, squares=2), NOW)
    second_sighting = processor.process(_frame(26, squares=2), NOW)

    # ByteTrack confirms objects that appear mid-stream on their second sighting.
    assert first_sighting.new_objects == []
    assert [n.track_id for n in second_sighting.new_objects] == [2]


def test_clips_use_the_original_layout_and_annotated_frames(tmp_path: Path) -> None:
    processor = _processor(tmp_path)
    plain = [_frame(10 + 4 * i) for i in range(6)]
    for image in plain:
        processor.process(image, NOW)

    clips = processor.finish()

    assert [c.relative_name for c in clips] == ["2026-10-21/030405pm_track_1_soldier.mp4"]
    with av.open(str(clips[0].path)) as container:
        frames = [f.to_ndarray(format="bgr24") for f in container.decode(video=0)]
    assert len(frames) == 6
    # the original recorded live clips with boxes drawn: the clip differs from the raw input
    assert np.abs(frames[-1].astype(int) - plain[-1].astype(int)).max() > 100
    assert processor.finish() == []  # idempotent


def test_idle_tracks_have_their_clip_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    clock = [1000.0]
    monkeypatch.setattr(time, "monotonic", lambda: clock[0])
    processor = _processor(tmp_path)
    for i in range(3):
        processor.process(_frame(10 + 4 * i), NOW)

    clock[0] += 6  # the object hasn't been seen for longer than the idle limit
    result = processor.process(_frame(0, squares=0), NOW)

    assert [c.track_id for c in result.finished_clips] == [1]
    assert result.finished_clips[0].path.stat().st_size > 0
    assert processor.finish() == []


def test_camera_reader_paces_video_files_and_reports_the_end(tmp_path: Path) -> None:
    video = make_test_video(tmp_path / "cam.mp4", seconds=1, fps=30)
    camera = CameraReader(str(video))
    sequence, frames, started = 0, 0, time.monotonic()
    try:
        while not camera.ended.is_set() or camera.latest(sequence):
            latest = camera.latest(sequence)
            if latest:
                sequence, frame = latest
                frames += 1
                assert frame.shape == (240, 320, 3)
            time.sleep(0.01)
    finally:
        camera.close()

    assert sequence == 30  # every frame was read...
    assert time.monotonic() - started >= 0.9  # ...at the file's own pace (1 s of video)
    assert 0 < frames <= 30


def test_camera_reader_rejects_unopenable_sources(tmp_path: Path) -> None:
    with pytest.raises(CameraUnavailableError):
        CameraReader(str(tmp_path / "missing.mp4"))
