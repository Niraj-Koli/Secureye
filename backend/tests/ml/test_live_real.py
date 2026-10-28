"""Live processing with the real live model (bestS) on frames of a camera pan."""

from datetime import UTC, datetime
from pathlib import Path

import av
import numpy as np

from app.ml.live import LiveProcessor
from app.ml.registry import ModelRegistry
from tests.ml.test_video_real import _pan_video


def test_live_model_announces_each_soldier_once(real_models: ModelRegistry, tmp_path: Path) -> None:
    video = _pan_video(tmp_path / "pan.mp4", seconds=2)
    processor = LiveProcessor(
        real_models.live, confidence=0.4, iou=0.45, clips_dir=tmp_path / "clips", fps=10
    )
    announced: list[tuple[int, str]] = []

    with av.open(str(video)) as container:
        for index, frame in enumerate(container.decode(video=0)):
            if index % 3:  # 30 fps -> 10 fps, like a browser sending frames
                continue
            image = np.asarray(frame.to_ndarray(format="bgr24"), dtype=np.uint8)
            result = processor.process(image, datetime.now(UTC))
            announced += [(n.track_id, n.class_name) for n in result.new_objects]
    clips = processor.finish()

    assert processor.frames_processed == 20
    assert "Soldier" in {name for _, name in announced}
    track_ids = [track_id for track_id, _ in announced]
    assert len(track_ids) == len(set(track_ids))  # no object announced twice
    assert {c.track_id for c in clips} == set(track_ids)  # one clip per announced object
